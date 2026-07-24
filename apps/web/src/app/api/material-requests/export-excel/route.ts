import { type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { listMaterialRequestsInRange } from "@/server/repos/materialRequests";
import { jsonError } from "@/server/http";
import { requireSession } from "@/server/session";
import {
  buildSlipsWorkbook,
  formatVNDateTime,
  type SlipSheet,
  type SummaryTable,
} from "@/server/services/batchSlipsExcel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MR_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ chuẩn bị",
  PICKING: "Đang chuẩn bị",
  READY: "Đã sẵn sàng",
  DELIVERED: "Đã giao",
  CANCELLED: "Đã huỷ",
};

/**
 * V3.14 — GET /api/material-requests/export-excel?from=YYYY-MM-DD&to=YYYY-MM-DD[&mine=1]
 * Xuất toàn bộ phiếu yêu cầu vật tư tạo trong khoảng [from, to] (giờ +07):
 * 1 sheet "Tổng hợp" + mỗi phiếu 1 sheet chi tiết.
 */
export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
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
  const mine = url.searchParams.get("mine") === "1";
  const requestedBy = mine ? guard.session.userId : undefined;

  try {
    const slipsData = await listMaterialRequestsInRange({ from, to, requestedBy });

    const summary: SummaryTable = {
      columns: [
        { header: "Mã phiếu", width: 18 },
        { header: "Ngày tạo", width: 18 },
        { header: "Trạng thái", width: 16 },
        { header: "Người yêu cầu", width: 24 },
        { header: "Số dòng", width: 10 },
      ],
      rows: slipsData.map((s) => [
        s.requestNo,
        formatVNDateTime(new Date(s.createdAt)),
        MR_STATUS_LABELS[s.status] ?? s.status,
        s.requestedByName || s.requestedByUsername || "—",
        s.lines.length,
      ]),
    };

    const slips: SlipSheet[] = slipsData.map((s) => ({
      sheetName: s.requestNo,
      title: `PHIẾU YÊU CẦU VẬT TƯ — ${s.requestNo}`,
      info: [
        ["Trạng thái", MR_STATUS_LABELS[s.status] ?? s.status],
        ["Người yêu cầu", s.requestedByName || s.requestedByUsername || "—"],
        ["Ngày tạo", formatVNDateTime(new Date(s.createdAt))],
        ["Ghi chú", s.notes || "—"],
      ],
      columns: [
        { header: "STT", width: 6 },
        { header: "Mã VT", width: 20 },
        { header: "Tên vật tư", width: 40 },
        { header: "ĐVT", width: 8 },
        { header: "SL yêu cầu", width: 12 },
        { header: "SL chuẩn bị", width: 12 },
        { header: "SL đã giao", width: 12 },
        { header: "Ghi chú", width: 30 },
      ],
      rows: s.lines.map((l) => [
        l.lineNo,
        l.itemSku ?? "—",
        l.itemName ?? "—",
        l.itemUom ?? "—",
        Number(l.requestedQty),
        Number(l.pickedQty),
        Number(l.deliveredQty),
        l.notes ?? "",
      ]),
    }));

    const buf = await buildSlipsWorkbook({
      workbookTitle: `Yêu cầu vật tư ${from} – ${to}`,
      summary,
      slips,
    });

    const filename = `YeuCauVatTu_${from}_den_${to}.xlsx`;
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
    logger.error({ err }, "material-requests export-excel failed");
    return jsonError("INTERNAL", "Không xuất được file Excel.", 500);
  }
}
