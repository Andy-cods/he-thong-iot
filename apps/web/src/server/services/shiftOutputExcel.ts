import ExcelJS from "exceljs";
import { sanitizeExcelCellValue } from "./excelSafety";
import { computeKpis } from "@/lib/shift-output/kpi";
import { paretoFor, summarize, type ReportEntryLike } from "@/lib/shift-output/report";
import { hhmm } from "@/lib/shift-output/shift-window";

/**
 * V4.10 (TASK-20261118-001) — Xuất Excel Sản lượng ca: 2 sheet "Chi tiết" (mọi
 * dòng) + "Tổng hợp" (tổng, theo máy / mã hàng / ca / người, Pareto lỗi).
 * KHÔNG khớp mẫu (xưởng chưa có file Excel — PLAN §1). Mọi chuỗi người dùng nhập
 * đi qua `sanitizeExcelCellValue` (chống formula injection).
 */

export interface ExcelEntryRow extends ReportEntryLike {
  shiftEnd: string;
  customerName: string | null;
  qtyRework: number | null;
  materialLot: string | null;
  notes: string | null;
}

export interface ExcelDetail {
  entryId: string;
  reasonId: string;
  reasonName: string;
  value: number;
}

const s = <T,>(v: T) => sanitizeExcelCellValue(v);
const ddmmyyyy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const pct = (v: number | null) => (v == null ? "" : Math.round(v * 10) / 1000);

function headerRow(ws: ExcelJS.Worksheet, values: string[]) {
  const row = ws.addRow(values);
  row.font = { bold: true };
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFD4D4D8" } } };
  });
  return row;
}

export async function buildShiftOutputWorkbook(input: {
  siteName: string;
  from: string;
  to: string;
  entries: ExcelEntryRow[];
  defects: ExcelDetail[];
  downtimes: ExcelDetail[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MES Song Châu";

  /* ── Sheet 1: Chi tiết ── */
  const ws = wb.addWorksheet("Chi tiết");
  ws.mergeCells("A1:R1");
  ws.getCell("A1").value = s(`SẢN LƯỢNG CA — ${input.siteName}`);
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A2:R2");
  ws.getCell("A2").value = `Từ ${ddmmyyyy(input.from)} đến ${ddmmyyyy(input.to)} · ${input.entries.length} dòng`;
  ws.addRow([]);
  headerRow(ws, [
    "Ngày",
    "Ca",
    "Máy",
    "Mã hàng",
    "Tên hàng",
    "Khách hàng",
    "Người phụ trách",
    "Kế hoạch",
    "OK",
    "NG",
    "% NG",
    "Sửa lại",
    "Phút dừng",
    "Chi tiết lỗi",
    "Chi tiết dừng máy",
    "Lô phôi / Ghi chú",
    "Giờ chạy",
    "Phút chạy",
  ]);
  ws.views = [{ state: "frozen", ySplit: 4 }];
  ws.columns = [
    { width: 12 },
    { width: 8 },
    { width: 10 },
    { width: 18 },
    { width: 28 },
    { width: 16 },
    { width: 20 },
    { width: 10 },
    { width: 10 },
    { width: 8 },
    { width: 8 },
    { width: 9 },
    { width: 10 },
    { width: 32 },
    { width: 32 },
    { width: 30 },
    { width: 13 },
    { width: 10 },
  ];
  const detailText = (list: ExcelDetail[], id: string, unit: string) =>
    list
      .filter((d) => d.entryId === id)
      .map((d) => `${d.reasonName} ${d.value}${unit}`)
      .join("; ");
  for (const r of input.entries) {
    const produced = r.qtyOk + r.qtyNg;
    const row = ws.addRow([
      ddmmyyyy(r.prodDate),
      s(r.shiftName),
      s(r.machineCode),
      s(r.partCode),
      s(r.partName),
      s(r.customerName ?? ""),
      s(r.operatorName ?? ""),
      r.qtyPlanned ?? "",
      r.qtyOk,
      r.qtyNg,
      produced > 0 ? r.qtyNg / produced : "",
      r.qtyRework ?? "",
      r.downtimeMin ?? "",
      s(detailText(input.defects, r.id, "")),
      s(detailText(input.downtimes, r.id, "'")),
      s([r.materialLot, r.notes].filter(Boolean).join(" · ")),
      // P2 — giờ chạy thực tế (dòng cũ: giờ ca) + phút khả dụng của dòng.
      r.workStart && r.workEnd
        ? `${hhmm(r.workStart)}–${hhmm(r.workEnd)}`
        : `${hhmm(r.shiftStart)}–${hhmm(r.shiftEnd)}`,
      r.shiftMinutes,
    ]);
    for (const c of [8, 9, 10, 12, 13, 18]) row.getCell(c).numFmt = "#,##0";
    row.getCell(11).numFmt = "0.0%";
  }

  /* ── Sheet 2: Tổng hợp ── */
  const ts = wb.addWorksheet("Tổng hợp");
  ts.columns = [{ width: 22 }, { width: 28 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 9 }, { width: 11 }, { width: 11 }, { width: 12 }];
  ts.mergeCells("A1:I1");
  ts.getCell("A1").value = s(`TỔNG HỢP SẢN LƯỢNG CA — ${input.siteName}`);
  ts.getCell("A1").font = { bold: true, size: 14 };
  ts.getCell("A2").value = `Từ ${ddmmyyyy(input.from)} đến ${ddmmyyyy(input.to)}`;

  const total = computeKpis(input.entries);
  ts.addRow([]);
  headerRow(ts, ["Chỉ số", "Giá trị"]);
  const kv: Array<[string, number | string]> = [
    ["Tổng OK", total.ok],
    ["Tổng NG", total.ng],
    ["% NG", pct(total.ngPct)],
    ["% đạt kế hoạch", pct(total.planPct)],
    ["Phút chạy (máy-ca)", total.availableMin],
    ["Phút dừng máy", total.downtimeMin ?? ""],
    ["% khả dụng", pct(total.availabilityPct)],
  ];
  for (const [k, v] of kv) {
    const row = ts.addRow([k, v]);
    if (k.startsWith("%")) row.getCell(2).numFmt = "0.0%";
    else row.getCell(2).numFmt = "#,##0";
  }

  const section = (title: string, group: "machine" | "part" | "shift" | "operator") => {
    ts.addRow([]);
    const t = ts.addRow([title]);
    t.font = { bold: true, size: 12 };
    headerRow(ts, ["Mã / Tên", "Mô tả", "Số ca", "OK", "NG", "% NG", "TB OK/ca", "Phút dừng", "% khả dụng"]);
    for (const r of summarize(input.entries, group)) {
      const row = ts.addRow([
        s(r.label),
        s(r.sub ?? ""),
        r.shiftsRun,
        r.kpi.ok,
        r.kpi.ng,
        pct(r.kpi.ngPct),
        r.avgOkPerShift == null ? "" : Math.round(r.avgOkPerShift),
        r.kpi.downtimeMin ?? "",
        pct(r.kpi.availabilityPct),
      ]);
      row.getCell(6).numFmt = "0.0%";
      row.getCell(9).numFmt = "0.0%";
      for (const c of [4, 5, 7, 8]) row.getCell(c).numFmt = "#,##0";
    }
  };
  section("Theo máy", "machine");
  section("Theo mã hàng", "part");
  section("Theo ca", "shift");
  section("Theo người phụ trách", "operator");

  ts.addRow([]);
  const pt = ts.addRow(["Pareto lỗi (NG)"]);
  pt.font = { bold: true, size: 12 };
  headerRow(ts, ["Lý do", "", "SL", "% ", "% tích luỹ"]);
  for (const p of paretoFor("defect", input.entries, input.defects).rows) {
    const row = ts.addRow([s(p.label), "", p.value, p.pct / 100, p.cumPct / 100]);
    row.getCell(4).numFmt = "0.0%";
    row.getCell(5).numFmt = "0.0%";
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
