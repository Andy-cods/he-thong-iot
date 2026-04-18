import { z } from "zod";

/**
 * Shortage Board schemas — V1.2 Phase B5.
 *
 * Nguồn data: materialized view `app.shortage_aggregate` (hoặc on-fly
 * bom_snapshot_line filter remaining_short_qty > 0). Dashboard polling 60s,
 * thao tác chính là multi-select → bulk "Tạo PR".
 */

const uuid = z.string().uuid("ID không hợp lệ");

export const shortageFilterSchema = z.object({
  itemId: z
    .union([uuid, z.array(uuid)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  supplierId: z
    .union([uuid, z.array(uuid)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  orderId: uuid.optional(),
  minShortQty: z.coerce.number().nonnegative().optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().positive().max(1000).default(200),
});

export const bulkCreatePRFromShortageSchema = z.object({
  itemIds: z.array(uuid).min(1, "Chọn ít nhất 1 item"),
  supplierOverride: z.record(uuid, uuid).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type ShortageFilter = z.infer<typeof shortageFilterSchema>;
export type BulkCreatePRFromShortage = z.infer<
  typeof bulkCreatePRFromShortageSchema
>;
