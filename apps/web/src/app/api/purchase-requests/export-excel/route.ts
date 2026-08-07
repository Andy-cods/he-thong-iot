import { type NextRequest } from "next/server";
import { PR_STATUS_LABELS, type PRStatus } from "@iot/shared";
import { logger } from "@/lib/logger";
import { listPRsInRange, type PRSlip } from "@/server/repos/purchaseRequests";
import { jsonError } from "@/server/http";
import { canViewAllPRs } from "@/server/services/prAccess";
import { requireCan } from "@/server/session";
import { formatVNDateTime } from "@/server/services/batchSlipsExcel";
import { deriveDisplayLabel, NO_LINE_LABEL } from "@/lib/pr-display-label";
import {
  buildPrTemplateWorkbook,
  type PrSheetInput,
  type PrSummary,
} from "@/server/services/batchPrTemplateExcel";
import type { YcvtExportData } from "@/server/services/ycvtExportExcel";
import type { DnvtExportData } from "@/server/services/dnvtExportExcel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const num = (v: string | null): number | null => (v != null ? Number(v) : null);
const dt = (v: Date | string | null | undefined): Date | null =>
  v ? new Date(v) : null;

/** V3.15 — Map 1 PR (kèm lines + tên người duyệt) → data cho template YCVT. */
function toYcvtData(s: PRSlip): YcvtExportData {
  return {
    paperFormNo: s.paperFormNo ?? s.code,
    createdAt: new Date(s.createdAt),
    targetDepartment: s.targetDepartment ?? null,
    proposingDepartment: s.proposingDepartment ?? null,
    requestedByName: s.requestedByName,
    requestReason: s.requestReason ?? null,
    lines: s.lines.map((l) => ({
      lineNo: l.lineNo,
      sku: l.sku,
      name: l.name,
      specification: l.specification,
      uom: l.uom,
      qty: Number(l.qty) || 0,
      onHandSnapshot: num(l.onHandSnapshot),
      approvedQty: num(l.approvedQty),
      neededBy: l.neededBy,
      priority: l.priority,
      category: l.category,
      estimatedUnitPrice: num(l.estimatedUnitPrice),
      referenceCode: l.referenceCode,
      notes: l.notes,
    })),
    deptApprovedByName: s.deptApprovedByName,
    deptApprovedAt: dt(s.deptApprovedAt),
    deptApprovalNote: s.deptApprovalNote ?? null,
    directorApprovedByName: s.directorApprovedByName,
    directorApprovedAt: dt(s.directorApprovedAt),
    directorApprovalNote: s.directorApprovalNote ?? null,
    poCreatedAt: dt(s.poCreatedAt),
    goodsReceivedAt: dt(s.goodsReceivedAt),
    goodsIssuedAt: dt(s.goodsIssuedAt),
    completedAt: dt(s.completedAt),
  };
}

/** V3.15 — Map 1 PR → data cho template DNVT (mẫu giấy GTAM). */
function toDnvtData(s: PRSlip): DnvtExportData {
  return {
    paperFormNo: s.paperFormNo ?? s.code,
    createdAt: new Date(s.createdAt),
    targetDepartment: s.targetDepartment ?? null,
    proposingDepartment: s.proposingDepartment ?? null,
    requestedByName: s.requestedByName,
    requestReason: s.requestReason ?? null,
    lines: s.lines.map((l) => ({
      lineNo: l.lineNo,
      name: l.name,
      specification: l.specification,
      uom: l.uom,
      qty: Number(l.qty) || 0,
      onHandSnapshot: num(l.onHandSnapshot),
      approvedQty: num(l.approvedQty),
      neededBy: l.neededBy,
      priority: l.priority,
      category: l.category,
      referenceCode: l.referenceCode,
      referenceNote: l.referenceNote,
      notes: l.notes,
      deliveryDate: l.deliveryDate,
    })),
    deptApprovedByName: s.deptApprovedByName,
    deptApprovedAt: dt(s.deptApprovedAt),
    directorApprovedByName: s.directorApprovedByName,
    directorApprovedAt: dt(s.directorApprovedAt),
  };
}

/**
 * V3.15 — GET /api/purchase-requests/export-excel?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Xuất toàn bộ PR tạo trong khoảng [from, to] (giờ +07) ra 1 file Excel: sheet
 * "Tổng hợp" + MỖI PHIẾU 1 SHEET, mỗi sheet giữ nguyên bố cục phiếu gốc
 * (YCVT/MRF hoặc DNVT theo formType). Scope theo RBAC canViewAllPRs.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "pr");
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return jsonError(
      "VALIDATION",
      "Thiếu hoặc sai định dạng from/to (YYYY-MM-DD).",
      400,
    );
  }

  const viewAll = canViewAllPRs(guard.session.roles);
  const requestedBy = viewAll ? undefined : guard.session.userId;

  try {
    const slipsData = await listPRsInRange({ from, to, requestedBy });

    const summary: PrSummary = {
      columns: [
        { header: "Mã phiếu", width: 20 },
        { header: "Ngày tạo", width: 18 },
        { header: "Loại", width: 8 },
        { header: "Trạng thái", width: 14 },
        { header: "Người đề xuất", width: 24 },
        { header: "Số dòng", width: 10 },
      ],
      rows: slipsData.map((s) => [
        s.paperFormNo ?? s.code,
        formatVNDateTime(new Date(s.createdAt)),
        s.formType ?? "MRF",
        PR_STATUS_LABELS[s.status as PRStatus] ?? s.status,
        s.requestedByName || "—",
        s.lines.length,
      ]),
    };

    // V3.16 (mục 5) — tên tab dùng nhãn vật tư ngắn gọn thay số hiệu phiếu
    // (VD "3-PRD-MRF-0726" khó phân biệt khi có hàng chục tab cùng dạng).
    // maxLen=24 chừa chỗ cho hậu tố "+N" + hậu tố dedupe " (2)" của
    // sanitizeSheetName trong giới hạn cứng 31 ký tự của Excel. Số hiệu
    // chính thức (paperFormNo) vẫn in nguyên trong nội dung sheet (ô O2/L2).
    const sheets: PrSheetInput[] = slipsData.map((s) => {
      const label = deriveDisplayLabel(
        s.lines.map((l) => ({ name: l.name, sku: l.sku })),
        24,
      );
      const sheetName = label !== NO_LINE_LABEL ? label : (s.paperFormNo ?? s.code);
      return s.formType === "DNVT"
        ? { kind: "dnvt" as const, sheetName, data: toDnvtData(s) }
        : { kind: "ycvt" as const, sheetName, data: toYcvtData(s) };
    });

    const buf = await buildPrTemplateWorkbook({
      workbookTitle: `Đề xuất mua vật tư ${from} – ${to}`,
      summary,
      sheets,
    });

    const filename = `DeXuatVatTu_${from}_den_${to}.xlsx`;
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
    logger.error({ err }, "purchase-requests export-excel (template) failed");
    return jsonError("INTERNAL", "Không xuất được file Excel.", 500);
  }
}
