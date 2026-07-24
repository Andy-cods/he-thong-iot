import { type NextRequest } from "next/server";
import { PR_STATUS_LABELS, type PRStatus } from "@iot/shared";
import { logger } from "@/lib/logger";
import { listPRsInRange } from "@/server/repos/purchaseRequests";
import { jsonError } from "@/server/http";
import { canViewAllPRs } from "@/server/services/prAccess";
import { requireCan } from "@/server/session";
import {
  buildSlipsWorkbook,
  formatVNDateTime,
  type SlipSheet,
  type SummaryTable,
} from "@/server/services/batchSlipsExcel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Nhãn ưu tiên dòng — trùng mapping với ycvtExportExcel.ts (không export dùng chung để tránh coupling 2 module xuất file). */
const PRIORITY_LABEL: Record<string, string> = {
  URGENT: "Khẩn",
  NORMAL: "Bình thường",
  RESERVE: "Dự phòng",
};

/**
 * V3.14 — GET /api/purchase-requests/export-excel?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Xuất toàn bộ PR (YCVT/MRF/DNVT) tạo trong khoảng [from, to] (giờ +07):
 * 1 sheet "Tổng hợp" + mỗi phiếu 1 sheet chi tiết. Scope theo RBAC — chỉ role
 * canViewAllPRs mới thấy phiếu của người khác (giống GET /api/purchase-requests).
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

    const summary: SummaryTable = {
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
        s.formType,
        PR_STATUS_LABELS[s.status as PRStatus] ?? s.status,
        s.requestedByName || "—",
        s.lines.length,
      ]),
    };

    const slips: SlipSheet[] = slipsData.map((s) => ({
      sheetName: s.paperFormNo ?? s.code,
      title: `ĐỀ XUẤT MUA VẬT TƯ — ${s.paperFormNo ?? s.code}`,
      info: [
        ["Loại phiếu", s.formType],
        ["Trạng thái", PR_STATUS_LABELS[s.status as PRStatus] ?? s.status],
        ["Người đề xuất", s.requestedByName || "—"],
        ["Bộ phận đề xuất", s.proposingDepartment || "—"],
        ["Ngày tạo", formatVNDateTime(new Date(s.createdAt))],
        ["Lý do", s.requestReason || "—"],
      ],
      columns: [
        { header: "STT", width: 6 },
        { header: "Mã VT", width: 18 },
        { header: "Tên vật tư", width: 40 },
        { header: "Quy cách", width: 24 },
        { header: "ĐVT", width: 8 },
        { header: "SL", width: 10 },
        { header: "Ưu tiên", width: 12 },
        { header: "Đơn giá", width: 14 },
        { header: "Ghi chú", width: 28 },
      ],
      rows: s.lines.map((l) => [
        l.lineNo,
        l.sku ?? "—",
        l.name ?? "—",
        l.specification ?? "—",
        l.uom ?? "—",
        Number(l.qty),
        (l.priority && PRIORITY_LABEL[l.priority]) || l.priority || "—",
        l.estimatedUnitPrice != null ? Number(l.estimatedUnitPrice) : null,
        l.notes ?? "",
      ]),
    }));

    const buf = await buildSlipsWorkbook({
      workbookTitle: `Đề xuất mua vật tư ${from} – ${to}`,
      summary,
      slips,
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
    logger.error({ err }, "purchase-requests export-excel failed");
    return jsonError("INTERNAL", "Không xuất được file Excel.", 500);
  }
}
