import { logger } from "@/lib/logger";
import { getCacheRedis } from "@/server/services/redis";
import { broadcastToRoom } from "@/server/services/bom-room-registry";

/**
 * BOM V5 / WP9 — realtime theo "room" templateId.
 *
 * Kênh Redis riêng `${BULLMQ_PREFIX}bom:events` (staging/prod chung Redis vật
 * lý không lẫn). Chỉ truyền tín hiệu "dòng nào đổi" — client tự GET lại dữ
 * liệu (đã kiểm quyền), KHÔNG kèm nội dung.
 */
// Đọc process.env trực tiếp (cùng mặc định với lib/env) để import module này
// không kéo theo validate env bắt buộc (DATABASE_URL…) trong test các route.
export const BOM_CHANNEL = `${process.env.BULLMQ_PREFIX ?? "iot-"}bom:events`;

export type BomEventKind = "line" | "stage" | "supplier" | "import" | "slip";

export interface BomEventInput {
  templateId: string;
  lineIds?: string[];
  kind: BomEventKind;
  actorId?: string | null;
}

export interface BomEventPayload {
  templateId: string;
  /** Vắng = "không rõ/quá nhiều dòng" → client refetch cả tree (debounce). */
  lineIds?: string[];
  kind: BomEventKind;
  by: string | null;
}

/** Quá ngưỡng này thì bỏ lineIds (payload nhỏ) — client sẽ refetch cả tree. */
export const MAX_LINE_IDS_PER_EVENT = 200;

export function buildBomEventPayload(evt: BomEventInput): BomEventPayload {
  const ids = evt.lineIds ? [...new Set(evt.lineIds)] : undefined;
  const p: BomEventPayload = {
    templateId: evt.templateId,
    kind: evt.kind,
    by: evt.actorId ?? null,
  };
  if (ids && ids.length > 0 && ids.length <= MAX_LINE_IDS_PER_EVENT) p.lineIds = ids;
  return p;
}

/**
 * Publish sau khi COMMIT thành công. Fire-and-forget, KHÔNG throw — lỗi chỉ
 * log warn, không được làm hỏng request ghi.
 */
export function publishBomEvent(evt: BomEventInput): void {
  try {
    const payload = JSON.stringify(buildBomEventPayload(evt));
    void getCacheRedis()
      .publish(BOM_CHANNEL, payload)
      .catch((err: unknown) => {
        logger.warn({ err, kind: evt.kind }, "[bom-events] publish thất bại (bỏ qua)");
      });
  } catch (err) {
    logger.warn({ err, kind: evt.kind }, "[bom-events] publish lỗi đồng bộ (bỏ qua)");
  }
}

/** Xử lý 1 message Redis → fan-out vào room. Tách riêng để test. */
export function handleBomMessage(channel: string, message: string): void {
  if (channel !== BOM_CHANNEL) return;
  try {
    const p = JSON.parse(message) as BomEventPayload;
    if (!p.templateId) return;
    broadcastToRoom(p.templateId, "bom", message);
  } catch (err) {
    logger.warn({ err }, "[bom-events] parse message thất bại (bỏ qua)");
  }
}

/** Tối thiểu của ioredis subscriber (truyền từ route để module này không kéo env/ioredis). */
export interface BomSubscriberLike {
  on: (event: "message", cb: (channel: string, message: string) => void) => unknown;
  subscribe: (channel: string) => Promise<unknown>;
}

type GlobalWithBomSub = typeof globalThis & { __iotBomSubReady?: boolean };

/**
 * Route truyền vào subscriber singleton của notify-stream (ensureNotifySubscriber) (1 kết nối Redis/process):
 * thêm subscribe kênh BOM + 1 listener message. ioredis tự resubscribe sau
 * reconnect nên không cần làm lại.
 */
export function ensureBomSubscriber(sub: BomSubscriberLike): void {
  const g = globalThis as GlobalWithBomSub;
  if (g.__iotBomSubReady) return;
  sub.on("message", handleBomMessage);
  sub.subscribe(BOM_CHANNEL).catch((err: unknown) => {
    logger.warn({ err }, "[bom-events] subscribe thất bại — ioredis sẽ thử lại khi reconnect");
  });
  g.__iotBomSubReady = true;
}

/** CHỈ test. */
export function __resetBomSubscriberForTests(): void {
  (globalThis as GlobalWithBomSub).__iotBomSubReady = false;
}
