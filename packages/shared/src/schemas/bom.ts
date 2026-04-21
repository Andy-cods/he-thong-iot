import { z } from "zod";

/** BOM code: UPPER alnum + `_-`, 2-64 ký tự. */
export const BOM_CODE_REGEX = /^[A-Z0-9][A-Z0-9_\-]{1,63}$/;
export const BOM_STATUSES = ["DRAFT", "ACTIVE", "OBSOLETE"] as const;
export type BomStatus = (typeof BOM_STATUSES)[number];

export const BOM_STATUS_LABELS: Record<BomStatus, string> = {
  DRAFT: "Nháp",
  ACTIVE: "Đang dùng",
  OBSOLETE: "Ngừng dùng",
};

/** Depth tối đa tree (cả client + server enforce). */
export const BOM_MAX_LEVEL = 5;

/** Target field của BOM import (sheet row). */
export const BOM_IMPORT_TARGET_FIELDS = [
  "componentSku",
  "qtyPerParent",
  "description",
  "supplierItemCode",
  "size",
  "componentSeq",
  "notes",
] as const;
export type BomImportTargetField = (typeof BOM_IMPORT_TARGET_FIELDS)[number];

export const bomStatusSchema = z.enum(BOM_STATUSES);

export const bomTemplateCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .transform((v) => v.toUpperCase())
    .refine((v) => BOM_CODE_REGEX.test(v), {
      message: "Mã BOM không hợp lệ (A-Z, 0-9, _-; 2-64 ký tự)",
    }),
  name: z.string().trim().min(2, "Tên BOM tối thiểu 2 ký tự").max(255),
  description: z.string().trim().max(2000).optional().nullable(),
  parentItemId: z.string().uuid().optional().nullable(),
  targetQty: z.coerce
    .number()
    .positive("Số lượng target phải > 0")
    .default(1),
});

export const bomTemplateUpdateSchema = bomTemplateCreateSchema
  .omit({ code: true })
  .partial()
  .extend({
    status: bomStatusSchema.optional(),
  });

export const bomTemplateListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z
    .union([bomStatusSchema, z.array(bomStatusSchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  hasComponents: z
    .union([z.enum(["true", "false"]), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
  sort: z.enum(["updatedAt", "code", "name"]).default("updatedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export const bomCheckCodeQuerySchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .transform((v) => v.toUpperCase()),
  excludeId: z.string().uuid().optional(),
});

export const bomTemplateCloneSchema = z.object({
  newCode: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .transform((v) => v.toUpperCase())
    .refine((v) => BOM_CODE_REGEX.test(v), {
      message: "Mã BOM không hợp lệ",
    }),
  newName: z.string().trim().min(2).max(255).optional(),
});

export const bomLineCreateSchema = z.object({
  parentLineId: z.string().uuid().optional().nullable(),
  componentItemId: z.string().uuid(),
  qtyPerParent: z.coerce.number().positive("Số lượng phải > 0"),
  scrapPercent: z.coerce
    .number()
    .min(0, "Scrap không được < 0")
    .max(100, "Scrap không được > 100")
    .default(0),
  position: z.coerce.number().int().positive().optional(),
  uom: z.string().trim().max(32).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  supplierItemCode: z.string().trim().max(128).optional().nullable(),
});

export const bomLineUpdateSchema = z.object({
  qtyPerParent: z.coerce.number().positive().optional(),
  scrapPercent: z.coerce.number().min(0).max(100).optional(),
  uom: z.string().trim().max(32).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  supplierItemCode: z.string().trim().max(128).optional().nullable(),
  /** V1.7-beta.2 — metadata tự do (vd: `{ size: "50x50x10" }`). */
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const bomLineMoveSchema = z.object({
  newParentLineId: z.string().uuid().optional().nullable(),
  newPosition: z.coerce.number().int().positive(),
});

export const bomLineDeleteQuerySchema = z.object({
  cascade: z
    .union([z.enum(["true", "false"]), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return false;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
});

/** Mapping sheet column → target field. */
export const bomImportMapSchema = z.record(
  z.string(),
  z.enum(BOM_IMPORT_TARGET_FIELDS).nullable(),
);

export const bomImportCommitSchema = z.object({
  selectedSheets: z.array(z.string()).min(1, "Phải chọn ít nhất 1 sheet"),
  mappings: z.record(z.string(), bomImportMapSchema),
  autoCreateMissingItems: z.coerce.boolean().default(false),
  duplicateMode: z.enum(["skip", "upsert", "error"]).default("skip"),
});

export type BomTemplateCreate = z.infer<typeof bomTemplateCreateSchema>;
export type BomTemplateUpdate = z.infer<typeof bomTemplateUpdateSchema>;
export type BomTemplateListQuery = z.infer<typeof bomTemplateListQuerySchema>;
export type BomTemplateClone = z.infer<typeof bomTemplateCloneSchema>;
export type BomLineCreate = z.infer<typeof bomLineCreateSchema>;
export type BomLineUpdate = z.infer<typeof bomLineUpdateSchema>;
export type BomLineMove = z.infer<typeof bomLineMoveSchema>;
export type BomImportCommit = z.infer<typeof bomImportCommitSchema>;
