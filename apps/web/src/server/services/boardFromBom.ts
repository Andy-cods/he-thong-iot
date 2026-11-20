import { logger } from "@/lib/logger";
import type { BoardActivationExtras } from "@/lib/production-board-policy";
import { syncBoardFromBom, type BoardSyncResult } from "@/server/repos/productionBoard";
import { writeAudit } from "@/server/services/audit";
import { notifyBoardBomActivated } from "@/server/services/notifications";
import type { Session } from "@/server/session";

/**
 * BOM vừa chuyển "Đang dùng" (POST revisions DRAFT→ACTIVE, PATCH status) →
 * tự đưa lên Bảng sản xuất + audit + báo Tổ QC điền ngày giao.
 *
 * KHÔNG BAO GIỜ throw: lỗi đồng bộ board không được làm hỏng việc kích hoạt
 * BOM (trả null, log warn).
 */
export async function onBomActivated(input: {
  templateId: string;
  templateCode: string;
  extras?: BoardActivationExtras | null;
  session: Session;
  meta?: { requestId?: string | null; ipAddress?: string | null; userAgent?: string | null };
}): Promise<BoardSyncResult | null> {
  try {
    const res = await syncBoardFromBom(input.templateId, input.extras ?? {}, input.session.userId);
    if (!res) return null;
    if (res.action !== "unchanged" && res.action !== "skipped") {
      await writeAudit({
        actor: input.session,
        action: res.action === "created" ? "CREATE" : "UPDATE",
        objectType: "production_board_item",
        objectId: res.itemId,
        after: {
          productCode: res.productCode,
          bomTemplateId: input.templateId,
          bomCode: input.templateCode,
          via: "bom_activated",
          ...(input.extras ?? {}),
        },
        notes: `Bảng sản xuất ← kích hoạt BOM ${input.templateCode} (${res.action})`,
        ...(input.meta ?? {}),
      });
    }
    if (res.action === "created") {
      await notifyBoardBomActivated({
        itemId: res.itemId,
        productCode: res.productCode,
        productName: res.productName,
        bomCode: input.templateCode,
        hasDeadline: res.hasDeadline,
        actorUserId: input.session.userId,
        actorUsername: input.session.fullName,
      });
    }
    return res;
  } catch (err) {
    logger.warn({ err, templateId: input.templateId }, "đồng bộ Bảng sản xuất khi kích hoạt BOM thất bại (bỏ qua)");
    return null;
  }
}
