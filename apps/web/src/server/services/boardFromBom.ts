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
export interface BomActivationOutcome {
  board: BoardSyncResult | null;
  /** Có khi đồng bộ board THẤT BẠI (BOM vẫn đã kích hoạt) — để UI báo, không nuốt im lặng (B9). */
  boardError: string | null;
}

export const BOARD_SYNC_FAILED_MESSAGE =
  "BOM đã chuyển Đang dùng nhưng CHƯA thêm được dòng lên Bảng sản xuất. Hãy thêm tay trên /production-board hoặc báo quản trị.";

export async function onBomActivated(input: BomActivatedInput): Promise<BoardSyncResult | null> {
  return (await onBomActivatedWithStatus(input)).board;
}

type BomActivatedInput = {
  templateId: string;
  templateCode: string;
  extras?: BoardActivationExtras | null;
  session: Session;
  meta?: { requestId?: string | null; ipAddress?: string | null; userAgent?: string | null };
};

/** Như `onBomActivated` nhưng nói rõ khi đồng bộ lỗi. Vẫn KHÔNG throw. */
export async function onBomActivatedWithStatus(input: BomActivatedInput): Promise<BomActivationOutcome> {
  try {
    const res = await syncBoardFromBom(input.templateId, input.extras ?? {}, input.session.userId);
    if (!res) return { board: null, boardError: null };
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
    return { board: res, boardError: null };
  } catch (err) {
    logger.warn({ err, templateId: input.templateId }, "đồng bộ Bảng sản xuất khi kích hoạt BOM thất bại (bỏ qua)");
    return { board: null, boardError: BOARD_SYNC_FAILED_MESSAGE };
  }
}
