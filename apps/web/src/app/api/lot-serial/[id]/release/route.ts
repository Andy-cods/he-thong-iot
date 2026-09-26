import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { inventoryLotSerial } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/lot-serial/[id]/release — V3 warehouse redesign (TASK-20260427-014).
 *
 * Giải phóng lot HOLD → AVAILABLE. Body optional `{ note?: string }`.
 *
 * Guard: chỉ chuyển HOLD → AVAILABLE. Lot AVAILABLE/CONSUMED/EXPIRED không
 * release được (409 INVALID_STATE).
 *
 * Audit: action=RELEASE, objectType='lot_serial'.
 *
 * V4.1 Đợt 1a (KHO-12):
 *  - RBAC `update:qcInspection` (admin, qc, warehouse) — planner hết quyền.
 *  - Lô HOLD do QC (hold_code QC_PENDING/QC_FAIL) đang có dòng phiếu nhập Chờ
 *    kiểm/Không đạt KHÔNG nhả ở đây → 409, phải kết luận ở màn "Chờ QC"
 *    (tránh nhả HOLD bỏ qua QC). Lô HOLD cũ trước V4.1 (D3) vẫn nhả được.
 *  - Nhả thì xoá hold_code.
 */

const releaseSchema = z
  .object({
    note: z.string().trim().max(500).optional().nullable(),
  })
  .partial();

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "qcInspection");
  if ("response" in guard) return guard.response;

  // Body optional — nếu không có body vẫn parse OK (note undefined).
  const body = await parseJson(req, releaseSchema).catch(() => ({
    data: { note: null },
  }));
  const note =
    "data" in body && body.data && "note" in body.data
      ? (body.data.note ?? null)
      : null;

  const [before] = await db
    .select()
    .from(inventoryLotSerial)
    .where(eq(inventoryLotSerial.id, params.id))
    .limit(1);

  if (!before) {
    return jsonError("NOT_FOUND", "Không tìm thấy lot.", 404);
  }
  if (before.status !== "HOLD") {
    return jsonError(
      "INVALID_STATE",
      `Chỉ release được lot đang HOLD (hiện ${before.status}).`,
      409,
    );
  }

  // D3 — lô HOLD cũ (trước V4.1) được backfill hold_code='QC_FAIL' từ
  // hold_reason 'QC NG…' nhưng KHÔNG có dòng phiếu nhập nào ở trạng thái
  // PENDING/FAIL → không hiện ở màn Chờ QC. Chỉ chặn khi lô thật sự đang được
  // quản lý bởi màn Chờ QC, nếu không lô cũ sẽ kẹt HOLD vĩnh viễn.
  const managedByQcScreen =
    (before.holdCode === "QC_PENDING" || before.holdCode === "QC_FAIL") &&
    (
      (await db.execute(sql`
        SELECT 1 FROM app.inbound_receipt_line
        WHERE lot_serial_id = ${params.id}
          AND qc_status IN ('PENDING', 'FAIL')
        LIMIT 1
      `)) as unknown as unknown[]
    ).length > 0;
  if (managedByQcScreen) {
    return jsonError(
      "QC_HOLD",
      before.holdCode === "QC_PENDING"
        ? "Lô đang chờ QC nhập kho — xử lý ở màn Chờ QC (QC kết luận Đạt), không nhả HOLD thủ công."
        : "Lô QC không đạt — chỉ QC kiểm lại và kết luận Đạt ở màn Chờ QC mới nhả được.",
      409,
    );
  }

  try {
    const [row] = await db
      .update(inventoryLotSerial)
      .set({ status: "AVAILABLE", holdCode: null, holdReason: null })
      .where(
        and(
          eq(inventoryLotSerial.id, params.id),
          eq(inventoryLotSerial.status, "HOLD"),
          // Chặn đua: lô vừa bị chuyển sang HOLD do QC giữa chừng.
          managedByQcScreen
            ? sql`false`
            : sql`NOT EXISTS (
                SELECT 1 FROM app.inbound_receipt_line rl
                WHERE rl.lot_serial_id = ${params.id}
                  AND rl.qc_status IN ('PENDING', 'FAIL'))`,
        ),
      )
      .returning();
    if (!row) {
      return jsonError("CONFLICT", "Lot vừa thay đổi trạng thái.", 409);
    }

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "RELEASE",
      objectType: "lot_serial",
      objectId: params.id,
      before: { status: before.status, holdReason: before.holdReason },
      after: { status: row.status, holdReason: row.holdReason },
      notes: note ?? null,
      ...meta,
    });

    return NextResponse.json({
      ok: true,
      lotSerial: {
        id: row.id,
        status: row.status,
        holdReason: row.holdReason,
        lotCode: row.lotCode,
        serialCode: row.serialCode,
        itemId: row.itemId,
      },
    });
  } catch (err) {
    logger.error({ err, lotId: params.id }, "lot release failed");
    return jsonError("INTERNAL", "Không release được lot.", 500);
  }
}
