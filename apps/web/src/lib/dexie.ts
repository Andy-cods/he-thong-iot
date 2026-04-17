/**
 * Dexie — IndexedDB schema cho PWA offline queue.
 *
 * Version 1 chỉ cook `scanQueue` (T9 minimum viable). Các bảng po_cache /
 * failed_queue defer Phase 3f theo implementation-plan §5.6.2.
 *
 * Ràng buộc design (brainstorm-deep §2.5):
 * - Key primary `id` = UUID v7 client-generated → sort FIFO.
 * - Idempotent: replay server không gây duplicate (server check event_id).
 * - Persist sau F5 + offline refresh OK.
 */

import Dexie, { type Table } from "dexie";

export type ScanStatus = "pending" | "syncing" | "synced" | "failed";

export interface ScanEvent {
  /** UUID v7 client-generated. Primary key. */
  id: string;
  /** PO liên quan — dùng index để query theo PO nhanh. */
  poId: string;
  /** SKU hoặc barcode quét được. */
  code: string;
  /** ID dòng PO đã match (nếu có). Null = unmatched → cần resolve trước sync. */
  lineId: string | null;
  /** Số lượng nhận. */
  qty: number;
  /** Lô hàng (nếu item lot-tracked). */
  lotNo: string | null;
  /** Kết quả QC nhanh khi quét. */
  qcStatus: "pass" | "fail" | "pending";
  qcNote: string | null;
  /** Trạng thái sync ra server. */
  status: ScanStatus;
  /** Số lần retry đã thử. */
  retryCount: number;
  /** Lý do fail gần nhất — debug. */
  lastError: string | null;
  /** Timestamp tạo (ms). Cũng encode trong UUID v7. */
  createdAt: number;
  /** Timestamp sync thành công (ms). */
  syncedAt: number | null;
}

class IoTPwaDB extends Dexie {
  scanQueue!: Table<ScanEvent, string>;

  constructor() {
    super("iot-pwa");
    this.version(1).stores({
      // Primary key `id`, index `poId + createdAt` và `status` cho badge count.
      scanQueue: "id, poId, createdAt, status, [poId+status]",
    });
  }
}

/**
 * Singleton instance. Chỉ khởi tạo trong browser — guard SSR.
 * Dùng `getDB()` thay vì export trực tiếp để tránh Dexie try mở IndexedDB
 * trong Node runtime khi RSC build.
 */
let _db: IoTPwaDB | null = null;
export function getDB(): IoTPwaDB {
  if (typeof window === "undefined") {
    throw new Error("Dexie chỉ chạy trên browser — đừng gọi trong RSC.");
  }
  if (!_db) _db = new IoTPwaDB();
  return _db;
}

/** Helper — đếm events `pending`/`failed` của 1 PO (hoặc tất cả). */
export async function countPendingScans(poId?: string): Promise<number> {
  const db = getDB();
  if (poId) {
    return db.scanQueue
      .where("[poId+status]")
      .anyOf([
        [poId, "pending"],
        [poId, "failed"],
      ])
      .count();
  }
  return db.scanQueue
    .where("status")
    .anyOf(["pending", "failed"])
    .count();
}
