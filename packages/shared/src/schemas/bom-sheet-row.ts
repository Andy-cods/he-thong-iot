import { z } from "zod";

/**
 * V2.0 Sprint 6 FIX — Zod schemas cho material_row + process_row CRUD.
 */

const optionalNumeric = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : null;
  });

const optionalTrim = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : (v ?? null)));

// ---------------------------------------------------------------------------
// Material row
// ---------------------------------------------------------------------------

export const MATERIAL_ROW_STATUSES = [
  "PLANNED",
  "ORDERED",
  "DELIVERED",
  "QC_PASS",
  "CANCELLED",
] as const;
export type MaterialRowStatus = (typeof MATERIAL_ROW_STATUSES)[number];

export const MATERIAL_ROW_STATUS_LABELS: Record<MaterialRowStatus, string> = {
  PLANNED: "Đã lên kế hoạch",
  ORDERED: "Đã đặt",
  DELIVERED: "Đã giao về",
  QC_PASS: "QC pass",
  CANCELLED: "Đã hủy",
};

export const MATERIAL_ROW_STATUS_COLORS: Record<MaterialRowStatus, string> = {
  PLANNED: "zinc",
  ORDERED: "amber",
  DELIVERED: "blue",
  QC_PASS: "emerald",
  CANCELLED: "red",
};

export const blankSizeSchema = z
  .object({
    l_mm: z.number().positive().optional(),
    w_mm: z.number().positive().optional(),
    t_mm: z.number().positive().optional(),
    shape: z.string().trim().max(64).optional(),
    qty_pcs: z.number().int().positive().optional(),
    freeText: z.string().trim().max(255).optional(),
    /**
     * V2.0 TASK-20260427-026 — % hao hụt vật liệu (0..100). Lưu vào blankSize
     * jsonb để tránh migration mới trên DB. Chỉ áp dụng cho material row;
     * Process row chưa hỗ trợ.
     */
    scrapPct: z.number().min(0).max(100).optional(),
  })
  .strict()
  .partial();

export type BlankSize = z.infer<typeof blankSizeSchema>;

export const materialRowCreateSchema = z
  .object({
    materialCode: optionalTrim(64),
    nameOverride: optionalTrim(255),
    componentLineId: z.string().uuid().optional().nullable(),
    pricePerKg: optionalNumeric,
    qtyKg: optionalNumeric,
    blankSize: blankSizeSchema.optional(),
    supplierCode: optionalTrim(64),
    status: z.enum(MATERIAL_ROW_STATUSES).optional().default("PLANNED"),
    purchaseOrderCode: optionalTrim(64),
    notes: optionalTrim(2000),
    position: z.coerce.number().int().min(1).optional(),
  })
  .strict();

export const materialRowUpdateSchema = materialRowCreateSchema.partial();

export type MaterialRowCreate = z.infer<typeof materialRowCreateSchema>;
export type MaterialRowUpdate = z.infer<typeof materialRowUpdateSchema>;

// ---------------------------------------------------------------------------
// Process row
// ---------------------------------------------------------------------------

export const PROCESS_ROW_PRICING_UNITS = ["HOUR", "CM2", "OTHER"] as const;
export type ProcessRowPricingUnit =
  (typeof PROCESS_ROW_PRICING_UNITS)[number];

export const processRowCreateSchema = z
  .object({
    processCode: optionalTrim(64),
    nameOverride: optionalTrim(255),
    componentLineId: z.string().uuid().optional().nullable(),
    hoursEstimated: optionalNumeric,
    pricePerUnit: optionalNumeric,
    pricingUnit: z.enum(PROCESS_ROW_PRICING_UNITS).optional().default("HOUR"),
    stationCode: optionalTrim(64),
    notes: optionalTrim(2000),
    position: z.coerce.number().int().min(1).optional(),
  })
  .strict();

export const processRowUpdateSchema = processRowCreateSchema.partial();

export type ProcessRowCreate = z.infer<typeof processRowCreateSchema>;
export type ProcessRowUpdate = z.infer<typeof processRowUpdateSchema>;
