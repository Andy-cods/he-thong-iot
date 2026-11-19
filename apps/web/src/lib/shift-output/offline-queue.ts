/**
 * V4.10 (TASK-20261118-001) — hàng đợi gửi sản lượng ca khi mất mạng (Q6: chỉ
 * khi trang đang mở; KHÔNG service worker — chủ xưởng đã bỏ PWA).
 *
 * - Lưu localStorage (try/catch: chế độ riêng tư / bộ nhớ đầy → coi như rỗng).
 * - Mỗi dòng có `clientUuid` sinh ở máy → server idempotent (gửi lại nhiều lần
 *   không nhân đôi; lần sau trả 200 `replayed`).
 * - Flush qua POST /api/shift-output/entries/bulk (≤50 dòng/lượt), khi: trang mở,
 *   sự kiện `online`, mỗi 30s, bấm "Gửi lại".
 * - Kết quả: 200/201 → xoá khỏi hàng đợi; 409/422/403/404 → giữ lại trạng thái
 *   "Lỗi" kèm thông báo để người nhập xử lý (sửa/bỏ); lỗi mạng/5xx → giữ "Chờ gửi".
 */

export const OFFLINE_QUEUE_KEY = "iot.shiftOutput.queue.v1";
export const OFFLINE_BULK_SIZE = 50;
/** Sự kiện cùng tab khi hàng đợi đổi (badge "Chờ gửi" ở thanh tab nghe). */
export const OFFLINE_QUEUE_EVENT = "iot:shift-output-queue";

export interface QueuedEntry<P = Record<string, unknown>> {
  clientUuid: string;
  payload: P;
  queuedAt: string;
  attempts: number;
  status: "pending" | "failed";
  error?: { status: number; code?: string; message?: string; existingId?: string } | null;
  /** Nhãn ngắn hiển thị (máy · mã · ca) — không cần gọi API để hiện danh sách. */
  label?: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOrNull(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadQueue(storage?: StorageLike | null): QueuedEntry[] {
  const s = storageOrNull(storage);
  if (!s) return [];
  try {
    const raw = s.getItem(OFFLINE_QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as QueuedEntry[]).filter((q) => q && typeof q.clientUuid === "string") : [];
  } catch {
    return [];
  }
}

export function saveQueue(queue: QueuedEntry[], storage?: StorageLike | null): void {
  const s = storageOrNull(storage);
  if (!s) return;
  try {
    s.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    if (!storage && typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
  } catch {
    /* hết dung lượng / bị chặn — bỏ qua, hàng đợi trong bộ nhớ vẫn còn trong phiên */
  }
}

/** Thêm (hoặc thay — cùng clientUuid) 1 dòng chờ gửi. */
export function enqueue(
  queue: QueuedEntry[],
  item: { clientUuid: string; payload: Record<string, unknown>; label?: string },
  now = new Date(),
): QueuedEntry[] {
  const rest = queue.filter((q) => q.clientUuid !== item.clientUuid);
  return [
    ...rest,
    { clientUuid: item.clientUuid, payload: item.payload, label: item.label, queuedAt: now.toISOString(), attempts: 0, status: "pending", error: null },
  ];
}

export function removeFromQueue(queue: QueuedEntry[], clientUuid: string): QueuedEntry[] {
  return queue.filter((q) => q.clientUuid !== clientUuid);
}

export interface BulkResult {
  clientUuid: string;
  status: number;
  id?: string;
  code?: string;
  message?: string;
  existingId?: string;
}

export type BulkSender = (entries: Array<Record<string, unknown>>) => Promise<BulkResult[]>;

/**
 * Gửi các dòng "pending" (theo lô 50). Lỗi mạng ⇒ ném lỗi ra ngoài là KHÔNG mất
 * dữ liệu: hàng đợi giữ nguyên + tăng `attempts`.
 */
export async function flushQueue(
  queue: QueuedEntry[],
  send: BulkSender,
): Promise<{ queue: QueuedEntry[]; sent: number; failed: number; networkError: boolean }> {
  let current = [...queue];
  let sent = 0;
  let failed = 0;
  const pending = current.filter((q) => q.status === "pending");
  for (let i = 0; i < pending.length; i += OFFLINE_BULK_SIZE) {
    const batch = pending.slice(i, i + OFFLINE_BULK_SIZE);
    let results: BulkResult[];
    try {
      results = await send(batch.map((b) => ({ ...b.payload, clientUuid: b.clientUuid })));
    } catch {
      const ids = new Set(batch.map((b) => b.clientUuid));
      current = current.map((q) => (ids.has(q.clientUuid) ? { ...q, attempts: q.attempts + 1 } : q));
      return { queue: current, sent, failed, networkError: true };
    }
    const byId = new Map(results.map((r) => [r.clientUuid, r]));
    current = current.flatMap((q) => {
      const r = byId.get(q.clientUuid);
      if (!r) return [q];
      if (r.status === 200 || r.status === 201) {
        sent += 1;
        return [];
      }
      if (r.status >= 500) return [{ ...q, attempts: q.attempts + 1 }];
      failed += 1;
      return [
        {
          ...q,
          attempts: q.attempts + 1,
          status: "failed" as const,
          error: { status: r.status, code: r.code, message: r.message, existingId: r.existingId },
        },
      ];
    });
  }
  return { queue: current, sent, failed, networkError: false };
}
