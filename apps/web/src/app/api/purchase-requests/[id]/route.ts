import { NextResponse, type NextRequest } from "next/server";
import { prUpdateSchema } from "@iot/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { notification, purchaseRequest, userAccount } from "@iot/db/schema";
import { logger } from "@/lib/logger";
import {
  PrValidationError,
  assertPrItemsUsable,
  deletePR,
  getPR,
  computePrIssueProgress,
  getPRIssuedQtyByLine,
  getPRLinesEnriched,
  replacePRLines,
} from "@/server/repos/purchaseRequests";
import { listGoodsIssuesForPurchaseRequest } from "@/server/repos/goodsIssues";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  validateUuidParam,
} from "@/server/http";
import { writeAudit, diffObjects } from "@/server/services/audit";
import { canAccessPR, canEditPRDraft } from "@/server/services/prAccess";
import { requireCan, requireSession } from "@/server/session";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-requests/[id] — detail PR + enriched lines.
 * PATCH /api/purchase-requests/[id] — V3.4: full edit (title/notes/lines).
 *   L5/L7: CHỈ phiếu DRAFT và CHỈ người lập (hoặc admin) sửa được. Phiếu đã gửi
 *   (SUBMITTED trở đi) → 409 "Phiếu đã gửi, không sửa được".
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(_req, "read", "pr");
  if ("response" in guard) return guard.response;

  // V4.5 QA-C P2-6 — chặn id sai định dạng TRƯỚC khi query DB.
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

  const row = await getPR(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);

  // V3.9 — ownership: operator/qc chỉ xem phiếu mình tạo. L5 — phiếu NHÁP chỉ
  // người lập (và admin) xem. Trả 404 (không 403) để không lộ sự tồn tại.
  if (!canAccessPR(guard.session, row)) {
    return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);
  }

  const lines = await getPRLinesEnriched(params.id);
  // V4.2 (TASK "Trừ tồn luôn") — hiển thị mã phiếu xuất đã sinh ở mục IV.
  // Thiết kế 1 PR ↔ tối đa 1 phiếu xuất nên mảng này thường có 0 hoặc 1 phần tử.
  // L8 — xuất nhiều đợt: luôn liệt kê các phiếu xuất đã sinh (kể cả khi chưa đủ).
  const [goodsIssues, issuedByLine] = await Promise.all([
    listGoodsIssuesForPurchaseRequest(params.id),
    getPRIssuedQtyByLine(params.id),
  ]);
  const linesWithIssued = lines.map((l) => ({
    ...l,
    issuedQty: issuedByLine.get(l.id) ?? 0,
  }));
  const issueProgress = computePrIssueProgress(
    linesWithIssued.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      sku: l.sku,
      qty: Number(l.qty) || 0,
      approvedQty: l.approvedQty != null ? Number(l.approvedQty) : null,
      issuedQty: l.issuedQty,
    })),
  );

  // V3.7.73 — Resolve full names cho mục III/IV (Người đề xuất / Trưởng BP / Giám đốc / Rejected by)
  const ids = Array.from(
    new Set(
      [row.requestedBy, row.deptApprovedBy, row.directorApprovedBy, row.rejectedBy]
        .filter((x): x is string => !!x),
    ),
  );
  const nameMap = new Map<string, string>();
  if (ids.length > 0) {
    const users = await db
      .select({
        id: userAccount.id,
        fullName: userAccount.fullName,
        username: userAccount.username,
      })
      .from(userAccount)
      .where(inArray(userAccount.id, ids));
    for (const u of users) {
      nameMap.set(u.id, u.fullName ?? u.username);
    }
  }

  return NextResponse.json({
    data: {
      ...row,
      lines: linesWithIssued,
      goodsIssues,
      issueProgress,
      requestedByName: row.requestedBy ? nameMap.get(row.requestedBy) ?? null : null,
      deptApprovedByName: row.deptApprovedBy
        ? nameMap.get(row.deptApprovedBy) ?? null
        : null,
      directorApprovedByName: row.directorApprovedBy
        ? nameMap.get(row.directorApprovedBy) ?? null
        : null,
      rejectedByName: row.rejectedBy ? nameMap.get(row.rejectedBy) ?? null : null,
    },
  });
}

const EDITABLE_STATUSES = ["DRAFT"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // TASK-6VIEC Việc 2 — "lưu nháp → sửa tiếp → gửi" cần cho CẢ operator/qc/
  // accountant (không có RBAC update:pr trong matrix) sửa phiếu NHÁP CỦA
  // CHÍNH MÌNH. Guard nghiệp vụ tách khỏi RBAC matrix (giống `cancel` route):
  // requireSession trước, rồi check (update:pr RBAC) HOẶC (chủ phiếu + DRAFT).
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  // V4.5 QA-C P2-6 — chặn id sai định dạng TRƯỚC khi query DB.
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);

  // L5 — nháp của người khác: 404 như không tồn tại (không lộ nội dung).
  if (!canAccessPR(guard.session, before)) {
    return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);
  }

  // L7 — chỉ DRAFT mới sửa nội dung (kể cả người có quyền update:pr như planner:
  // trước đây PATCH được phiếu đã gửi mà không ai được báo).
  if (!(EDITABLE_STATUSES as readonly string[]).includes(before.status as string)) {
    return jsonError(
      "NOT_EDITABLE",
      "Phiếu đã gửi, không sửa được. Nếu cần thay đổi, từ chối/huỷ phiếu rồi dùng \"Tạo lại từ phiếu này\".",
      409,
    );
  }

  // L5 — DRAFT chỉ người lập (và admin) sửa.
  if (!canEditPRDraft(guard.session, before)) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ người lập phiếu (hoặc admin) mới sửa được phiếu nháp này.",
      403,
    );
  }

  const body = await parseJson(req, prUpdateSchema);
  if ("response" in body) return body.response;

  try {
    // L9/L10 — vật tư phải tồn tại + ACTIVE (422 tiếng Việt, không 500 FK).
    if (body.data.lines) await assertPrItemsUsable(body.data.lines);

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

    // V4.1 TM-12 — header + dòng trong CÙNG transaction (trước đây 2 bước rời,
    // lỗi giữa chừng để phiếu nửa sửa), guard bước duyệt ngay trong UPDATE.
    const after = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(purchaseRequest)
        .set(headerPatch)
        .where(
          and(
            eq(purchaseRequest.id, params.id),
            inArray(purchaseRequest.status, [...EDITABLE_STATUSES]),
            sql`COALESCE(${purchaseRequest.approvalStep}::text, 'DRAFT') = 'DRAFT'`,
          ),
        )
        .returning();
      if (!updated) return null;

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
            // V4.1 TM-12 — trước đây bỏ mất cột "Tham khảo" / "Ngày giao" / SL duyệt.
            referenceNote: l.referenceNote ?? null,
            deliveryDate: l.deliveryDate ? new Date(l.deliveryDate) : null,
            approvedQty: l.approvedQty ?? null,
          })),
          tx,
        );
      }
      return updated;
    });

    if (!after)
      return jsonError(
        "CONFLICT",
        "PR đã chuyển trạng thái khi đang sửa.",
        409,
      );

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
    if (err instanceof PrValidationError) {
      return jsonError(err.code, err.message, err.status);
    }
    const dbCode = (err as { code?: string; cause?: { code?: string } }).code ??
      (err as { cause?: { code?: string } }).cause?.code;
    if (dbCode === "23503" || dbCode === "22003") {
      return jsonError(
        "VALIDATION",
        "Dữ liệu tham chiếu không hợp lệ (vật tư/nhà cung cấp không tồn tại hoặc số quá lớn).",
        422,
      );
    }
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
  // TASK-6VIEC Việc 2 — người lập phiếu xoá được phiếu NHÁP của chính mình
  // (trước đây chỉ admin — RBAC matrix `delete:pr`). Admin vẫn hard-delete
  // được phiếu ở mọi trạng thái (kể cả force=1 khi đã có PO) như cũ.
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  // V4.5 QA-C P2-6 — chặn id sai định dạng TRƯỚC khi query DB.
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);

  // L5 — nháp của người khác: 404. Người lập xoá nháp của mình; admin xoá mọi phiếu.
  if (!canAccessPR(guard.session, before)) {
    return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
  }
  const isOwnDraftDelete = canEditPRDraft(guard.session, before);
  if (!isOwnDraftDelete && !guard.session.roles.includes("admin")) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ người lập phiếu (khi còn Nháp) hoặc admin mới xoá được phiếu này.",
      403,
    );
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  try {
    await deletePR(params.id, { force });

    // L14 — xoá phiếu thì thông báo liên quan phải biến mất (không để link 404).
    await db
      .delete(notification)
      .where(
        and(
          eq(notification.entityType, "purchase_request"),
          eq(notification.entityId, params.id),
        ),
      )
      .catch((e) => logger.warn({ err: e }, "cleanup PR notifications failed"));

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
