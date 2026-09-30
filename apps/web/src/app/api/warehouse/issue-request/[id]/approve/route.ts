import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { warehouseIssueRequest } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { validateIsrOverridePicks, type IsrPickLine } from "@/lib/isr-relot";
import { jsonError, parseJson } from "@/server/http";
import {
  createGoodsIssueTx,
  GoodsIssueError,
  type GoodsIssuePickInput,
  type GoodsIssueReason,
} from "@/server/repos/goodsIssues";
import { mapDbGuardError } from "@/server/repos/stockGuard";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { notifyIssueRequestApproved } from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.9 — POST /api/warehouse/issue-request/[id]/approve
 *
 * Kho duyệt yêu cầu PENDING → APPROVED → tự động execute OUT_ISSUE inventory_txn
 * cho tất cả picks → status = COMPLETED.
 *
 * V4.0 Wave 3 Phase D (fix bug) — guard cũ dùng `requireCan(req, "transition", "po")`
 * SAI entity (cho phép mọi role có `po.transition`, không đúng ý đồ "Kho duyệt
 * xuất kho"). Đổi sang entity `deliveryNote` action `transition` (warehouse CÓ
 * quyền này theo RBAC matrix Wave 1: `warehouse.deliveryNote = [create, read,
 * update, transition]` — KHÔNG có `approve`, quyền đó CHỈ admin. Dùng
 * `transition` ở đây để warehouse vẫn tự xử lý được case nội bộ).
 *
 * Theo QĐ-5/U-2 (plans/v4-finance/wave-3-procurement-warehouse.md mục 0):
 * "Chỉ Giám đốc duyệt phiếu xuất hàng" CHỈ áp dụng cho xuất bán/giao khách
 * (reason IN ('sales','return')) — xuất vật tư nội bộ SX (production/manual/
 * loss/other) GIỮ NGUYÊN Kho tự duyệt như cũ, tránh làm tắc xưởng. Hard-check
 * role admin bên dưới cho case sales/return (không chỉ dựa RBAC matrix mềm).
 *
 * V4.1 Đợt 1b (Q3) — duyệt sinh 1 phiếu xuất kho PX-YYMM-NNNN
 * (`source_type='ISSUE_REQUEST'`) cùng transaction; unique index
 * `goods_issue_isr_uk` chặn 1 ISR sinh 2 phiếu (lưới an toàn sau bước claim).
 *
 * V4.4 (Việc 2) — "Chọn lại lô khi lô đã hụt": trước đây nếu lô khoá lúc tạo
 * không còn đủ, `createGoodsIssueTx` ném `StockGuardError` → transaction
 * rollback → yêu cầu KẸT ở PENDING vĩnh viễn (chỉ còn nút "Từ chối"). Nay body
 * có thể gửi kèm `picks` mới (Kho tự gọi `/api/warehouse/fifo-pick` gợi ý lại
 * rồi build lại) để duyệt lại với lô khác, hoặc xuất ÍT HƠN kèm `partialNote`
 * bắt buộc — `validateIsrOverridePicks` (THUẦN, test riêng) chặn không cho
 * override thêm mã hàng mới hoặc vượt SL đã xin ban đầu. Không gửi `picks` →
 * hành vi y hệt trước đây (dùng picksJson đã lưu lúc tạo).
 */

interface PicksJson {
  itemId: string;
  sku?: string | null;
  picks: Array<{
    lotSerialId: string;
    binId: string;
    qty: number;
  }>;
}

const pickSchema = z.object({
  lotSerialId: z.string().uuid(),
  lotCode: z.string().nullable().optional(),
  binId: z.string().uuid(),
  binCode: z.string().nullable().optional(),
  qty: z.coerce.number().positive(),
});
const lineSchema = z.object({
  itemId: z.string().uuid(),
  sku: z.string().nullable().optional(),
  picks: z.array(pickSchema).min(1),
});
const approveBodySchema = z
  .object({
    /** V4.4 — override lô/bin (chọn lại lô hụt) hoặc xuất ít hơn (1 phần). */
    picks: z.array(lineSchema).optional(),
    /** Bắt buộc khi tổng override < tổng đã xin ban đầu (xuất 1 phần). */
    partialNote: z.string().trim().max(500).optional().nullable(),
  })
  .nullable()
  .optional()
  .transform((v) => v ?? {});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "deliveryNote");
  if ("response" in guard) return guard.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return jsonError("INVALID_ID", "ID không hợp lệ", 400);
  }

  const body = await parseJson(req, approveBodySchema);
  if ("response" in body) return body.response;

  // Load request — cột tường minh (không `.select()` cả row) để tránh phụ
  // thuộc cứng vào MỌI cột tương lai của bảng (đã thấy trong `route.ts`/
  // `reject/route.ts` cùng thư mục, theo cùng quy ước).
  const [request] = await db
    .select({
      id: warehouseIssueRequest.id,
      requestNo: warehouseIssueRequest.requestNo,
      status: warehouseIssueRequest.status,
      reason: warehouseIssueRequest.reason,
      reference: warehouseIssueRequest.reference,
      notes: warehouseIssueRequest.notes,
      picksJson: warehouseIssueRequest.picksJson,
      requestedBy: warehouseIssueRequest.requestedBy,
      woId: warehouseIssueRequest.woId,
    })
    .from(warehouseIssueRequest)
    .where(eq(warehouseIssueRequest.id, params.id))
    .limit(1);

  if (!request) return jsonError("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  if (request.status !== "PENDING") {
    return jsonError(
      "INVALID_STATUS",
      `Yêu cầu đã ${request.status}, không thể duyệt`,
      409,
    );
  }

  // V4.0 U-2 — hard-check: xuất bán/trả NCC (ra ngoài công ty) CHỈ Giám đốc
  // (admin) được duyệt. Xuất nội bộ SX giữ nguyên Kho tự duyệt (RBAC matrix
  // `warehouse.deliveryNote` không có "approve" nên warehouse tự nhiên bị
  // chặn ở guard trên với case sales/return; nhưng hard-check thêm ở đây để
  // không phụ thuộc hoàn toàn vào matrix mềm — cùng nguyên tắc QĐ-5).
  if (
    ["sales", "return"].includes(request.reason) &&
    !guard.session.roles.includes("admin")
  ) {
    return jsonError(
      "FORBIDDEN",
      "Xuất bán/trả hàng NCC chỉ Giám đốc được phê duyệt.",
      403,
    );
  }

  const originalLines = (request.picksJson as unknown as PicksJson[]) ?? [];
  const overrideLines = body.data.picks as IsrPickLine[] | undefined;

  let finalLines: PicksJson[] = originalLines;
  let partialNote: string | null = null;
  let overrideTotalQty: number | null = null;
  if (overrideLines) {
    const check = validateIsrOverridePicks(originalLines, overrideLines);
    if (!check.ok) {
      return jsonError(check.error.code, check.error.message, 400);
    }
    if (check.isPartial) {
      const note = body.data.partialNote?.trim() ?? "";
      if (note.length < 3) {
        return jsonError(
          "PARTIAL_NOTE_REQUIRED",
          "Xuất ít hơn số lượng đã xin ban đầu — cần nhập lý do (tối thiểu 3 ký tự).",
          400,
        );
      }
      partialNote = note;
    }
    finalLines = overrideLines;
    // V4.4 — cập nhật lại total_qty của ISR khớp SL THỰC XUẤT (quan trọng khi
    // xuất 1 phần — tránh total_qty treo số cũ trong khi picksJson đã đổi,
    // gây sai khi cộng dồn báo cáo theo total_qty).
    overrideTotalQty = check.totalOverride;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // V3.11.4 (audit 1.3) — CLAIM request ngay đầu transaction: UPDATE có điều
      // kiện `status='PENDING'` returning. 2 duyệt đồng thời: chỉ 1 giành được
      // (1 row), cái còn lại 0 row → throw 409 (tránh xuất kho 2 lần cùng picks).
      // V4.4 — nếu có override, ghi luôn picksJson thực tế đã xuất (audit trail)
      // + note lý do xuất 1 phần (nếu có) vào cùng UPDATE claim.
      const now = new Date();
      const claimNotes = partialNote
        ? `${request.notes ? `${request.notes}\n` : ""}[Xuất 1 phần: ${partialNote}]`
        : request.notes;
      const claimed = await tx
        .update(warehouseIssueRequest)
        .set({
          status: "COMPLETED",
          approvedBy: guard.session.userId,
          approvedAt: now,
          completedAt: now,
          updatedAt: now,
          ...(overrideLines
            ? {
                picksJson: finalLines,
                notes: claimNotes,
                totalQty: String(overrideTotalQty ?? 0),
              }
            : {}),
        })
        .where(
          sql`${warehouseIssueRequest.id} = ${params.id} AND ${warehouseIssueRequest.status} = 'PENDING'`,
        )
        .returning({
          id: warehouseIssueRequest.id,
          status: warehouseIssueRequest.status,
        });
      if (claimed.length === 0) {
        throw new Error("ALREADY_PROCESSED: yêu cầu đã được duyệt/xử lý");
      }

      // V4.1 Đợt 1a (KHO-05/10) — guard chung: khoá item → lô theo thứ tự cố
      // định, chỉ lô AVAILABLE, không vượt tồn bin, không lấn phần đã giữ chỗ.
      // ISR lập từ trước mà lô nay đang HOLD (chờ QC) → 409 rõ lý do.
      // V4.1 Đợt 1b — đi qua phiếu xuất kho PX (guard + ledger + dòng phiếu).
      const picks: GoodsIssuePickInput[] = finalLines.flatMap((l) =>
        l.picks.map((p) => ({
          itemId: l.itemId,
          lotSerialId: p.lotSerialId,
          binId: p.binId,
          qty: Number(p.qty),
        })),
      );
      const gi = await createGoodsIssueTx(tx, {
        sourceType: "ISSUE_REQUEST",
        reason: toGoodsIssueReason(request.reason),
        issueRequestId: request.id,
        // V4.4 (Việc 1) — ISR sinh từ "Xin vật tư theo BOM" mang theo wo_id →
        // phiếu xuất PX cũng gắn đúng WO để báo cáo/đối chiếu.
        woId: request.woId ?? null,
        reference: request.reference ?? request.requestNo,
        notes: (
          partialNote
            ? `${request.requestNo} · approved (1 phần: ${partialNote})`
            : `${request.requestNo} · approved${request.notes ? ` · ${request.notes}` : ""}`
        ).slice(0, 500),
        issuedBy: guard.session.userId,
        receivedBy: request.requestedBy,
        picks,
      });
      const txnIds = gi.txnIds;
      const consumedLots = gi.consumedLots;
      const totalQty = gi.totalQty;

      // Status đã set COMPLETED ở bước CLAIM đầu transaction.
      return {
        txnIds,
        totalQty,
        consumedLots,
        request: claimed[0],
        goodsIssueId: gi.id,
        issueNo: gi.issueNo,
      };
    });

    await writeAudit({
      actor: guard.session,
      action: "APPROVE",
      objectType: "warehouse_issue_request",
      objectId: params.id,
      after: {
        requestNo: request.requestNo,
        issueNo: result.issueNo,
        totalQty: result.totalQty,
        txnCount: result.txnIds.length,
      },
      notes: `Duyệt + xuất ${request.requestNo} · ${result.issueNo} · ${result.txnIds.length} pick · ${result.totalQty} qty`,
    });

    // V3.7.17 — Notify requester (Vận hành) về xuất kho thành công
    void notifyIssueRequestApproved({
      requestId: request.id,
      requestNo: request.requestNo,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
      requesterUserId: request.requestedBy,
      totalQty: result.totalQty,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof GoodsIssueError) {
      return jsonError(err.code, err.message, err.status);
    }
    const g = mapDbGuardError(err);
    if (g) return jsonError(g.code, g.message, g.status);
    const msg = err instanceof Error ? err.message : "Lỗi duyệt yêu cầu";
    // V4.1 Đợt 1b — goods_issue_isr_uk: ISR đã có phiếu xuất (duyệt 2 lần).
    const pgCode =
      (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
    if (msg.startsWith("ALREADY_PROCESSED") || pgCode === "23505") {
      return jsonError("APPROVE_FAILED", "Yêu cầu đã được duyệt/xử lý bởi người khác.", 409);
    }
    logger.error({ err, requestId: params.id }, "issue request approve failed");
    return jsonError("APPROVE_FAILED", msg, 500);
  }
}

const GOODS_ISSUE_REASONS: GoodsIssueReason[] = [
  "production",
  "sales",
  "manual",
  "loss",
  "return",
  "other",
];

/** ISR.reason là varchar tự do (dữ liệu cũ) → chuẩn hoá về CHECK của goods_issue. */
function toGoodsIssueReason(reason: string | null | undefined): GoodsIssueReason {
  return (GOODS_ISSUE_REASONS as string[]).includes(reason ?? "")
    ? (reason as GoodsIssueReason)
    : "other";
}
