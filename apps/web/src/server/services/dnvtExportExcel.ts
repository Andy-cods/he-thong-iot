/**
 * V3.10 DNVT — Build Excel khớp 100% form giấy DNVT 567 (mẫu GTAM/PRD-MRF-02)
 * cho 1 phiếu có form_type='DNVT'. Tách riêng khỏi buildYcvtExcel (template +
 * toạ độ khác: bảng 14 cột A–N, KHÔNG có Mã VT/Đơn giá/Tổng tiền/mục IV-V,
 * THÊM cột Tham khảo + Ngày giao hàng).
 *
 * Cell mapping (template `dnvt-mrf-template.xlsx`, sheet "Phiếu DNVT"):
 *   L2 — Số phiếu (paperFormNo)         L3 — Ngày lập (createdAt, date)
 *   C7 — Kính gửi (targetDepartment)    C8 — Bộ phận đề xuất (proposingDepartment)
 *   C9 — Người đề xuất (requestedByName) C10 — Lý do đề xuất (requestReason)
 *
 *   Bảng II — rows 14→33 (20 dòng pre-style), A=STT có sẵn:
 *     B Tên vật tư · C Quy cách · D ĐVT · E SL yêu cầu · F Tồn kho · G Duyệt ·
 *     H Ngày cần · I Ưu tiên · J Phân loại · K Mã tham chiếu · L Tham khảo ·
 *     M Ghi chú · N Ngày giao hàng
 *
 *   III. Kiểm tra & Phê duyệt — rows 37→41 (C=Họ tên, I=Ký tên/Ngày):
 *     37 Người đề xuất (C=name, I=createdAt)
 *     38 Kiểm tra tồn kho (trống — ký tay)
 *     39 Kiểm tra kỹ thuật (trống — ký tay)
 *     40 Trưởng bộ phận (C=deptName, I=deptDate)
 *     41 Giám đốc (C=directorName, I=directorDate)
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const PRIORITY_LABEL: Record<string, string> = {
  URGENT: "Khẩn",
  NORMAL: "Bình thường",
  RESERVE: "Dự phòng",
};

const CATEGORY_LABEL: Record<string, string> = {
  TOOL: "CCDC",
  CONSUMABLE: "Tiêu hao",
  MATERIAL: "Vật tư phục vụ SX",
  OTHER: "Khác",
};

export interface DnvtExportLine {
  lineNo: number;
  name?: string | null;
  specification?: string | null;
  uom?: string | null;
  qty: number;
  onHandSnapshot?: number | null;
  approvedQty?: number | null;
  neededBy?: string | Date | null;
  priority?: string | null;
  category?: string | null;
  referenceCode?: string | null;
  referenceNote?: string | null;
  notes?: string | null;
  deliveryDate?: string | Date | null;
}

export interface DnvtExportData {
  paperFormNo: string;
  createdAt: Date;
  targetDepartment?: string | null;
  proposingDepartment?: string | null;
  requestedByName?: string | null;
  requestReason?: string | null;
  lines: DnvtExportLine[];

  // Approval signatures (mục III)
  deptApprovedByName?: string | null;
  deptApprovedAt?: Date | null;
  directorApprovedByName?: string | null;
  directorApprovedAt?: Date | null;
}

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "src",
  "server",
  "templates",
  "dnvt-mrf-template.xlsx",
);

const LOGO_CANDIDATES = [
  path.join(process.cwd(), "public", "img", "logo-gtam.png"),
  path.join(process.cwd(), "apps", "web", "public", "img", "logo-gtam.png"),
];

let cachedTemplateBuffer: Buffer | null = null;
let cachedLogoBuffer: Buffer | null = null;

async function loadTemplateBuffer(): Promise<Buffer> {
  if (!cachedTemplateBuffer) {
    cachedTemplateBuffer = await fs.promises.readFile(TEMPLATE_PATH);
  }
  return cachedTemplateBuffer;
}

async function loadLogoBuffer(): Promise<Buffer | null> {
  if (cachedLogoBuffer) return cachedLogoBuffer;
  for (const p of LOGO_CANDIDATES) {
    try {
      cachedLogoBuffer = await fs.promises.readFile(p);
      return cachedLogoBuffer;
    } catch {
      /* try next */
    }
  }
  return null;
}

function fmtDateVN(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** V3.15 — Template + sheet name export dùng chung cho batch (mỗi phiếu 1 sheet). */
export const DNVT_TEMPLATE_SHEET = "Phiếu DNVT";
export async function getDnvtTemplateBuffer(): Promise<Buffer> {
  return loadTemplateBuffer();
}

/**
 * V3.15 — Nhúng logo GTAM (box A1:B4) vào 1 worksheet. Tách riêng để batch add
 * lại logo cho từng sheet SAU khi copy model (ảnh không đi theo model).
 */
export async function addDnvtLogo(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
): Promise<void> {
  const logoBuf = await loadLogoBuffer();
  if (!logoBuf) return;
  const imageId = wb.addImage({
    buffer: logoBuf as unknown as ExcelJS.Buffer,
    extension: "png",
  });
  ws.addImage(imageId, {
    tl: { col: 0.1, row: 0.15 },
    br: { col: 2, row: 3.6 },
    editAs: "oneCell",
  } as unknown as Parameters<typeof ws.addImage>[1]);
}

/**
 * V3.15 — Fill dữ liệu DNVT vào 1 worksheet template (KHÔNG động logo). Dùng
 * chung cho export 1 phiếu + export nhiều phiếu 1 sheet.
 */
export function fillDnvtCells(ws: ExcelJS.Worksheet, data: DnvtExportData): void {
  // Header
  ws.getCell("L2").value = data.paperFormNo;
  ws.getCell("L3").value = data.createdAt; // ExcelJS Date → numeric (fmt dd/mm/yyyy)

  // Section I
  ws.getCell("C7").value = data.targetDepartment ?? "";
  ws.getCell("C8").value = data.proposingDepartment ?? "";
  ws.getCell("C9").value = data.requestedByName ?? "";
  ws.getCell("C10").value = data.requestReason ?? "";

  // Section II — lines (rows 14..33, max 20)
  const LINE_START_ROW = 14;
  const MAX_LINES = 20;
  for (let i = 0; i < Math.min(data.lines.length, MAX_LINES); i++) {
    const r = LINE_START_ROW + i;
    const l = data.lines[i]!;
    ws.getCell(`B${r}`).value = l.name ?? "";
    ws.getCell(`C${r}`).value = l.specification ?? "";
    ws.getCell(`D${r}`).value = l.uom ?? "";
    ws.getCell(`E${r}`).value = l.qty;
    if (l.onHandSnapshot != null) ws.getCell(`F${r}`).value = l.onHandSnapshot;
    if (l.approvedQty != null) ws.getCell(`G${r}`).value = l.approvedQty;
    if (l.neededBy) ws.getCell(`H${r}`).value = fmtDateVN(l.neededBy);
    ws.getCell(`I${r}`).value = PRIORITY_LABEL[l.priority ?? "NORMAL"] ?? "";
    ws.getCell(`J${r}`).value = CATEGORY_LABEL[l.category ?? "OTHER"] ?? "";
    ws.getCell(`K${r}`).value = l.referenceCode ?? "";
    ws.getCell(`L${r}`).value = l.referenceNote ?? "";
    ws.getCell(`M${r}`).value = l.notes ?? "";
    if (l.deliveryDate) ws.getCell(`N${r}`).value = fmtDateVN(l.deliveryDate);
  }

  // Section III — phê duyệt (rows 37..41; C=Họ tên, I=Ký tên/Ngày)
  ws.getCell("C37").value = data.requestedByName ?? "";
  if (data.createdAt) ws.getCell("I37").value = fmtDateVN(data.createdAt);
  // 38 Kiểm tra tồn kho + 39 Kiểm tra kỹ thuật: để trống (ký tay offline).
  if (data.deptApprovedByName) {
    ws.getCell("C40").value = data.deptApprovedByName;
    ws.getCell("I40").value = fmtDateVN(data.deptApprovedAt);
  }
  if (data.directorApprovedByName) {
    ws.getCell("C41").value = data.directorApprovedByName;
    ws.getCell("I41").value = fmtDateVN(data.directorApprovedAt);
  }
}

/**
 * Build Excel buffer cho DNVT export 1 phiếu. Clone template + logo + fill.
 * Trả Uint8Array.
 */
export async function buildDnvtExcel(data: DnvtExportData): Promise<Uint8Array> {
  const buf = await loadTemplateBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  const ws = wb.getWorksheet(DNVT_TEMPLATE_SHEET);
  if (!ws) throw new Error("DNVT_TEMPLATE_INVALID: missing 'Phiếu DNVT' sheet");

  await addDnvtLogo(wb, ws);
  fillDnvtCells(ws, data);

  const arrayBuf = await wb.xlsx.writeBuffer();
  return new Uint8Array(arrayBuf);
}
