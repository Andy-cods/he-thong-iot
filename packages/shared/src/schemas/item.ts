import { z } from "zod";
import {
  BARCODE_TYPES,
  ITEM_STATUSES,
  ITEM_TYPES,
  UOMS,
} from "../constants";

/** SKU: bắt đầu chữ/số, cho phép `_` và `-`, 2-64 ký tự. */
export const SKU_REGEX = /^[A-Z0-9][A-Z0-9_\-]{1,63}$/;

export const itemTypeSchema = z.enum(ITEM_TYPES);
export const uomSchema = z.enum(UOMS);
export const itemStatusSchema = z.enum(ITEM_STATUSES);

const trimmedNullable = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : (v ?? null)));

const numericNonNeg = z.coerce
  .number()
  .refine((v) => Number.isFinite(v) && v >= 0, {
    message: "Phải ≥ 0",
  });

export const itemCreateSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(2, "Tối thiểu 2 ký tự")
    .max(64, "Tối đa 64 ký tự")
    .transform((v) => v.toUpperCase())
    .refine((v) => SKU_REGEX.test(v), {
      message: "Mã không hợp lệ (A-Z, 0-9, _ -; 2-64 ký tự)",
    }),
  name: z.string().trim().min(1, "Bắt buộc").max(255),
  itemType: itemTypeSchema,
  uom: uomSchema,
  status: itemStatusSchema.default("ACTIVE"),
  category: trimmedNullable(64),
  description: trimmedNullable(2000),
  minStockQty: numericNonNeg.default(0),
  reorderQty: numericNonNeg.default(0),
  leadTimeDays: z.coerce.number().int().nonnegative().default(0),
  isLotTracked: z.coerce.boolean().default(false),
  isSerialTracked: z.coerce.boolean().default(false),
});

/** PATCH — tất cả optional, KHÔNG cho đổi sku (giữ ref integrity). */
export const itemUpdateSchema = itemCreateSchema
  .omit({ sku: true })
  .partial()
  .extend({
    isActive: z.coerce.boolean().optional(),
  });

export const itemListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  type: z
    .union([itemTypeSchema, z.array(itemTypeSchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  uom: z
    .union([uomSchema, z.array(uomSchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  status: z
    .union([itemStatusSchema, z.array(itemStatusSchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  isActive: z
    .union([z.enum(["true", "false"]), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return true;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sort: z
    .enum([
      "sku",
      "-sku",
      "name",
      "-name",
      "updatedAt",
      "-updatedAt",
      "createdAt",
      "-createdAt",
    ])
    .default("-updatedAt"),
});

export const itemImportRowSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .transform((v) => v.toUpperCase())
    .refine((v) => SKU_REGEX.test(v), { message: "SKU không hợp lệ" }),
  name: z.string().trim().min(1).max(255),
  itemType: itemTypeSchema,
  uom: uomSchema,
  category: trimmedNullable(64),
  description: trimmedNullable(2000),
  minStockQty: numericNonNeg.default(0),
  reorderQty: numericNonNeg.default(0),
  leadTimeDays: z.coerce.number().int().nonnegative().default(0),
  isLotTracked: z.coerce.boolean().default(false),
  isSerialTracked: z.coerce.boolean().default(false),
  barcode: trimmedNullable(128),
  barcodeType: z.enum(BARCODE_TYPES).default("CODE128"),
  supplierCode: trimmedNullable(64),
  supplierSku: trimmedNullable(128),
  priceRef: z.coerce.number().nonnegative().optional().nullable(),
  moq: z.coerce.number().positive().default(1),
  packSize: z.coerce.number().positive().default(1),
  leadTimeDaysSupplier: z.coerce.number().int().nonnegative().optional(),
});

export type ItemCreateInput = z.input<typeof itemCreateSchema>;
export type ItemCreate = z.infer<typeof itemCreateSchema>;
export type ItemUpdate = z.infer<typeof itemUpdateSchema>;
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;
export type ItemImportRow = z.infer<typeof itemImportRowSchema>;
