import { z } from "zod";
import { BARCODE_SOURCES, BARCODE_TYPES } from "../constants";

export const barcodeTypeSchema = z.enum(BARCODE_TYPES);
export const barcodeSourceSchema = z.enum(BARCODE_SOURCES);

export const barcodeCreateSchema = z.object({
  barcode: z
    .string()
    .trim()
    .min(1, "Bắt buộc")
    .max(128, "Tối đa 128 ký tự"),
  barcodeType: barcodeTypeSchema.default("CODE128"),
  source: barcodeSourceSchema.default("internal"),
  isPrimary: z.coerce.boolean().default(false),
});

export const barcodeUpdateSchema = z.object({
  barcodeType: barcodeTypeSchema.optional(),
  source: barcodeSourceSchema.optional(),
  isPrimary: z.coerce.boolean().optional(),
});

export type BarcodeCreate = z.infer<typeof barcodeCreateSchema>;
export type BarcodeUpdate = z.infer<typeof barcodeUpdateSchema>;
