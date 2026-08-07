import { NextResponse, type NextRequest } from "next/server";
import { prCreateSchema, prListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  createPR,
  listPRs,
  listPRDayBuckets,
  submitPR,
} from "@/server/repos/purchaseRequests";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPRSubmitted } from "@/server/services/notifications";
import { canViewAllPRs } from "@/server/services/prAccess";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-requests — list PR với filter status[], linkedOrderId.
 * POST /api/purchase-requests — tạo PR manual (DRAFT) + lines.
 *   Role: admin + planner.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "pr");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, prListQuerySchema);
  if ("response" in q) return q.response;

  try {
    // V3.9 — Ownership: operator/qc chỉ thấy phiếu MÌNH tạo. Override query param
    // để không cho tự đọc phiếu người khác qua ?requestedBy=. admin/planner/
    // purchaser/warehouse/accountant (canViewAllPRs) xem tất cả.
    const viewAll = canViewAllPRs(guard.session.roles);
    const scopedRequestedBy = viewAll ? q.data.requestedBy : guard.session.userId;

    // V3.13 — nhánh "thư mục ngày": trả các bucket theo ngày (giờ +07).
    if (new URL(req.url).searchParams.get("view") === "calendar") {
      const days = await listPRDayBuckets({ requestedBy: scopedRequestedBy });
      return NextResponse.json({ days });
    }

    const result = await listPRs({
      status: q.data.status,
      linkedOrderId: q.data.linkedOrderId,
      bomTemplateId: q.data.bomTemplateId,
      requestedBy: scopedRequestedBy,
      date: q.data.date,
      from: q.data.from,
      to: q.data.to,
      sortDir: q.data.sortDir,
      page: q.data.page,
      pageSize: q.data.pageSize,
    });
    return NextResponse.json({
      data: result.rows,
      meta: {
        page: q.data.page,
        pageSize: q.data.pageSize,
        total: result.total,
      },
    });
  } catch (err) {
    logger.error({ err }, "list PRs failed");
    return jsonError("INTERNAL", "Lỗi hệ thống khi tải yêu cầu mua hàng.", 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "pr");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, prCreateSchema);
  if ("response" in body) return body.response;

  try {
    const row = await createPR({
      title: body.data.title ?? null,
      source: body.data.source,
      linkedOrderId: body.data.linkedOrderId ?? null,
      notes: body.data.notes ?? null,
      requestedBy: guard.session.userId,
      // V3.7.55 — MRF GTAM header fields
      targetDepartment: body.data.targetDepartment ?? null,
      proposingDepartment: body.data.proposingDepartment ?? null,
      requestReason: body.data.requestReason ?? null,
      // V3.10 — loại phiếu trình bày (MRF | DNVT).
      formType: body.data.formType ?? "MRF",
      lines: body.data.lines.map((l) => ({
        itemId: l.itemId ?? null,
        // V3.7.72 — free-text fallback
        itemName: l.itemName ?? null,
        itemSku: l.itemSku ?? null,
        qty: l.qty,
        preferredSupplierId: l.preferredSupplierId ?? null,
        snapshotLineId: l.snapshotLineId ?? null,
        neededBy: l.neededBy ?? null,
        notes: l.notes ?? null,
        // V3.7.55 — MRF GTAM line fields
        specification: l.specification ?? null,
        uom: l.uom ?? null,
        priority: l.priority ?? null,
        category: l.category ?? null,
        estimatedUnitPrice: l.estimatedUnitPrice ?? null,
        referenceCode: l.referenceCode ?? null,
        // V3.7.69 YCVT — onHandSnapshot (auto-fill từ client lookup)
        onHandSnapshot: l.onHandSnapshot ?? null,
        // V3.10 DNVT — Tham khảo + Ngày giao hàng
        referenceNote: l.referenceNote ?? null,
        deliveryDate: l.deliveryDate ?? null,
      })),
    });

    // V3.7.17 — Auto-submit PR ngay sau create (fix bottleneck E2E):
    // PR DRAFT không bắn notification → Thu mua không biết. Tự động submit
    // để notifyPRSubmitted bắn tới purchaser.
    // V3.7.69 — submitPR() đồng thời sinh paper_form_no — phải merge lại
    // vào response (paperFormNo + approvalStep + status).
    let finalRow = row;
    if (row.status === "DRAFT") {
      const submitted = await submitPR(row.id);
      if (submitted) finalRow = submitted;
    }
    const finalStatus = finalRow.status;

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "purchase_request",
      objectId: row.id,
      after: {
        code: row.code,
        status: finalStatus,
        source: body.data.source,
        lineCount: body.data.lines.length,
      },
      ...meta,
    });

    // V3.3 — Notify purchaser role (fire-and-forget) khi PR tạo + submit ngay
    if (finalStatus === "SUBMITTED") {
      void notifyPRSubmitted({
        prId: finalRow.id,
        prNo: finalRow.paperFormNo ?? finalRow.code,
        title: body.data.title ?? null,
        actorUserId: guard.session.userId,
        actorUsername: guard.session.username,
      });
    }

    return NextResponse.json({ data: finalRow }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create PR failed");
    const msg = (err as Error).message ?? "";
    if (msg.includes("PR_MUST_HAVE_LINES")) {
      return jsonError("VALIDATION", "PR phải có ít nhất 1 dòng.", 422);
    }
    return jsonError("INTERNAL", "Không tạo được yêu cầu mua hàng.", 500);
  }
}
