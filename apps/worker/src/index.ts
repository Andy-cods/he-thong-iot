import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";
import { QUEUE_NAMES } from "@iot/shared";
import {
  processItemImportCommit,
  type ItemImportCommitJob,
} from "./jobs/itemImport.js";
import {
  processBomImportCommit,
  type BomImportCommitJob,
} from "./jobs/bomImport.js";

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

for (const w of [
  itemImportCommitWorker,
  bomImportCommitWorker,
  assemblyScanWorker,
]) {
  w.on("ready", () => logger.info({ queue: w.name }, "worker ready"));
  w.on("failed", (job, err) =>
    logger.error({ queue: w.name, jobId: job?.id, err }, "job failed"),
  );
  w.on("completed", (job) =>
    logger.info({ queue: w.name, jobId: job.id }, "job completed"),
  );
}

const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutting down worker");
  await Promise.all([
    itemImportCommitWorker.close(),
    bomImportCommitWorker.close(),
    assemblyScanWorker.close(),
  ]);
  await connection.quit();
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
    ],
    prefix,
  },
  "iot-worker started",
);
