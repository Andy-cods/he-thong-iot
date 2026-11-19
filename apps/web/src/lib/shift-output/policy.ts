import { SHIFT_REASON_MIN } from "@iot/shared";
import { diffDays, shiftStartEnd, type ShiftWindowLike } from "./shift-window";

/**
 * V4.10 (TASK-20261118-001) — quy tắc nghiệp vụ dòng sản lượng ca (V1–V8 trong
 * PLAN §2). Hàm THUẦN, dùng chung server (chặn thật) + client (báo sớm, hỏi
 * xác nhận). Sản xuất = OK + NG.
 *
 *  V1 OK+NG > 0 trừ khi có dừng máy           → lỗi NO_OUTPUT
 *  V2 rework ≤ NG; Σ chi tiết lỗi ≤ NG         → lỗi; Σ < NG → cảnh báo vàng "chưa phân loại"
 *  V3 %NG > ngưỡng site / OK > 2× TB 30 ngày   → cảnh báo cần xác nhận
 *  V4 phút dừng ≤ phút ca                       → lỗi
 *  V6 ngày tương lai → lỗi; lùi quá N ngày      → cần quyền approve
 *  V7 dòng đã khoá: cần approve + lý do ≥ 5 ký tự
 */

export interface PolicyIssue {
  code:
    | "NO_OUTPUT"
    | "REWORK_OVER_NG"
    | "DEFECT_OVER_NG"
    | "DOWNTIME_OVER_SHIFT"
    | "FUTURE_DATE"
    | "BACKDATE_LIMIT"
    | "UNCLASSIFIED_NG"
    | "HIGH_NG"
    | "OK_SPIKE";
  message: string;
  field?: string;
}

export interface EntryDraft {
  prodDate: string;
  qtyOk: number;
  qtyNg: number;
  qtyRework?: number | null;
  downtimeMin?: number | null;
  defects?: ReadonlyArray<{ qty: number }>;
  downtimes?: ReadonlyArray<{ minutes: number }>;
}

export interface PolicyContext {
  /** Snapshot độ dài ca (phút). */
  shiftMinutes: number;
  /** Hôm nay theo giờ site ("YYYY-MM-DD"). */
  today: string;
  backdateDays: number;
  /** Có quyền `approve:shiftOutput` (nhập lùi quá hạn). */
  canApprove: boolean;
  ngWarnPct: number;
  /** TB OK/dòng 30 ngày gần nhất của (máy, mã hàng) — null khi chưa có lịch sử. */
  avgOk30?: number | null;
}

export interface PolicyResult {
  errors: PolicyIssue[];
  /** Cảnh báo không chặn lưu. `HIGH_NG` / `OK_SPIKE` → client hỏi "Bạn chắc chứ?". */
  warnings: PolicyIssue[];
  /** Tổng phút dừng sẽ lưu: có chi tiết → Σ chi tiết; không → số nhập (hoặc null). */
  downtimeMin: number | null;
}

export const CONFIRM_WARNING_CODES: ReadonlyArray<PolicyIssue["code"]> = ["HIGH_NG", "OK_SPIKE"];

const sum = (xs: ReadonlyArray<number>) => xs.reduce((a, b) => a + b, 0);

export function effectiveDowntime(d: Pick<EntryDraft, "downtimeMin" | "downtimes">): number | null {
  if (d.downtimes && d.downtimes.length > 0) return sum(d.downtimes.map((x) => x.minutes));
  return d.downtimeMin ?? null;
}

export function ngPercent(ok: number, ng: number): number | null {
  const produced = ok + ng;
  return produced > 0 ? (ng / produced) * 100 : null;
}

export function validateEntry(d: EntryDraft, ctx: PolicyContext): PolicyResult {
  const errors: PolicyIssue[] = [];
  const warnings: PolicyIssue[] = [];
  const downtimeMin = effectiveDowntime(d);
  const defectSum = sum((d.defects ?? []).map((x) => x.qty));

  if (d.qtyOk + d.qtyNg <= 0 && (downtimeMin ?? 0) <= 0) {
    errors.push({ code: "NO_OUTPUT", field: "qtyOk", message: "Chưa có số lượng: nhập OK/NG hoặc ghi thời gian dừng máy." });
  }
  if (d.qtyRework != null && d.qtyRework > d.qtyNg) {
    errors.push({ code: "REWORK_OVER_NG", field: "qtyRework", message: "SL sửa lại không được lớn hơn SL NG." });
  }
  if (defectSum > d.qtyNg) {
    errors.push({
      code: "DEFECT_OVER_NG",
      field: "defects",
      message: `Tổng chi tiết lỗi (${defectSum}) lớn hơn SL NG (${d.qtyNg}).`,
    });
  } else if (d.qtyNg > 0 && defectSum < d.qtyNg) {
    warnings.push({
      code: "UNCLASSIFIED_NG",
      field: "defects",
      message: `Còn ${d.qtyNg - defectSum} NG chưa phân loại lý do.`,
    });
  }
  if (downtimeMin != null && downtimeMin > ctx.shiftMinutes) {
    errors.push({
      code: "DOWNTIME_OVER_SHIFT",
      field: "downtimeMin",
      message: `Thời gian dừng (${downtimeMin}') vượt độ dài ca (${ctx.shiftMinutes}').`,
    });
  }

  const ago = diffDays(d.prodDate, ctx.today);
  if (ago < 0) {
    errors.push({ code: "FUTURE_DATE", field: "prodDate", message: "Không nhập sản lượng cho ngày tương lai." });
  } else if (ago > ctx.backdateDays && !ctx.canApprove) {
    errors.push({
      code: "BACKDATE_LIMIT",
      field: "prodDate",
      message: `Chỉ nhập lùi tối đa ${ctx.backdateDays} ngày. Nhờ quản lý nhập hộ ngày cũ hơn.`,
    });
  }

  const pct = ngPercent(d.qtyOk, d.qtyNg);
  if (pct != null && pct > ctx.ngWarnPct) {
    warnings.push({
      code: "HIGH_NG",
      field: "qtyNg",
      message: `Tỉ lệ NG ${pct.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% vượt ngưỡng ${ctx.ngWarnPct}%.`,
    });
  }
  if (ctx.avgOk30 != null && ctx.avgOk30 > 0 && d.qtyOk > 2 * ctx.avgOk30) {
    warnings.push({
      code: "OK_SPIKE",
      field: "qtyOk",
      message: `SL OK ${d.qtyOk.toLocaleString("vi-VN")} gấp hơn 2 lần trung bình 30 ngày (${Math.round(ctx.avgOk30).toLocaleString("vi-VN")}). Có gõ thừa số 0?`,
    });
  }
  return { errors, warnings, downtimeMin };
}

/* ── Khoá dòng ─────────────────────────────────────────────────────────── */

export interface LockableEntry {
  status: string;
  prodDate: string;
}

/** Hạn tự khoá = kết thúc ca + lock_after_hours. */
export function lockDeadline(
  prodDate: string,
  shift: Pick<ShiftWindowLike, "startTime" | "endTime" | "crossesMidnight">,
  lockAfterHours: number,
  tz?: string,
): Date {
  const { end } = shiftStartEnd(prodDate, shift, tz);
  return new Date(end.getTime() + lockAfterHours * 3_600_000);
}

/** Khoá tính tại chỗ: `status = LOCKED` HOẶC đã quá kết thúc ca + lock_after_hours. */
export function isEntryLocked(
  e: LockableEntry,
  shift: Pick<ShiftWindowLike, "startTime" | "endTime" | "crossesMidnight">,
  site: { lockAfterHours: number; timezone?: string },
  now: Date,
): boolean {
  if (e.status === "LOCKED") return true;
  return now.getTime() > lockDeadline(e.prodDate, shift, site.lockAfterHours, site.timezone).getTime();
}

export type WriteDenial =
  | { code: "LOCKED"; status: 403; message: string }
  | { code: "REASON_REQUIRED"; status: 422; message: string };

/** V7 — sửa/xoá dòng đã khoá: cần `approve` + lý do ≥ 5 ký tự. */
export function checkLockedWrite(locked: boolean, canApprove: boolean, reason: string | null | undefined): WriteDenial | null {
  if (!locked) return null;
  if (!canApprove) {
    return { code: "LOCKED", status: 403, message: "Ca đã khoá. Nhờ quản lý sửa (kèm lý do)." };
  }
  if (!reason || reason.trim().length < SHIFT_REASON_MIN) {
    return { code: "REASON_REQUIRED", status: 422, message: `Dòng đã khoá: phải nhập lý do sửa (≥ ${SHIFT_REASON_MIN} ký tự).` };
  }
  return null;
}
