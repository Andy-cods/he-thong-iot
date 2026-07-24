/**
 * V3.7.69 YCVT — Build Excel file khớp 100% template "Phiếu MRF" cho 1 PR.
 *
 * Strategy: clone template file (apps/web/src/server/templates/ycvt-mrf-template.xlsx)
 * — file này extract từ Excel mẫu gốc, giữ nguyên 62 merges, column widths,
 * borders, background colors, fonts. Sau đó FILL specific cells theo dữ liệu
 * PR mà KHÔNG động đến styling.
 *
 * Cell mapping (theo file gốc YCVT Z0000002-262422.xlsx, sheet "Phiếu MRF"):
 *   O2 — Số phiếu (paperFormNo)   — replace formula
 *   O3 — Ngày lập (createdAt)     — replace =TODAY() bằng date thực
 *   D6 — Kính gửi (targetDepartment)
 *   D7 — Bộ phận đề xuất (proposingDepartment)
 *   D8 — Người đề xuất (requestedByName)
 *   D9 — Lý do đề xuất (requestReason)
 *
 *   Bảng vật tư từ row 13 → 32 (20 dòng pre-style):
 *     A — STT (đã có 1..20)
 *     B — Tên vật tư
 *     C — Mã VT (SKU)
 *     D — Quy cách (specification)
 *     E — ĐVT (uom)
 *     F — SL yêu cầu (qty)
 *     G — Tồn kho (onHandSnapshot)
 *     H — Duyệt (approvedQty)
 *     I — Ngày cần (neededBy)
 *     J — Ưu tiên (priority label)
 *     K — Phân loại (category label)
 *     L — Đơn giá (estimatedUnitPrice)
 *     M — Tổng tiền (lineTotal) — KEEP formula =IF(...)
 *     N — Mã ref (referenceCode)
 *     O — Ghi chú (notes)
 *
 *   Section III phê duyệt (rows 36-40):
 *     Row 36 = Người đề xuất:  E=name, H=signature (date), L=note
 *     Row 37 = Kiểm tra tồn kho: (warehouse fills offline — leave blank)
 *     Row 38 = Kiểm tra kỹ thuật: (left blank)
 *     Row 39 = Trưởng bộ phận:  E=name, H=date, L=note
 *     Row 40 = Giám đốc:        E=name, H=date, L=note
 *
 *   Section IV theo dõi (rows 44-48):
 *     Row 44 = Đã duyệt đề xuất:    F=who, J=date, M=note
 *     Row 45 = Đã tạo đơn mua:      F=who, J=date, M=note
 *     Row 46 = Đã nhận hàng:        F=who, J=date, M=note
 *     Row 47 = Đã xuất kho:         F=who, J=date, M=note
 *     Row 48 = Hoàn tất:            F=who, J=date, M=note
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

export interface YcvtExportLine {
  lineNo: number;
  sku?: string | null;
  name?: string | null;
  specification?: string | null;
  uom?: string | null;
  qty: number;
  onHandSnapshot?: number | null;
  approvedQty?: number | null;
  neededBy?: string | Date | null;
  priority?: string | null;
  category?: string | null;
  estimatedUnitPrice?: number | null;
  referenceCode?: string | null;
  notes?: string | null;
}

export interface YcvtExportData {
  paperFormNo: string;
  createdAt: Date;
  targetDepartment?: string | null;
  proposingDepartment?: string | null;
  requestedByName?: string | null;
  requestReason?: string | null;
  lines: YcvtExportLine[];

  // Approval signatures
  deptApprovedByName?: string | null;
  deptApprovedAt?: Date | null;
  deptApprovalNote?: string | null;
  directorApprovedByName?: string | null;
  directorApprovedAt?: Date | null;
  directorApprovalNote?: string | null;

  // Tracking timeline
  poCreatedAt?: Date | null;
  goodsReceivedAt?: Date | null;
  goodsIssuedAt?: Date | null;
  completedAt?: Date | null;
}

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "src",
  "server",
  "templates",
  "ycvt-mrf-template.xlsx",
);

// V3.7.69 — Logo GTAM. Path resolution multi-mode (dev + Docker standalone).
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

function fmtDateTimeVN(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** V3.15 — Template + sheet name export dùng chung cho batch (mỗi phiếu 1 sheet). */
export const YCVT_TEMPLATE_SHEET = "Phiếu MRF";
export async function getYcvtTemplateBuffer(): Promise<Buffer> {
  return loadTemplateBuffer();
}

/**
 * V3.15 — Nhúng logo GTAM vào 1 worksheet (anchor B1:B4 — match template
 * drawing1). Tách riêng để batch add lại logo cho từng sheet SAU khi copy model
 * (ảnh không đi theo `worksheet.model`).
 */
export async function addYcvtLogo(
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
    tl: { col: 1.05, row: 0.15 },
    br: { col: 2, row: 3.6 },
    editAs: "oneCell",
  } as unknown as Parameters<typeof ws.addImage>[1]);
}

/**
 * V3.15 — Fill dữ liệu YCVT vào 1 worksheet template (KHÔNG động logo). Dùng
 * chung cho export 1 phiếu (buildYcvtExcel) + export nhiều phiếu 1 sheet.
 */
export function fillYcvtCells(ws: ExcelJS.Worksheet, data: YcvtExportData): void {
  // Header
  ws.getCell("O2").value = data.paperFormNo;
  ws.getCell("O3").value = data.createdAt; // ExcelJS handles Date → numeric

  // Section I
  ws.getCell("D6").value = data.targetDepartment ?? "";
  ws.getCell("D7").value = data.proposingDepartment ?? "";
  ws.getCell("D8").value = data.requestedByName ?? "";
  ws.getCell("D9").value = data.requestReason ?? "";

  // Section II — lines (rows 13..32, max 20)
  const LINE_START_ROW = 13;
  const MAX_LINES = 20;
  for (let i = 0; i < Math.min(data.lines.length, MAX_LINES); i++) {
    const r = LINE_START_ROW + i;
    const l = data.lines[i]!;
    ws.getCell(`B${r}`).value = l.name ?? "";
    ws.getCell(`C${r}`).value = l.sku ?? "";
    ws.getCell(`D${r}`).value = l.specification ?? "";
    ws.getCell(`E${r}`).value = l.uom ?? "";
    ws.getCell(`F${r}`).value = l.qty;
    if (l.onHandSnapshot != null) ws.getCell(`G${r}`).value = l.onHandSnapshot;
    if (l.approvedQty != null) ws.getCell(`H${r}`).value = l.approvedQty;
    if (l.neededBy) ws.getCell(`I${r}`).value = fmtDateVN(l.neededBy);
    ws.getCell(`J${r}`).value = PRIORITY_LABEL[l.priority ?? "NORMAL"] ?? "";
    ws.getCell(`K${r}`).value = CATEGORY_LABEL[l.category ?? "OTHER"] ?? "";
    if (l.estimatedUnitPrice != null)
      ws.getCell(`L${r}`).value = l.estimatedUnitPrice;
    // M{r} giữ formula =IF(AND(ISNUMBER(Fx),ISNUMBER(Lx)),Fx*Lx,"") — Excel auto-tính
    ws.getCell(`N${r}`).value = l.referenceCode ?? "";
    ws.getCell(`O${r}`).value = l.notes ?? "";
  }

  // Section III approval (rows 36-40 theo template)
  // Row 36 = Người đề xuất
  ws.getCell("E36").value = data.requestedByName ?? "";
  if (data.createdAt) {
    ws.getCell("I36").value = fmtDateTimeVN(data.createdAt);
  }
  ws.getCell("M36").value = "Đã ký khi gửi phiếu";

  // Row 39 = Trưởng bộ phận
  if (data.deptApprovedByName) {
    ws.getCell("E39").value = data.deptApprovedByName;
    ws.getCell("I39").value = fmtDateTimeVN(data.deptApprovedAt);
    ws.getCell("M39").value = data.deptApprovalNote ?? "Đã duyệt";
  }

  // Row 40 = Giám đốc / Mua hàng
  if (data.directorApprovedByName) {
    ws.getCell("E40").value = data.directorApprovedByName;
    ws.getCell("I40").value = fmtDateTimeVN(data.directorApprovedAt);
    ws.getCell("M40").value = data.directorApprovalNote ?? "Đã duyệt cuối";
  }

  // Section IV tracking (rows 44-48)
  // Row 44 = Đã duyệt đề xuất
  if (data.directorApprovedAt) {
    ws.getCell("J44").value = fmtDateTimeVN(data.directorApprovedAt);
    ws.getCell("M44").value = "Giám đốc đã duyệt";
  }
  // Row 45 = Đã tạo đơn mua
  if (data.poCreatedAt) {
    ws.getCell("J45").value = fmtDateTimeVN(data.poCreatedAt);
    ws.getCell("M45").value = "PO đã tạo";
  }
  // Row 46 = Đã nhận hàng
  if (data.goodsReceivedAt) {
    ws.getCell("J46").value = fmtDateTimeVN(data.goodsReceivedAt);
    ws.getCell("M46").value = "Hàng về kho";
  }
  // Row 47 = Đã xuất kho
  if (data.goodsIssuedAt) {
    ws.getCell("J47").value = fmtDateTimeVN(data.goodsIssuedAt);
    ws.getCell("M47").value = "Đã xuất cho bộ phận";
  }
  // Row 48 = Hoàn tất
  if (data.completedAt) {
    ws.getCell("J48").value = fmtDateTimeVN(data.completedAt);
    ws.getCell("M48").value = "Phiếu hoàn tất";
  }
}

/**
 * Build Excel buffer cho YCVT export 1 phiếu. Clone template + logo + fill.
 * Trả về Uint8Array (compatible với both Buffer + BodyInit cho Response).
 */
export async function buildYcvtExcel(data: YcvtExportData): Promise<Uint8Array> {
  const buf = await loadTemplateBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  const ws = wb.getWorksheet(YCVT_TEMPLATE_SHEET);
  if (!ws) throw new Error("YCVT_TEMPLATE_INVALID: missing 'Phiếu MRF' sheet");

  await addYcvtLogo(wb, ws);
  fillYcvtCells(ws, data);

  const arrayBuf = await wb.xlsx.writeBuffer();
  return new Uint8Array(arrayBuf);
}
