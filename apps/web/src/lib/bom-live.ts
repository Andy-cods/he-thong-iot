/**
 * BOM V5 / WP9 — phần THUẦN của realtime phía client (test được bằng vitest):
 * vá cache tree theo các dòng vừa nạp lại + trạng thái SSE để chỉnh chu kỳ poll.
 */

export interface PatchableLine {
  id: string;
  parentLineId: string | null;
  level: number;
  position: number;
  rowVersion?: number;
}

export interface PatchResult<T extends PatchableLine> {
  tree: T[];
  /** true = cấu trúc đổi (thêm/xoá/chuyển dòng) → phải refetch cả tree. */
  needsRefetch: boolean;
  /** số dòng đã vá tại chỗ */
  patched: number;
}

/**
 * Vá `tree` (mảng phẳng) bằng `fetched` (dòng mới nạp cho `requestedIds`).
 * - id có trong cả hai → thay tại chỗ (giữ thứ tự), trừ khi cha/level/position đổi → needsRefetch.
 * - id yêu cầu nhưng không có trong `fetched` mà đang có trong tree → đã xoá → needsRefetch.
 * - dòng mới (chưa có trong tree) → needsRefetch, trừ khi nó thuộc nhánh cha
 *   không nằm trong tree này (sheet khác) — bỏ qua.
 * Không mutate input; không đổi tham chiếu nếu không có gì đổi.
 */
export function patchTreeLines<T extends PatchableLine>(
  tree: T[],
  fetched: T[],
  requestedIds: string[],
): PatchResult<T> {
  const index = new Map<string, number>();
  tree.forEach((n, i) => index.set(n.id, i));
  const fetchedById = new Map(fetched.map((n) => [n.id, n]));
  let needsRefetch = false;
  let patched = 0;
  let next: T[] | null = null;

  for (const id of requestedIds) {
    const idx = index.get(id);
    const fresh = fetchedById.get(id);
    if (idx === undefined) {
      if (fresh && (fresh.parentLineId === null || index.has(fresh.parentLineId))) {
        needsRefetch = true;
      }
      continue;
    }
    if (!fresh) {
      needsRefetch = true;
      continue;
    }
    const old = (next ?? tree)[idx]!;
    if (
      old.parentLineId !== fresh.parentLineId ||
      old.level !== fresh.level ||
      old.position !== fresh.position
    ) {
      needsRefetch = true;
    }
    if (!next) next = tree.slice();
    next[idx] = fresh;
    patched++;
  }
  return { tree: next ?? tree, needsRefetch, patched };
}

// ---------------------------------------------------------------------------
// Trạng thái SSE (module-level, dùng chung mọi hook) → chu kỳ poll an toàn.
// ---------------------------------------------------------------------------

export const POLL_FAST_MS = 60_000;
export const POLL_SAFETY_MS = 300_000;
/** Mất SSE quá ngưỡng này mới coi là "không khoẻ" và quay về poll nhanh. */
export const SSE_GRACE_MS = 30_000;

let healthy = false;

export function setBomLiveHealthy(v: boolean): void {
  healthy = v;
}
export function isBomLiveHealthy(): boolean {
  return healthy;
}
/** Dùng làm `refetchInterval` của react-query (hàm được đánh giá lại mỗi chu kỳ). */
export function bomPollMs(): number {
  return healthy ? POLL_SAFETY_MS : POLL_FAST_MS;
}
