import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";
import { QUEUE_NAMES } from "@iot/shared";
import {
  registerQueueDepthGauge,
  startWorkerTelemetry,
} from "./telemetry.js";

// Start OTel SDK trước khi khởi tạo Worker để auto-instrumentation (pg,
// ioredis) catch được span gốc. Nếu ENV chưa set, hàm return ngay.
await startWorkerTelemetry();
import {
  processItemImportCommit,
  type ItemImportCommitJob,
} from "./jobs/itemImport.js";
import {
  processBomImportCommit,
  type BomImportCommitJob,
} from "./jobs/bomImport.js";
import {
  processEcoApplyBatch,
  type EcoApplyBatchJob,
} from "./jobs/ecoApply.js";
import { eq } from "drizzle-orm";
import { importBatch } from "@iot/db/schema";
import { db, pgClient } from "./db.js";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "iot-worker", env: process.env.NODE_ENV ?? "development" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379/2";
const prefix = process.env.BULLMQ_PREFIX ?? "iot-";

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on("error", (err) => logger.error({ err }, "redis error"));
connection.on("ready", () => logger.info("redis ready"));

interface AssemblyScanSyncJob {
  aoId: string;
  deviceId: string;
  batchSize: number;
}

const itemImportCommitWorker = new Worker<ItemImportCommitJob>(
  QUEUE_NAMES.ITEM_IMPORT_COMMIT,
  async (job) => {
    logger.info(
      { jobId: job.id, batchId: job.data.batchId },
      "item-import-commit: start",
    );
    const res = await processItemImportCommit(job);
    logger.info(
      { jobId: job.id, batchId: job.data.batchId, res },
      "item-import-commit: done",
    );
    return res;
  },
  {
    connection,
    prefix,
    concurrency: 1,
  },
);

const bomImportCommitWorker = new Worker<BomImportCommitJob>(
  QUEUE_NAMES.BOM_IMPORT_COMMIT,
  async (job) => {
    logger.info(
      { jobId: job.id, batchId: job.data.batchId },
      "bom-import-commit: start",
    );
    const res = await processBomImportCommit(job);
    logger.info(
      { jobId: job.id, batchId: job.data.batchId, res },
      "bom-import-commit: done",
    );
    return res;
  },
  {
    connection,
    prefix,
    concurrency: 1,
    // Multi-sheet import (4 sheet × ~50 row) vượt default 30s lock.
    // 60s đủ cho fileset ~400 rows, auto-create item ON CONFLICT.
    lockDuration: 60_000,
  },
);

const assemblyScanWorker = new Worker<AssemblyScanSyncJob>(
  QUEUE_NAMES.ASSEMBLY_SCAN_SYNC,
  async (job: Job<AssemblyScanSyncJob>) => {
    logger.info(
      { jobId: job.id, data: job.data },
      "assembly-scan-sync: stub, chưa xử lý (tuần 8)",
    );
    return { status: "stub" };
  },
  {
    connection,
    prefix,
    concurrency: 2,
  },
);

const ecoApplyBatchWorker = new Worker<EcoApplyBatchJob>(
  QUEUE_NAMES.ECO_APPLY_BATCH,
  async (job) => {
    logger.info(
      { jobId: job.id, ecoId: job.data.ecoId },
      "eco-apply-batch: start",
    );
    const res = await processEcoApplyBatch(job);
    logger.info(
      { jobId: job.id, ecoId: job.data.ecoId, res },
      "eco-apply-batch: done",
    );
    return res;
  },
  {
    connection,
    prefix,
    concurrency: 1,
    lockDuration: 120_000,
  },
);

for (const w of [
  itemImportCommitWorker,
  bomImportCommitWorker,
  assemblyScanWorker,
  ecoApplyBatchWorker,
]) {
  w.on("ready", () => logger.info({ queue: w.name }, "worker ready"));
  w.on("failed", (job, err) => {
    logger.error({ queue: w.name, jobId: job?.id, err }, "job failed");
    // V3.11.2 — commit job fail → set import_batch="failed" để UI không kẹt
    // mãi ở "committing" (trước đây failed handler chỉ log, không cập nhật batch).
    // V3.11.4 (audit W.6) — CHỈ set failed khi đã hết attempt (attemptsMade >=
    // attempts). Nếu còn retry, để nguyên "committing" — nếu không UI nhấp nháy
    // failed↔committing và attempt cuối done có thể bị handler ghi đè "failed".
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 1;
    if (attemptsMade < maxAttempts) {
      logger.info(
        { queue: w.name, jobId: job?.id, attemptsMade, maxAttempts },
        "job failed nhưng còn retry — chưa set batch failed",
      );
      return;
    }
    const batchId = (job?.data as { batchId?: string } | undefined)?.batchId;
    const isCommit =
      w.name === QUEUE_NAMES.BOM_IMPORT_COMMIT ||
      w.name === QUEUE_NAMES.ITEM_IMPORT_COMMIT;
    if (batchId && isCommit) {
      void db
        .update(importBatch)
        .set({
          status: "failed",
          errorMessage: String(err?.message ?? err).slice(0, 2000),
          finishedAt: new Date(),
        })
        .where(eq(importBatch.id, batchId))
        .catch((e) => logger.error({ e, batchId }, "mark batch failed error"));
    }
  });
  w.on("completed", (job) =>
    logger.info({ queue: w.name, jobId: job.id }, "job completed"),
  );
}

// V1.4 Phase E: Queue read-only handle cho observability (getJobCounts).
// Worker instance không expose getJobCounts trực tiếp → phải dùng Queue.
const metricQueues = {
  [QUEUE_NAMES.ITEM_IMPORT_COMMIT]: new Queue(
    QUEUE_NAMES.ITEM_IMPORT_COMMIT,
    { connection, prefix },
  ),
  [QUEUE_NAMES.BOM_IMPORT_COMMIT]: new Queue(
    QUEUE_NAMES.BOM_IMPORT_COMMIT,
    { connection, prefix },
  ),
  [QUEUE_NAMES.ASSEMBLY_SCAN_SYNC]: new Queue(
    QUEUE_NAMES.ASSEMBLY_SCAN_SYNC,
    { connection, prefix },
  ),
  [QUEUE_NAMES.ECO_APPLY_BATCH]: new Queue(
    QUEUE_NAMES.ECO_APPLY_BATCH,
    { connection, prefix },
  ),
};
registerQueueDepthGauge(metricQueues);

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down worker");
  // V3.11.4 (audit W.7) — đóng workers (chờ job active xong), queue, Redis VÀ
  // pg client. Có deadline 110s (< stop_grace_period 120s của compose) để không
  // bị SIGKILL giữa chừng làm batch kẹt "committing".
  const graceful = (async () => {
    await Promise.all([
      itemImportCommitWorker.close(),
      bomImportCommitWorker.close(),
      assemblyScanWorker.close(),
      ecoApplyBatchWorker.close(),
      ...Object.values(metricQueues).map((q) => q.close()),
    ]);
    await connection.quit();
    await pgClient.end({ timeout: 5 });
  })();
  const deadline = new Promise<void>((resolve) =>
    setTimeout(resolve, 110_000),
  );
  await Promise.race([graceful, deadline]);
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

logger.info(
  {
    queues: [
      QUEUE_NAMES.ITEM_IMPORT_COMMIT,
      QUEUE_NAMES.BOM_IMPORT_COMMIT,
      QUEUE_NAMES.ASSEMBLY_SCAN_SYNC,
      QUEUE_NAMES.ECO_APPLY_BATCH,
    ],
    prefix,
  },
  "iot-worker started",
);
