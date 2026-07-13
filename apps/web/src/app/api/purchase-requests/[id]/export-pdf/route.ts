import { type NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { userAccount } from "@iot/db/schema";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { getPR, getPRLinesEnriched } from "@/server/repos/purchaseRequests";
import { jsonError } from "@/server/http";
import { canViewAllPRs } from "@/server/services/prAccess";
import { requireCan } from "@/server/session";
import {
  renderYcvtPdfBuffer,
  type YcvtPdfLine,
} from "@/server/services/ycvtPdf";
import {
  renderDnvtPdfBuffer,
  type DnvtPdfLine,
} from "@/server/services/dnvtPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.69 YCVT — GET /api/purchase-requests/[id]/export-pdf
 * Render PDF khớp template "Phiếu MRF" (A4 landscape, Roboto, 5 sections).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "pr");
  if ("response" in guard) return guard.response;

  try {
    const pr = await getPR(params.id);
    if (!pr) return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);

    // V3.9 — ownership: operator/qc chỉ tải phiếu mình tạo (404 nếu của người khác).
    if (
      !canViewAllPRs(guard.session.roles) &&
      pr.requestedBy !== guard.session.userId
    ) {
      return jsonError("NOT_FOUND", "Không tìm thấy phiếu.", 404);
    }

    const linesRaw = await getPRLinesEnriched(params.id);

    // Bulk user-name lookup
    const userIds = Array.from(
      new Set(
        [pr.requestedBy, pr.deptApprovedBy, pr.directorApprovedBy].filter(
          (id): id is string => !!id,
        ),
      ),
    );
    const userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const users = await db
        .select({
          id: userAccount.id,
          fullName: userAccount.fullName,
          username: userAccount.username,
        })
        .from(userAccount)
        .where(inArray(userAccount.id, userIds));
      for (const u of users) {
        userMap.set(u.id, u.fullName ?? u.username);
      }
    }

    // V3.10 — branch theo loại phiếu (R1: DNVT ra layout riêng, không lộ cột giá).
    const isDnvt = pr.formType === "DNVT";
    const requestedByName = pr.requestedBy
      ? userMap.get(pr.requestedBy) ?? null
      : null;
    const deptApprovedByName = pr.deptApprovedBy
      ? userMap.get(pr.deptApprovedBy) ?? null
      : null;
    const directorApprovedByName = pr.directorApprovedBy
      ? userMap.get(pr.directorApprovedBy) ?? null
      : null;

    let buf: Uint8Array;
    if (isDnvt) {
      const lines: DnvtPdfLine[] = linesRaw.map((l) => ({
        lineNo: l.lineNo,
        name: l.name,
        specification: l.specification ?? null,
        uom: l.uom ?? l.itemUom ?? null,
        qty: Number(l.qty) || 0,
        onHandSnapshot:
          l.onHandSnapshot != null ? Number(l.onHandSnapshot) : null,
        approvedQty: l.approvedQty != null ? Number(l.approvedQty) : null,
        neededBy: l.neededBy ?? null,
        priority: l.priority ?? null,
        category: l.category ?? null,
        referenceCode: l.referenceCode ?? null,
        referenceNote: l.referenceNote ?? null,
        notes: l.notes ?? null,
        deliveryDate: l.deliveryDate ?? null,
      }));
      buf = await renderDnvtPdfBuffer({
        paperFormNo: pr.paperFormNo ?? pr.code,
        createdAt: new Date(pr.createdAt),
        targetDepartment: pr.targetDepartment ?? null,
        proposingDepartment: pr.proposingDepartment ?? null,
        requestedByName,
        requestReason: pr.requestReason ?? null,
        lines,
        deptApprovedByName,
        deptApprovedAt: pr.deptApprovedAt ? new Date(pr.deptApprovedAt) : null,
        directorApprovedByName,
        directorApprovedAt: pr.directorApprovedAt
          ? new Date(pr.directorApprovedAt)
          : null,
        rejectedAt: pr.rejectedAt ? new Date(pr.rejectedAt) : null,
        rejectionReason: pr.rejectionReason ?? null,
      });
    } else {
      const lines: YcvtPdfLine[] = linesRaw.map((l) => ({
        lineNo: l.lineNo,
        sku: l.sku,
        name: l.name,
        specification: l.specification ?? null,
        uom: l.uom ?? l.itemUom ?? null,
        qty: Number(l.qty) || 0,
        onHandSnapshot:
          l.onHandSnapshot != null ? Number(l.onHandSnapshot) : null,
        approvedQty: l.approvedQty != null ? Number(l.approvedQty) : null,
        neededBy: l.neededBy ?? null,
        priority: l.priority ?? null,
        category: l.category ?? null,
        estimatedUnitPrice:
          l.estimatedUnitPrice != null ? Number(l.estimatedUnitPrice) : null,
        referenceCode: l.referenceCode ?? null,
        notes: l.notes ?? null,
      }));
      buf = await renderYcvtPdfBuffer({
        paperFormNo: pr.paperFormNo ?? pr.code,
        createdAt: new Date(pr.createdAt),
        targetDepartment: pr.targetDepartment ?? null,
        proposingDepartment: pr.proposingDepartment ?? null,
        requestedByName,
        title: pr.title ?? null,
        requestReason: pr.requestReason ?? null,
        lines,
        totalEstimatedAmount:
          pr.totalEstimatedAmount != null
            ? Number(pr.totalEstimatedAmount)
            : null,
        deptApprovedByName,
        deptApprovedAt: pr.deptApprovedAt ? new Date(pr.deptApprovedAt) : null,
        deptApprovalNote: pr.deptApprovalNote ?? null,
        directorApprovedByName,
        directorApprovedAt: pr.directorApprovedAt
          ? new Date(pr.directorApprovedAt)
          : null,
        directorApprovalNote: pr.directorApprovalNote ?? null,
        rejectedAt: pr.rejectedAt ? new Date(pr.rejectedAt) : null,
        rejectionReason: pr.rejectionReason ?? null,
        poCreatedAt: pr.poCreatedAt ? new Date(pr.poCreatedAt) : null,
        goodsReceivedAt: pr.goodsReceivedAt
          ? new Date(pr.goodsReceivedAt)
          : null,
        goodsIssuedAt: pr.goodsIssuedAt ? new Date(pr.goodsIssuedAt) : null,
        completedAt: pr.completedAt ? new Date(pr.completedAt) : null,
      });
    }

    const safeFormNo = (pr.paperFormNo ?? pr.code).replace(/[\/\\]/g, "-");
    const filename = `${isDnvt ? "DNVT" : "YCVT"}-${safeFormNo}.pdf`;

    // Convert Uint8Array → ArrayBuffer thuần để satisfy Node 20+ Blob typings.
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    const blob = new Blob([ab], { type: "application/pdf" });

    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error({ err }, "ycvt export-pdf failed");
    return jsonError(
      "INTERNAL",
      `Không tạo được PDF: ${(err as Error).message}`,
      500,
    );
  }
}
