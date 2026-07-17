import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES } from "@iot/shared";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * V3.12 — Enqueue email thông báo "cần duyệt" sang worker (queue EMAIL_SEND).
 *
 * Fire-and-forget: lỗi Redis/queue chỉ log warn, KHÔNG throw — email là kênh
 * phụ, không được phá flow nghiệp vụ (giống triết lý emitNotification).
 * Worker gửi SMTP với retry 3 lần backoff exponential.
 */

let queue: Queue | null = null;
let connection: IORedis | null = null;

function getConnection() {
  if (!connection) {
    connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return connection;
}

function getEmailQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAMES.EMAIL_SEND, {
      connection: getConnection(),
      prefix: env.BULLMQ_PREFIX,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 24 * 3600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }
  return queue;
}

export interface EmailSendPayload {
  to: string;
  eventType: string;
  title: string;
  message?: string;
  entityCode?: string;
  actorUsername?: string;
  /** Link TUYỆT ĐỐI (đã ghép APP_URL). */
  link?: string;
}

/**
 * Idempotent theo notification row: jobId = `email:{notificationId}` —
 * mỗi row notification tối đa 1 email, retry route không gửi trùng.
 * Khi MAIL_ENABLED=false → skip êm (dev/local không cần Redis mail).
 */
export async function enqueueEmailSend(
  notificationId: string,
  payload: EmailSendPayload,
): Promise<void> {
  if (!env.MAIL_ENABLED) return;
  try {
    await getEmailQueue().add("send", payload, {
      jobId: `email:${notificationId}`,
    });
  } catch (err) {
    logger.warn(
      { err, notificationId, to: payload.to },
      "enqueueEmailSend failed (bỏ qua, không phá flow chính)",
    );
  }
}
