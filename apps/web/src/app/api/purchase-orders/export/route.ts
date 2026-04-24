/**
 * GET /api/purchase-orders/export — V1.9-P9.
 *
 * Xuất Excel (.xlsx) danh sách PO cho kế toán. Filter qua query:
 *   - status (array)
 *   - supplierId
 *   - from / to  (orderDate range, ISO date)
 *
 * Mỗi dòng Excel = 1 purchase_order_line (flatten). Format VND có dot
 * thousand separator, date dd/MM/yyyy.
 *
 * Role: read po (admin/planner/warehouse đều xem được — quyền do RBAC matrix
 * decide).
 */

import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { poExportQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { listPOsForExport } from "@/server/repos/purchaseOrders";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function fmtVND(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "0";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "0";
  // VN locale: dot thousand separator, no decimal.
  return Math.round(num).toLocaleString("vi-VN");
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  SENT: "Đã gửi",
  PARTIAL: "Nhận 1 phần",
  RECEIVED: "Đã nhận đủ",
  CANCELLED: "Đã huỷ",
  CLOSED: "Đã đóng",
};

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "po");
  if ("response" in guard) return guard.response;

  const parsed = parseSearchParams(req, poExportQuerySchema);
  if ("response" in parsed) return parsed.response;

  try {
    const rows = await listPOsForExport({
      status: parsed.data.status,
      supplierId: parsed.data.supplierId,
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null,
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "IoT MES - Kế toán";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("PO-export");
    sheet.columns = [
      { header: "Mã PO", key: "poNo", width: 22 },
      { header: "Ngày tạo", key: "orderDate", width: 12 },
      { header: "Nhà cung cấp", key: "supplierName", width: 28 },
      { header: "Mã NCC", key: "supplierCode", width: 14 },
      { header: "Mã thuế NCC", key: "supplierTax", width: 16 },
      { header: "Dòng", key: "lineNo", width: 6 },
      { header: "Mã vật tư", key: "itemSku", width: 18 },
      { header: "Tên vật tư", key: "itemName", width: 36 },
      { header: "ĐVT", key: "uom", width: 8 },
      { header: "SL đặt", key: "qty", width: 12 },
      { header: "Đơn giá (VND)", key: "unitPrice", width: 16 },
      { header: "VAT %", key: "taxRate", width: 8 },
      { header: "Thành tiền trước VAT", key: "preTax", width: 20 },
      { header: "Tiền VAT", key: "vat", width: 16 },
      { header: "Tổng tiền (VND)", key: "lineTotal", width: 20 },
      { header: "Ngày dự kiến nhận", key: "expectedEta", width: 18 },
      { header: "Ngày thực tế nhận", key: "actualDelivery", width: 18 },
      { header: "Trạng thái", key: "status", width: 14 },
      { header: "Mã PR liên kết", key: "prId", width: 20 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF4F4F5" },
    };
    sheet.getRow(1).alignment = { vertical: "middle" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const r of rows) {
      const qty = Number(r.orderedQty ?? 0);
      const price = Number(r.unitPrice ?? 0);
      const tax = Number(r.taxRate ?? 0);
      const preTax = qty * price;
      const vat = preTax * (tax / 100);
      const lineTotal = Number(r.lineTotal ?? 0) || preTax + vat;
      sheet.addRow({
        poNo: r.poNo,
        orderDate: fmtDate(r.orderDate),
        supplierName: r.supplierName ?? "",
        supplierCode: r.supplierCode ?? "",
        supplierTax: r.supplierTaxCode ?? "",
        lineNo: r.lineNo,
        itemSku: r.itemSku ?? "",
        itemName: r.itemName ?? "",
        uom: r.itemUom ?? "",
        qty: qty,
        unitPrice: fmtVND(price),
        taxRate: tax,
        preTax: fmtVND(preTax),
        vat: fmtVND(vat),
        lineTotal: fmtVND(lineTotal),
        expectedEta: fmtDate(r.expectedEta ?? null),
        actualDelivery: fmtDate(r.actualDeliveryDate ?? null),
        status: STATUS_LABEL[r.status] ?? r.status,
        prId: r.prId ?? "",
      });
    }

    // Format cột số tabular-nums align right
    const numCols = ["qty", "unitPrice", "preTax", "vat", "lineTotal", "taxRate"];
    for (const col of numCols) {
      const c = sheet.getColumn(col);
      c.alignment = { horizontal: "right" };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const ts = new Date().toISOString().slice(0, 10);
    const filename = `purchase-orders-${ts}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Export-Count": String(rows.length),
      },
    });
  } catch (err) {
    logger.error({ err }, "export PO failed");
    return jsonError("INTERNAL", "Lỗi xuất Excel PO.", 500);
  }
}
