import { z } from "zod";

/**
 * V2.0 Phase 2 — schemas cho master vật liệu + quy trình.
 * Tham chiếu: packages/db/src/schema/master-data.ts.
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

/** Code phải uppercase + alphanumeric + underscore (vd "AL6061", "POM_ESD_BLK"). */
export const MATERIAL_CODE_RE = /^[A-Z0-9_]{1,64}$/;

export const PROCESS_CODE_RE = /^[A-Z0-9_]{1,64}$/;

/** Category giới hạn — UI dropdown. Có thể mở rộng sau. */
export const MATERIAL_CATEGORIES = [
  "POM",
  "PB108",
  "PVC",
  "URETHANE",
  "TEFLON",
  "BAKELITE",
  "MIKA",
  "PC",
  "PEEK",
  "ULTEM",
  "ALUMINIUM",
  "COPPER",
  "STEEL",
  "STAINLESS_STEEL",
  "DUROSTONE",
  "PI108",
  "PE_FOAM",
  "SILICON",
  "TITAN",
  "OTHER",
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const PROCESS_PRICING_UNITS = ["HOUR", "CM2", "OTHER"] as const;
export type ProcessPricingUnit = (typeof PROCESS_PRICING_UNITS)[number];

// ---------------------------------------------------------------------------
// Material
// ---------------------------------------------------------------------------

export const materialMasterCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Mã bắt buộc")
      .max(64)
      .regex(MATERIAL_CODE_RE, "Mã chỉ chứa A-Z 0-9 _ (không khoảng trắng)"),
    nameEn: z.string().trim().min(1, "Tên EN bắt buộc").max(255),
    nameVn: z.string().trim().min(1, "Tên VN bắt buộc").max(255),
    category: z
      .enum(MATERIAL_CATEGORIES)
      .optional()
      .nullable()
      .transform((v) => v ?? null),
    pricePerKg: optionalNumeric,
    densityKgM3: optionalNumeric,
    isActive: z.boolean().optional().default(true),
    notes: optionalTrim(2000),
  })
  .strict();

export const materialMasterUpdateSchema = materialMasterCreateSchema
  .partial()
  // Code không được sửa qua update — phải tạo mới (FK soft từ item.material_code).
  .omit({ code: true });

export type MaterialMasterCreate = z.infer<typeof materialMasterCreateSchema>;
export type MaterialMasterUpdate = z.infer<typeof materialMasterUpdateSchema>;

// ---------------------------------------------------------------------------
// Process
// ---------------------------------------------------------------------------

export const processMasterCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Mã bắt buộc")
      .max(64)
      .regex(PROCESS_CODE_RE, "Mã chỉ chứa A-Z 0-9 _ (không khoảng trắng)"),
    nameEn: z.string().trim().min(1, "Tên EN bắt buộc").max(255),
    nameVn: z.string().trim().min(1, "Tên VN bắt buộc").max(255),
    pricePerUnit: optionalNumeric,
    pricingUnit: z.enum(PROCESS_PRICING_UNITS).optional().default("HOUR"),
    pricingNote: optionalTrim(500),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const processMasterUpdateSchema = processMasterCreateSchema
  .partial()
  .omit({ code: true });

export type ProcessMasterCreate = z.infer<typeof processMasterCreateSchema>;
export type ProcessMasterUpdate = z.infer<typeof processMasterUpdateSchema>;
