import { NextResponse, type NextRequest } from "next/server";
import { prUpdateSchema } from "@iot/shared";
import { and, eq, inArray } from "drizzle-orm";
import { purchaseRequest } from "@iot/db/schema";
import { logger } from "@/lib/logger";
import {
  deletePR,
  getPR,
  getPRLinesEnriched,
  replacePRLines,
} from "@/server/repos/purchaseRequests";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit, diffObjects } from "@/server/services/audit";
import { requireCan } from "@/server/session";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-requests/[id] — detail PR + enriched lines.
 * PATCH /api/purchase-requests/[id] — V3.4: full edit (title/notes/lines)
 *   khi status DRAFT hoặc SUBMITTED. Status APPROVED/CONVERTED/REJECTED → 409.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(_req, "read", "pr");
  if ("response" in guard) return guard.response;

  const row = await getPR(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);

  const lines = await getPRLinesEnriched(params.id);
  return NextResponse.json({ data: { ...row, lines } });
}

const EDITABLE_STATUSES = ["DRAFT", "SUBMITTED"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "pr");
  if ("response" in guard) return guard.response;

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);
  if (
    !(EDITABLE_STATUSES as readonly string[]).includes(before.status as string)
  ) {
    return jsonError(
      "NOT_EDITABLE",
      `PR đang ở trạng thái ${before.status} — chỉ sửa được khi DRAFT hoặc SUBMITTED.`,
      409,
    );
  }

  const body = await parseJson(req, prUpdateSchema);
  if ("response" in body) return body.response;

  try {
    // Update header
    const headerPatch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.data.title !== undefined) headerPatch.title = body.data.title;
    if (body.data.notes !== undefined) headerPatch.notes = body.data.notes;
    // V3.7.55 — MRF GTAM header fields
    if (body.data.targetDepartment !== undefined)
      headerPatch.targetDepartment = body.data.targetDepartment;
    if (body.data.proposingDepartment !== undefined)
      headerPatch.proposingDepartment = body.data.proposingDepartment;
    if (body.data.requestReason !== undefined)
      headerPatch.requestReason = body.data.requestReason;

    const [after] = await db
      .update(purchaseRequest)
      .set(headerPatch)
      .where(
        and(
          eq(purchaseRequest.id, params.id),
          inArray(purchaseRequest.status, [...EDITABLE_STATUSES]),
        ),
      )
      .returning();

    if (!after)
      return jsonError(
        "CONFLICT",
        "PR đã chuyển trạng thái khi đang sửa.",
        409,
      );

    // V3.4 — Replace lines if provided
    if (body.data.lines && body.data.lines.length > 0) {
      await replacePRLines(
        params.id,
        body.data.lines.map((l) => ({
          itemId: l.itemId ?? null,
          // V3.7.72 — free-text fallback
          itemName: l.itemName ?? null,
          itemSku: l.itemSku ?? null,
          qty: l.qty,
          preferredSupplierId: l.preferredSupplierId ?? null,
          snapshotLineId: l.snapshotLineId ?? null,
          neededBy: l.neededBy ? new Date(l.neededBy) : null,
          notes: l.notes ?? null,
          // V3.7.55 — MRF GTAM line fields
          specification: l.specification ?? null,
          uom: l.uom ?? null,
          priority: l.priority ?? null,
          category: l.category ?? null,
          estimatedUnitPrice: l.estimatedUnitPrice ?? null,
          referenceCode: l.referenceCode ?? null,
          // V3.7.69 YCVT
          onHandSnapshot: l.onHandSnapshot ?? null,
        })),
      );
    }

    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_request",
      objectId: params.id,
      before: diff.before,
      after: {
        ...diff.after,
        ...(body.data.lines ? { lineCount: body.data.lines.length } : {}),
      },
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update PR failed");
    return jsonError("INTERNAL", "Không cập nhật được PR.", 500);
  }
}

/**
 * V3.7.71 — DELETE /api/purchase-requests/[id] — admin only.
 *
 * Hard-delete PR + lines cascade. Block nếu PR đã được convert sang PO trừ
 * khi gọi với `?force=1` (admin chấp nhận null-out po.pr_id).
 *
 * RBAC: action "delete" entity "pr" — chỉ admin trong RBAC matrix.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "delete", "pr");
  if ("response" in guard) return guard.response;

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  try {
    await deletePR(params.id, { force });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "DELETE",
      objectType: "purchase_request",
      objectId: params.id,
      before: {
        code: before.code,
        paperFormNo: before.paperFormNo,
        status: before.status,
        approvalStep: before.approvalStep,
        title: before.title,
      },
      notes: force
        ? `Force-delete YCVT ${before.paperFormNo ?? before.code} (cascaded PO refs)`
        : `Delete YCVT ${before.paperFormNo ?? before.code}`,
      ...meta,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.startsWith("PR_HAS_POS")) {
      const detail = msg.replace("PR_HAS_POS: ", "");
      return jsonError(
        "PR_HAS_POS",
        `Phiếu đã có PO link (${detail}). Dùng ?force=1 nếu muốn xoá kèm bỏ link PO.`,
        409,
      );
    }
    if (msg === "PR_NOT_FOUND") {
      return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
    }
    logger.error({ err }, "delete PR failed");
    return jsonError("INTERNAL", "Không xoá được phiếu.", 500);
  }
}
