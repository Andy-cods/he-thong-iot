import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { can } from "@iot/shared";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError, parseJson } from "@/server/http";
import {
  assertIssuable,
  mapDbGuardError,
  postOutboundTxns,
  type IssuePick,
} from "@/server/repos/stockGuard";
import { writeAudit } from "@/server/services/audit";
import { canForUser } from "@/server/services/rbac";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.7 — POST /api/warehouse/issue
 *
 * Xuất hàng từ kho. Hỗ trợ multi-line + multi-pick per line.
 *
 * Body:
 *   - reason: string (REQUIRED) — production / sales / manual / loss / return
 *   - reference: string? — số chứng từ tham chiếu (WO, SO, ...)
 *   - notes: string?
 *   - lines: Array<{
 *       itemId: uuid,
 *       picks: Array<{ lotSerialId, binId, qty }>
 *     }>
 *
 * Logic per pick:
 *   1. Validate qty available trong (bin, lot, item) qua bin_inventory view
 *   2. INSERT inventory_txn OUT_ISSUE với fromBinId, lotSerialId, qty
 *   3. Nếu lot tiêu thụ hết → optional update status='CONSUMED' (V2)
 *
 * Atomic transaction: nếu 1 pick fail → rollback hết.
 *
 * V4.1 Đợt 1a:
 *  - KHO-13: RBAC `create:goodsIssue` (admin, warehouse) thay `transition:po`
 *    (trước đây Thu mua cũng xuất kho được).
 *  - KHO-14: xuất Bán hàng / Trả NCC cần `approve:goodsIssue` (Giám đốc);
 *    Kho phải lập Yêu cầu xuất kho để Giám đốc duyệt.
 *  - KHO-05/10: guard chung `assertIssuable` — chỉ lô AVAILABLE, không vượt
 *    tồn bin, không lấn phần đã giữ chỗ cho lệnh SX.
 */
const pickSchema = z.object({
  lotSerialId: z.string().uuid(),
  binId: z.string().uuid(),
  qty: z.coerce.number().positive(),
});

const lineSchema = z.object({
  itemId: z.string().uuid(),
  picks: z.array(pickSchema).min(1),
});

const issueSchema = z.object({
  reason: z
    .enum(["production", "sales", "manual", "loss", "return", "other"])
    .default("manual"),
  reference: z.string().trim().max(64).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1, "Cần ít nhất 1 dòng"),
});

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "goodsIssue");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, issueSchema);
  if ("response" in body) return body.response;

  const { reason, reference, notes, lines } = body.data;

  // V4.1 KHO-14 — xuất ra ngoài công ty (bán/trả NCC) chỉ Giám đốc.
  if (reason === "sales" || reason === "return") {
    const allowed = await canForUser(
      guard.session.userId,
      guard.session.roles,
      "approve",
      "goodsIssue",
    ).then(
      (r) => r.allowed,
      () => can(guard.session.roles, "approve", "goodsIssue"),
    );
    if (!allowed) {
      return jsonError(
        "FORBIDDEN",
        "Xuất bán hàng / trả NCC phải được Giám đốc duyệt — hãy lập \"Yêu cầu xuất kho\" thay vì xuất nhanh.",
        403,
      );
    }
  }

  const picks: IssuePick[] = lines.flatMap((l) =>
    l.picks.map((p) => ({
      itemId: l.itemId,
      lotSerialId: p.lotSerialId,
      binId: p.binId,
      qty: p.qty,
    })),
  );

  try {
    const result = await db.transaction(async (tx) => {
      const issueRefId = crypto.randomUUID();
      // V4.1 Đợt 1a — khoá item → lô theo thứ tự cố định + kiểm trạng thái lô,
      // tồn bin, phần đã giữ chỗ (thay advisory lock 'lot:' + check rời rạc).
      await assertIssuable(tx, picks);
      const posted = await postOutboundTxns(tx, picks, {
        txType: "OUT_ISSUE",
        refTable: `issue_${reason}`,
        refId: issueRefId,
        postedBy: guard.session.userId,
        notes: [reference, notes].filter(Boolean).join(" · ") || null,
      });
      const totalQty = picks.reduce((s, p) => s + p.qty, 0);
      return {
        txnIds: posted.txnIds,
        totalQty,
        consumedLots: posted.consumedLots,
        issueRefId,
      };
    });

    await writeAudit({
      actor: guard.session,
      action: "ISSUE",
      objectType: "inventory_txn",
      objectId: result.issueRefId,
      after: {
        reason,
        reference,
        lines: lines.length,
        totalQty: result.totalQty,
        txnCount: result.txnIds.length,
      },
      notes:
        notes ??
        `Xuất ${result.txnIds.length} pick · ${lines.length} SKU · ${result.totalQty} qty · ${reason}`,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const g = mapDbGuardError(err);
    if (g) return jsonError(g.code, g.message, g.status);
    logger.error({ err }, "warehouse issue failed");
    const msg = err instanceof Error ? err.message : "Lỗi xuất hàng";
    return jsonError("ISSUE_FAILED", msg, 500);
  }
}
