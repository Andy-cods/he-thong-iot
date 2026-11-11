import { z } from "zod";

/**
 * BOM V5 WP4b — quyết định của người dùng ở bước "Khớp" (mẫu BOM triển khai).
 * Gửi kèm body commit; luồng import cũ không dùng.
 */
export const bomImportDecisionSchema = z
  .object({
    /** Cột ID của dòng (BL1..). */
    position: z.string().min(1).max(64),
    action: z.enum(["USE_ITEM", "NEW"]),
    itemId: z.string().uuid().optional(),
  })
  .refine((d) => d.action !== "USE_ITEM" || !!d.itemId, {
    message: "USE_ITEM cần itemId",
    path: ["itemId"],
  });

export const bomImportDecisionsBodySchema = z.object({
  decisions: z.array(bomImportDecisionSchema).max(5000).default([]),
});

export type BomImportDecision = z.infer<typeof bomImportDecisionSchema>;
