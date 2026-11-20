/**
 * Xoá BOM từ danh sách (1 dòng hoặc hàng loạt) — quyết định THUẦN (có test).
 *
 * - Nháp / Đang dùng → "Ngừng dùng" (xoá mềm, khôi phục được).
 * - Ngừng dùng → "Xoá vĩnh viễn" (chỉ admin; API `DELETE ?hard=true`).
 *   Trước đây hàng loạt luôn gọi xoá mềm → BOM đã ngừng dùng trả 400
 *   ALREADY_OBSOLETE → "Xoá 0 thành công, 11 lỗi" mà không nói vì sao.
 */
export type BomDeleteKind = "soft" | "hard" | "forbidden";

export function bomDeleteKind(status: string, isAdmin: boolean): BomDeleteKind {
  // Cùng luật PATCH: ACTIVE → OBSOLETE chỉ admin (xoá mềm không được lách luật này).
  if (status === "ACTIVE") return isAdmin ? "soft" : "forbidden";
  if (status !== "OBSOLETE") return "soft";
  return isAdmin ? "hard" : "forbidden";
}

export const FORBIDDEN_HARD_DELETE_REASON = "Đã ngừng dùng — chỉ admin được xoá vĩnh viễn";
export const FORBIDDEN_OBSOLETE_ACTIVE_REASON = "Đang dùng — chỉ admin được chuyển Ngừng dùng";

/** Lý do không được xoá (khi bomDeleteKind = "forbidden"). */
export function bomDeleteForbiddenReason(status: string): string {
  return status === "ACTIVE" ? FORBIDDEN_OBSOLETE_ACTIVE_REASON : FORBIDDEN_HARD_DELETE_REASON;
}

export interface BulkDeleteCounts {
  soft: number;
  hard: number;
  /** Dòng Đang dùng mà không phải admin (không được chuyển Ngừng dùng). */
  forbiddenActive: number;
  /** Dòng Ngừng dùng mà không phải admin (không được xoá vĩnh viễn). */
  forbiddenObsolete: number;
}

/** B7 — đếm từng nhóm cho hộp xoá nhiều (tách lý do cấm theo trạng thái). */
export function countBulkDelete(rows: readonly { status: string }[], isAdmin: boolean): BulkDeleteCounts {
  const c: BulkDeleteCounts = { soft: 0, hard: 0, forbiddenActive: 0, forbiddenObsolete: 0 };
  for (const r of rows) {
    const k = bomDeleteKind(r.status, isAdmin);
    if (k === "soft") c.soft++;
    else if (k === "hard") c.hard++;
    else if (r.status === "ACTIVE") c.forbiddenActive++;
    else c.forbiddenObsolete++;
  }
  return c;
}

/** Mô tả hộp xác nhận xoá nhiều — câu cấm khớp ĐÚNG trạng thái dòng bị cấm (B7). */
export function bulkDeleteDescription(c: BulkDeleteCounts, obsoleteLabel: string): string {
  return [
    c.soft > 0 ? `${c.soft} BOM sẽ chuyển sang “${obsoleteLabel}” (khôi phục được).` : null,
    c.hard > 0 ? `${c.hard} BOM đã ngừng dùng sẽ bị XOÁ VĨNH VIỄN — không hoàn tác được.` : null,
    c.forbiddenActive > 0
      ? `${c.forbiddenActive} BOM đang dùng sẽ được bỏ qua (chỉ admin được chuyển Ngừng dùng).`
      : null,
    c.forbiddenObsolete > 0
      ? `${c.forbiddenObsolete} BOM đã ngừng dùng sẽ được bỏ qua (chỉ admin xoá vĩnh viễn).`
      : null,
    'Gõ "XOA" để xác nhận.',
  ]
    .filter(Boolean)
    .join(" ");
}

export interface BomDeleteResult {
  code: string;
  kind: BomDeleteKind;
  ok: boolean;
  reason?: string;
}

export interface BulkDeleteSummary {
  ok: boolean;
  title: string;
  /** Từng BOM lỗi "MÃ: lý do" (tối đa `maxLines`, dòng cuối "… và N BOM khác"). */
  failureLines: string[];
}

export function summarizeBulkDelete(results: readonly BomDeleteResult[], maxLines = 8): BulkDeleteSummary {
  const soft = results.filter((r) => r.ok && r.kind === "soft").length;
  const hard = results.filter((r) => r.ok && r.kind === "hard").length;
  const failed = results.filter((r) => !r.ok);
  const parts: string[] = [];
  if (soft > 0) parts.push(`đã chuyển Ngừng dùng ${soft} BOM`);
  if (hard > 0) parts.push(`đã xoá vĩnh viễn ${hard} BOM`);
  const done = parts.length > 0 ? parts.join(", ") : "không BOM nào được xoá";
  const title =
    failed.length === 0
      ? capitalize(done) + "."
      : `${capitalize(done)} · ${failed.length} BOM không xoá được`;
  const failureLines = failed.slice(0, maxLines).map((f) => `${f.code}: ${f.reason ?? "Lỗi không xác định"}`);
  if (failed.length > maxLines) failureLines.push(`… và ${failed.length - maxLines} BOM khác`);
  return { ok: failed.length === 0, title, failureLines };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
