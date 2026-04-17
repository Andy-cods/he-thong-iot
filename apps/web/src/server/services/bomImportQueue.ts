import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES } from "@iot/shared";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379/2";
const prefix = process.env.BULLMQ_PREFIX ?? "iot-";

let queue: Queue | null = null;
let connection: IORedis | null = null;

function getConnection() {
  if (!connection) {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return connection;
}

export function getBomImportQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAMES.BOM_IMPORT_COMMIT, {
      connection: getConnection(),
      prefix,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 7 * 24 * 3600, count: 200 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    });
  }
  return queue;
}

export interface BomImportCommitPayload {
  batchId: string;
  fileHash: string;
  actorId: string;
  selectedSheets: string[];
  mappings: Record<string, Record<string, string | null>>;
  autoCreateMissingItems: boolean;
  duplicateMode: "skip" | "upsert" | "error";
}

export async function enqueueBomImportCommit(payload: BomImportCommitPayload) {
  const q = getBomImportQueue();
  return q.add("commit", payload, { jobId: payload.batchId });
}
