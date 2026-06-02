import { type NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { userAccount } from "@iot/db/schema";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { getPR, getPRLinesEnriched } from "@/server/repos/purchaseRequests";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import {
  buildYcvtExcel,
  type YcvtExportLine,
} from "@/server/services/ycvtExportExcel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.69 YCVT — GET /api/purchase-requests/[id]/export-excel
 * Trả file .xlsx khớp 100% template "Phiếu MRF".
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

    const linesRaw = await getPRLinesEnriched(params.id);

    // Bulk lookup user names cho 3 vai trò (requester, dept, director)
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

    const lines: YcvtExportLine[] = linesRaw.map((l) => ({
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

    const buf = await buildYcvtExcel({
      paperFormNo: pr.paperFormNo ?? pr.code,
      createdAt: new Date(pr.createdAt),
      targetDepartment: pr.targetDepartment ?? null,
      proposingDepartment: pr.proposingDepartment ?? null,
      requestedByName: pr.requestedBy ? userMap.get(pr.requestedBy) ?? null : null,
      requestReason: pr.requestReason ?? null,
      lines,
      deptApprovedByName: pr.deptApprovedBy
        ? userMap.get(pr.deptApprovedBy) ?? null
        : null,
      deptApprovedAt: pr.deptApprovedAt ? new Date(pr.deptApprovedAt) : null,
      deptApprovalNote: pr.deptApprovalNote ?? null,
      directorApprovedByName: pr.directorApprovedBy
        ? userMap.get(pr.directorApprovedBy) ?? null
        : null,
      directorApprovedAt: pr.directorApprovedAt
        ? new Date(pr.directorApprovedAt)
        : null,
      directorApprovalNote: pr.directorApprovalNote ?? null,
      poCreatedAt: pr.poCreatedAt ? new Date(pr.poCreatedAt) : null,
      goodsReceivedAt: pr.goodsReceivedAt
        ? new Date(pr.goodsReceivedAt)
        : null,
      goodsIssuedAt: pr.goodsIssuedAt ? new Date(pr.goodsIssuedAt) : null,
      completedAt: pr.completedAt ? new Date(pr.completedAt) : null,
    });

    const safeFormNo = (pr.paperFormNo ?? pr.code).replace(/[\/\\]/g, "-");
    const filename = `YCVT-${safeFormNo}.xlsx`;

    // Copy vào ArrayBuffer thuần để satisfy Node 20+ Response/Blob typings.
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    const blob = new Blob([ab], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error({ err }, "ycvt export-excel failed");
    return jsonError("INTERNAL", "Không xuất được file Excel.", 500);
  }
}
