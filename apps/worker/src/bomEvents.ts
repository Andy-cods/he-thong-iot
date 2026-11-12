import IORedis from "ioredis";

/**
 * BOM V5 / WP9 — publish tín hiệu realtime từ worker (cùng kênh với web:
 * `${BULLMQ_PREFIX}bom:events`). Pub/sub không phụ thuộc DB index nên dùng
 * chung REDIS_URL/BULLMQ_PREFIX là đủ. Fire-and-forget, KHÔNG throw.
 */
let pub: IORedis | null = null;

export function bomEventsChannel(): string {
  return `${process.env.BULLMQ_PREFIX ?? "iot-"}bom:events`;
}

export function publishBomEvent(evt: {
  templateId: string;
  kind: "line" | "stage" | "supplier" | "import" | "slip";
  lineIds?: string[];
  actorId?: string | null;
}): void {
  try {
    if (!pub) {
      pub = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379/2", {
        maxRetriesPerRequest: 2,
        enableReadyCheck: false,
      });
      pub.on("error", () => {
        /* chỉ cần không crash — publish lỗi thì client dùng poll dự phòng */
      });
    }
    const payload = JSON.stringify({
      templateId: evt.templateId,
      kind: evt.kind,
      by: evt.actorId ?? null,
      ...(evt.lineIds && evt.lineIds.length > 0 && evt.lineIds.length <= 200
        ? { lineIds: evt.lineIds }
        : {}),
    });
    void pub.publish(bomEventsChannel(), payload).catch(() => undefined);
  } catch {
    /* bỏ qua */
  }
}
