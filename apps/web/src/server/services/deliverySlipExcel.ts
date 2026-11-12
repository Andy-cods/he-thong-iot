/**
 * BOM V5 WP8c — xuất "PHIẾU GIAO HÀNG" ra .xlsx bằng cách CLONE template thật
 * của xưởng (apps/web/src/server/templates/delivery-slip-template.xlsx, từ file
 * "FORM GTAM Phieu giao hang.xlsx") để giữ nguyên merge, độ rộng cột, font
 * Times New Roman, khối chữ ký.
 *
 * Ô điền (sheet 1):
 *   L3 ngày (ô ngày thật, numFmt "Ngày dd tháng mm năm yyyy") · N4 số phiếu
 *   A6 "TO : <bên nhận>" (tên in đậm) · A7 "Địa Chỉ : …"
 *   dòng 11.. : A STT · B(:C) Tên hàng · D/E/F Dài/Rộng/Cao · G Yêu cầu kỹ thuật
 *               H Mã hàng · I Mã quản lý · J ĐVT · K Chứng từ · L Thực nhận
 *               M Đơn giá · N Ghi chú
 *   dòng "Tổng": K = SUM(Chứng từ)
 * Mẫu có sẵn 22 dòng dữ liệu (11–32); nhiều hơn thì chèn thêm dòng trước "Tổng".
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { toExcelVnDate } from "@/lib/format";
import { sanitizeExcelCellValue as safe } from "@/server/services/excelSafety";
import type { SlipDetail, SlipLineSnap } from "@/server/repos/deliverySlips";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "src",
  "server",
  "templates",
  "delivery-slip-template.xlsx",
);

const FIRST_ROW = 11;
const TEMPLATE_CAPACITY = 22; // dòng 11..32
const TOTAL_ROW = FIRST_ROW + TEMPLATE_CAPACITY; // 33
const COLS = 14; // A..N

let cachedTemplate: Buffer | null = null;
async function loadTemplate(): Promise<Buffer> {
  if (!cachedTemplate) cachedTemplate = await fs.promises.readFile(TEMPLATE_PATH);
  return cachedTemplate;
}

const FONT_13 = { name: "Times New Roman", size: 13 };

/** Chèn `k` dòng trống trước dòng Tổng, giữ merge/độ cao/style phía dưới. */
function insertRowsBeforeTotal(ws: ExcelJS.Worksheet, k: number): void {
  const merges: string[] = [...((ws.model as { merges?: string[] }).merges ?? [])];
  const below = merges.filter((m) => Number(/\d+/.exec(m)![0]) >= TOTAL_ROW);
  for (const m of below) ws.unMergeCells(m);

  const heights = new Map<number, number | undefined>();
  const lastRow = Math.max(ws.rowCount, 60);
  for (let r = TOTAL_ROW; r <= lastRow; r++) heights.set(r, ws.getRow(r).height);

  ws.spliceRows(TOTAL_ROW, 0, ...Array.from({ length: k }, () => [] as unknown[]));

  for (let r = TOTAL_ROW; r <= lastRow; r++) {
    const h = heights.get(r);
    if (h !== undefined) ws.getRow(r + k).height = h;
  }
  const styleSrc = ws.getRow(FIRST_ROW + TEMPLATE_CAPACITY - 1);
  for (let i = 0; i < k; i++) {
    const row = ws.getRow(TOTAL_ROW + i);
    row.height = styleSrc.height;
    for (let c = 1; c <= COLS; c++) row.getCell(c).style = { ...styleSrc.getCell(c).style };
  }
  const shift = (ref: string) =>
    ref.replace(/([A-Z]+)(\d+)/g, (_s, col: string, r: string) => `${col}${Number(r) + k}`);
  for (const m of below) ws.mergeCells(shift(m));
  for (let i = 0; i < k; i++) ws.mergeCells(`B${TOTAL_ROW + i}:C${TOTAL_ROW + i}`);
  const pa = ws.pageSetup.printArea;
  if (typeof pa === "string") ws.pageSetup.printArea = shift(pa);
}

export async function buildDeliverySlipExcel(detail: SlipDetail): Promise<Buffer> {
  const { slip, lines } = detail;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await loadTemplate()) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0]!;

  const extra = Math.max(0, lines.length - TEMPLATE_CAPACITY);
  if (extra > 0) insertRowsBeforeTotal(ws, extra);
  const totalRow = TOTAL_ROW + extra;

  const created = toExcelVnDate(slip.createdAt);
  const first = (lines[0]?.snap ?? null) as SlipLineSnap | null;
  const recipient = first?.recipient ?? { name: slip.recipientText ?? "", address: null };

  const l3 = ws.getCell("L3");
  l3.value = created;
  l3.numFmt = '"Ngày "dd" tháng "mm" năm "yyyy';
  ws.getCell("N4").value = slip.slipNo;
  ws.getCell("A6").value = {
    richText: [
      { font: { ...FONT_13 }, text: "TO : " },
      { font: { ...FONT_13, bold: true }, text: safe(recipient.name) },
    ],
  };
  ws.getCell("A7").value = `Địa Chỉ : ${safe(recipient.address ?? "")}`.trimEnd();

  // Xoá dòng mẫu (ví dụ "Chi tiết nhôm"...) trước khi điền.
  const capacity = TEMPLATE_CAPACITY + extra;
  for (let i = 0; i < capacity; i++) {
    const r = FIRST_ROW + i;
    for (const c of ["A", "B", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"]) {
      ws.getCell(`${c}${r}`).value = null;
    }
  }

  lines.forEach((ln, i) => {
    const r = FIRST_ROW + i;
    const s = ln.snap as SlipLineSnap;
    ws.getCell(`A${r}`).value = ln.stt;
    ws.getCell(`B${r}`).value = safe(s.name);
    if (s.dims) {
      ws.getCell(`D${r}`).value = s.dims.l;
      ws.getCell(`E${r}`).value = s.dims.w;
      ws.getCell(`F${r}`).value = s.dims.h;
    }
    ws.getCell(`G${r}`).value = s.surfaceTreatment ? safe(s.surfaceTreatment) : null;
    ws.getCell(`H${r}`).value = s.positionCode ? safe(s.positionCode) : null;
    ws.getCell(`I${r}`).value = s.projectCode ? safe(s.projectCode) : null;
    ws.getCell(`J${r}`).value = s.uom ?? "Cái";
    ws.getCell(`K${r}`).value = Number(ln.qtyDoc);
    const recv = Number(ln.qtyReceived);
    ws.getCell(`L${r}`).value = recv > 0 ? recv : null;
    if (ln.unitPrice != null) {
      const m = ws.getCell(`M${r}`);
      m.value = Number(ln.unitPrice);
      m.numFmt = "#,##0";
    }
    ws.getCell(`N${r}`).value = ln.note ? safe(ln.note) : null;
  });

  const totalDoc = lines.reduce((a, l) => a + Number(l.qtyDoc), 0);
  ws.getCell(`K${totalRow}`).value = {
    formula: `SUM(K${FIRST_ROW}:K${totalRow - 1})`,
    result: Math.round(totalDoc * 1e4) / 1e4,
  };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
