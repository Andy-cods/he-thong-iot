import { z } from "zod";

/**
 * V4.10 (TASK-20261118-001) — Sản lượng ca (xưởng vệ tinh Đông Anh).
 * Zod dùng chung API ↔ client (form Nhập ca, hàng đợi offline, Lịch sử, Cài đặt).
 * Quy tắc nghiệp vụ cần ngữ cảnh (độ dài ca, khoá, lùi ngày, Σ lỗi ≤ NG…) nằm ở
 * `apps/web/src/lib/shift-output/policy.ts` — schema này chỉ chặn hình dạng + biên.
 */

/** V1 — số nguyên 0…100.000 cho mọi ô số lượng. */
export const SHIFT_QTY_MAX = 100_000;
/** Ca dài nhất cho phép nhập phút dừng (24h); thực tế ≤ shift_minutes (V4). */
export const SHIFT_MINUTES_MAX = 1440;
/** Lý do sửa/xoá dòng đã khoá (V7) tối thiểu 5 ký tự. */
export const SHIFT_REASON_MIN = 5;
/** POST /entries/bulk tối đa 50 dòng/lượt (hàng đợi offline flush). */
export const SHIFT_BULK_MAX = 50;
/** GET /entries tối đa 31 ngày / 200 dòng. */
export const SHIFT_LIST_MAX_DAYS = 31;
export const SHIFT_LIST_MAX_ROWS = 200;
/** Báo cáo tối đa 366 ngày. */
export const SHIFT_REPORT_MAX_DAYS = 366;

export const SHIFT_ENTRY_STATUSES = ["DRAFT", "SUBMITTED", "LOCKED"] as const;
export type ShiftEntryStatus = (typeof SHIFT_ENTRY_STATUSES)[number];

export const SHIFT_SETUP_KINDS = [
  "parts",
  "operators",
  "machines",
  "shifts",
  "defect-reasons",
  "downtime-reasons",
] as const;
export type ShiftSetupKind = (typeof SHIFT_SETUP_KINDS)[number];
/** Tài khoản xưởng (không có update/delete setup) chỉ được THÊM 2 danh mục này. */
export const SHIFT_SETUP_WORKSHOP_KINDS: readonly ShiftSetupKind[] = ["parts", "operators"];

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải dạng YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Ngày không hợp lệ");
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ phải dạng HH:MM");
const qty = z.number().int("Phải là số nguyên").min(0, "Không được âm").max(SHIFT_QTY_MAX, `Tối đa ${SHIFT_QTY_MAX.toLocaleString("vi-VN")}`);
const qtyPositive = qty.min(1, "Phải lớn hơn 0");
const minutes = z.number().int("Phải là số nguyên").min(0).max(SHIFT_MINUTES_MAX);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const shiftDefectLineSchema = z.object({
  reasonId: z.string().uuid(),
  qty: qtyPositive,
});

export const shiftDowntimeLineSchema = z.object({
  reasonId: z.string().uuid(),
  minutes: minutes.min(1, "Phải lớn hơn 0"),
  note: optText(200),
});

const entryFields = {
  prodDate: dateStr,
  shiftId: z.string().uuid(),
  machineId: z.string().uuid(),
  partId: z.string().uuid(),
  operatorId: z.string().uuid().nullish(),
  /** "+ Tên khác" — người phụ trách không có trong danh mục (snapshot tên). */
  operatorName: optText(120),
  qtyPlanned: qty.nullish(),
  qtyOk: qty,
  qtyNg: qty,
  qtyRework: qty.nullish(),
  /** Tổng phút dừng. Có chi tiết `downtimes` thì server lấy = Σ chi tiết. */
  downtimeMin: minutes.nullish(),
  materialLot: optText(64),
  notes: optText(1000),
  defects: z.array(shiftDefectLineSchema).max(30).default([]),
  downtimes: z.array(shiftDowntimeLineSchema).max(30).default([]),
};

function noDupReasons(
  v: { defects?: Array<{ reasonId: string }>; downtimes?: Array<{ reasonId: string }> },
  ctx: z.RefinementCtx,
) {
  for (const key of ["defects", "downtimes"] as const) {
    const list = v[key];
    if (!list) continue;
    const seen = new Set<string>();
    list.forEach((l, i) => {
      if (seen.has(l.reasonId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key, i, "reasonId"], message: "Lý do bị lặp" });
      }
      seen.add(l.reasonId);
    });
  }
}

export const shiftEntryCreateSchema = z
  .object({
    /** Sinh ở máy người nhập — gửi lại nhiều lần không nhân đôi (idempotent). */
    clientUuid: z.string().uuid(),
    /** Chỉ dùng khi user xem được nhiều site (admin); workshop luôn lấy từ scope. */
    siteId: z.string().uuid().nullish(),
    ...entryFields,
  })
  .superRefine(noDupReasons);
export type ShiftEntryCreate = z.infer<typeof shiftEntryCreateSchema>;

export const shiftEntryBulkSchema = z.object({
  entries: z.array(z.unknown()).min(1).max(SHIFT_BULK_MAX, `Tối đa ${SHIFT_BULK_MAX} dòng/lượt`),
});

export const shiftEntryPatchSchema = z
  .object({
    version: z.number().int().min(1),
    /** Bắt buộc (≥5 ký tự) khi sửa dòng đã khoá (V7). */
    reason: optText(500),
    prodDate: dateStr.optional(),
    shiftId: z.string().uuid().optional(),
    machineId: z.string().uuid().optional(),
    partId: z.string().uuid().optional(),
    operatorId: z.string().uuid().nullish(),
    operatorName: optText(120).optional(),
    qtyPlanned: qty.nullish(),
    qtyOk: qty.optional(),
    qtyNg: qty.optional(),
    qtyRework: qty.nullish(),
    downtimeMin: minutes.nullish(),
    materialLot: optText(64).optional(),
    notes: optText(1000).optional(),
    defects: z.array(shiftDefectLineSchema).max(30).optional(),
    downtimes: z.array(shiftDowntimeLineSchema).max(30).optional(),
  })
  .superRefine(noDupReasons);
export type ShiftEntryPatch = z.infer<typeof shiftEntryPatchSchema>;

export const shiftEntryDeleteSchema = z.object({
  version: z.number().int().min(1).optional(),
  reason: z.string().trim().min(SHIFT_REASON_MIN, `Lý do tối thiểu ${SHIFT_REASON_MIN} ký tự`).max(500),
});

export const shiftEntryListQuerySchema = z.object({
  siteId: z.string().uuid().optional(),
  from: dateStr,
  to: dateStr,
  shiftId: z.string().uuid().optional(),
  machineId: z.string().uuid().optional(),
  partId: z.string().uuid().optional(),
  operatorId: z.string().uuid().optional(),
  includeDeleted: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

export const shiftLockSchema = z.object({
  siteId: z.string().uuid().nullish(),
  prodDate: dateStr,
  /** Không có = chốt cả ngày. */
  shiftId: z.string().uuid().nullish(),
});

export const shiftReportQuerySchema = z.object({
  siteId: z.string().uuid().optional(),
  from: dateStr,
  to: dateStr,
  machineId: z.string().uuid().optional(),
  partId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
});

export const shiftBoardQuerySchema = z.object({
  siteId: z.string().uuid().optional(),
  date: dateStr.optional(),
});

/* ── Cài đặt (danh mục) ─────────────────────────────────────────────── */

const code = z
  .string()
  .trim()
  .min(1, "Bắt buộc nhập mã")
  .max(48)
  .regex(/^[A-Za-z0-9._\-/]+$/, "Mã chỉ gồm chữ không dấu, số, . _ - /")
  .transform((v) => v.toUpperCase());
const name = z.string().trim().min(1, "Bắt buộc nhập tên").max(200);
const sortOrder = z.number().int().min(0).max(9999).optional();
const isActive = z.boolean().optional();

export const shiftSetupSchemas = {
  parts: z.object({
    code,
    name,
    drawingNo: optText(64),
    revision: optText(16),
    customerName: optText(120),
    stdCycleSec: z.number().int().min(1).max(86_400).nullish(),
    isActive,
  }),
  operators: z.object({
    fullName: z.string().trim().min(2, "Tên tối thiểu 2 ký tự").max(120),
    shortName: optText(32),
    sortOrder,
    isActive,
  }),
  machines: z.object({ code, name, model: optText(120), sortOrder, isActive }),
  shifts: z
    .object({
      code,
      name,
      startTime: timeStr,
      endTime: timeStr,
      crossesMidnight: z.boolean().default(false),
      sortOrder,
      isActive,
    })
    .refine((v) => (v.crossesMidnight ? v.endTime < v.startTime : v.endTime > v.startTime), {
      path: ["endTime"],
      message: "Giờ kết thúc phải sau giờ bắt đầu (hoặc bật 'qua nửa đêm')",
    }),
  "defect-reasons": z.object({ code, name, sortOrder, isActive }),
  "downtime-reasons": z.object({ code, name, isPlanned: z.boolean().default(false), sortOrder, isActive }),
} as const satisfies Record<ShiftSetupKind, z.ZodTypeAny>;

/** PATCH = mọi trường tuỳ chọn (shifts kiểm cửa sổ giờ lại ở server sau khi ghép). */
export const shiftSetupPatchSchemas = {
  parts: shiftSetupSchemas.parts.partial(),
  operators: shiftSetupSchemas.operators.partial(),
  machines: shiftSetupSchemas.machines.partial(),
  shifts: z
    .object({
      code,
      name,
      startTime: timeStr,
      endTime: timeStr,
      crossesMidnight: z.boolean(),
      sortOrder,
      isActive,
    })
    .partial(),
  "defect-reasons": shiftSetupSchemas["defect-reasons"].partial(),
  "downtime-reasons": z
    .object({ code, name, isPlanned: z.boolean(), sortOrder, isActive })
    .partial(),
} as const satisfies Record<ShiftSetupKind, z.ZodTypeAny>;

export const shiftSiteUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  lockAfterHours: z.number().int().min(0).max(720).optional(),
  backdateDays: z.number().int().min(0).max(31).optional(),
  ngWarnPct: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});
