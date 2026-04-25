import { z } from "zod";

/**
 * V2.0 Sprint 6 — Zod schemas cho bom_sheet CRUD.
 * Tham chiếu: packages/db/src/schema/bom-sheet.ts.
 */

export const BOM_SHEET_KINDS = [
  "PROJECT",
  "MATERIAL_REF",
  "PROCESS_REF",
  "CUSTOM",
] as const;
export type BomSheetKind = (typeof BOM_SHEET_KINDS)[number];

export const BOM_SHEET_KIND_LABELS: Record<BomSheetKind, string> = {
  PROJECT: "Cấu trúc BOM",
  MATERIAL_REF: "Vật liệu",
  PROCESS_REF: "Quy trình gia công",
  CUSTOM: "Tuỳ chỉnh",
};

export const bomSheetCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Tên sheet bắt buộc").max(255),
    kind: z.enum(BOM_SHEET_KINDS).default("PROJECT"),
    position: z.coerce.number().int().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const bomSheetUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    position: z.coerce.number().int().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type BomSheetCreate = z.infer<typeof bomSheetCreateSchema>;
export type BomSheetUpdate = z.infer<typeof bomSheetUpdateSchema>;
