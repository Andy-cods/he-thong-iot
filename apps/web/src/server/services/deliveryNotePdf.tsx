/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * V4.0 Wave 3 Phase D — BBGH (Biên bản Giao hàng) PDF generator.
 * Bám phong cách ycvtPdf.tsx / dnvtPdf.tsx / poPdf.tsx: font Roboto vendored,
 * khung viền đen kiểu phiếu giấy VN, logo GTAM. Layout A4 DỌC (khác YCVT/DNVT
 * ngang) — xem thiết kế đầy đủ tại plans/v4-finance/bbgh-form-design.md.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ MUỐN SỬA NHANH?                                                   │
 * │  - Đổi chữ hiển thị (tiêu đề, nhãn field)  → sửa object LABELS    │
 * │  - Thêm/bớt/đổi thứ tự CỘT bảng hàng hoá   → sửa mảng GOODS_COLUMNS│
 * │  - Thêm/bớt Ô CHỮ KÝ                       → sửa mảng SIGNATURE_BOXES│
 * │  - Đổi màu/khung/cỡ chữ                    → sửa object `styles`  │
 * │  - Đổi thông tin công ty (bên giao)        → sửa object SELLER    │
 * │  - Đổi số liên in (2 hay 3 liên)           → sửa mảng COPY_LABELS │
 * └─────────────────────────────────────────────────────────────────┘
 */

import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";

const FONT_CANDIDATES = [
  path.join(process.cwd(), "public/fonts"),
  path.join(process.cwd(), "apps/web/public/fonts"),
];
const LOGO_CANDIDATES = [
  path.join(process.cwd(), "public", "img", "logo-gtam.png"),
  path.join(process.cwd(), "apps", "web", "public", "img", "logo-gtam.png"),
];

function resolveLogoPath(): string | null {
  for (const p of LOGO_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* try next */
    }
  }
  return null;
}
let fontsRegistered = false;
function ensureFontsRegistered() {
  if (fontsRegistered) return;
  for (const dir of FONT_CANDIDATES) {
    try {
      const reg = path.join(dir, "Roboto-Regular.ttf");
      const bold = path.join(dir, "Roboto-Bold.ttf");
      if (fs.existsSync(reg) && fs.existsSync(bold)) {
        Font.register({
          family: "Roboto",
          fonts: [
            { src: reg, fontWeight: 400 },
            { src: bold, fontWeight: 700 },
          ],
        });
        Font.registerHyphenationCallback((w) => [w]);
        fontsRegistered = true;
        return;
      }
    } catch {
      /* try next */
    }
  }
}

/* =========================================================================
 * SELLER — thông tin bên giao (công ty mình). Đổi ở đây khi cần.
 * ========================================================================= */
const SELLER = {
  name: "CÔNG TY CỔ PHẦN SẢN XUẤT TỰ ĐỘNG HÓA CÔNG NGHỆ TOÀN CẦU",
  shortName: "GTAM",
  address: "Xóm Trại, Thôn Đông, Xã Kim Nỗ, Huyện Đông Anh, Thành phố Hà Nội",
  taxCode: "0110409405",
} as const;

/* =========================================================================
 * LABELS — MUỐN ĐỔI CHỮ HIỂN THỊ TRÊN BBGH? SỬA Ở ĐÂY. Không cần đụng tới
 * phần JSX bên dưới. Đổi giá trị (string) bên phải dấu ':', giữ nguyên key.
 * ========================================================================= */
const LABELS = {
  docTitle: "BIÊN BẢN GIAO HÀNG",
  copyLabels: ["LIÊN 1: BÊN GIAO LƯU", "LIÊN 2: BÊN NHẬN LƯU", "LIÊN 3: KẾ TOÁN LƯU"],

  sectionRef: "I. THÔNG TIN THAM CHIẾU",
  refIssueNo: "Số phiếu xuất kho",
  refSalesOrderNo: "Số đơn hàng",
  refPoCode: "Số PO liên quan",
  refContractNo: "Số hợp đồng",

  sectionSeller: "II. BÊN GIAO",
  sectionBuyer: "III. BÊN NHẬN",
  fieldName: "Tên đơn vị",
  fieldAddress: "Địa chỉ",
  fieldTaxCode: "Mã số thuế",
  fieldContact: "Người đại diện",
  fieldPhone: "Điện thoại",

  sectionGoods: "IV. DANH MỤC HÀNG HOÁ",
  sectionVehicle: "V. PHƯƠNG TIỆN VẬN CHUYỂN",
  fieldVehicleType: "Loại xe",
  fieldVehiclePlate: "Biển số",
  fieldCarrierName: "Người vận chuyển",
  fieldCarrierPhone: "SĐT vận chuyển",

  sectionConclusion: "VI. KẾT LUẬN GIAO NHẬN",
  conclusionFull: "Đã giao đủ, đúng quy cách",
  conclusionShort: "Giao thiếu",
  conclusionDamaged: "Có hư hỏng",
  conclusionNotesLabel: "Ghi chú",

  signHint: "(Ký, ghi rõ họ tên)",
  footerNote: "Mẫu BBGH — GTAM MES V4",
} as const;

const CONDITION_VI: Record<string, string> = {
  FULL: "Đủ",
  SHORT: "Thiếu",
  DAMAGED: "Hư hỏng",
};

const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${String(dt.getDate()).padStart(2, "0")}/${String(
    dt.getMonth() + 1,
  ).padStart(2, "0")}/${dt.getFullYear()}`;
};

const fmtNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("vi-VN");
};

/* =========================================================================
 * Types
 * ========================================================================= */
export interface DeliveryNotePdfLine {
  lineNo: number;
  sku?: string | null;
  itemName?: string | null;
  specification?: string | null;
  uom?: string | null;
  docQty: number | string;
  actualQty: number | string;
  condition: "FULL" | "SHORT" | "DAMAGED" | string;
  notes?: string | null;
}

export interface DeliveryNotePdfInput {
  noteNo: string;
  createdAt: Date;
  issueRequestNo?: string | null;
  salesOrderNo?: string | null;
  poCode?: string | null;
  contractNo?: string | null;

  recipientName: string;
  recipientAddress?: string | null;
  recipientTaxCode?: string | null;
  recipientContactName?: string | null;
  recipientPhone?: string | null;

  deliveredByName?: string | null;

  vehicleType?: string | null;
  vehiclePlate?: string | null;
  carrierName?: string | null;
  carrierPhone?: string | null;

  deliveryResult: "FULL" | "SHORT" | "DAMAGED" | string;
  conclusionNotes?: string | null;

  lines: DeliveryNotePdfLine[];
  /** Số liên cần in (mặc định 3). Xem LABELS.copyLabels. */
  copies?: number;
}

/* =========================================================================
 * GOODS_COLUMNS — MUỐN THÊM/BỚT/ĐỔI THỨ TỰ CỘT BẢNG HÀNG HOÁ? SỬA MẢNG NÀY.
 * Thêm 1 object = thêm 1 cột (tự render ở cả header và data row).
 * ========================================================================= */
interface GoodsColumn {
  key: string;
  label: string;
  width: number;
  align?: "left" | "center" | "right";
  render: (line: DeliveryNotePdfLine, idx: number) => string;
}

const GOODS_COLUMNS: GoodsColumn[] = [
  { key: "stt", label: "STT", width: 24, align: "center", render: (_l, idx) => String(idx + 1) },
  { key: "sku", label: "Mã hàng", width: 68, render: (l) => l.sku ?? "—" },
  { key: "name", label: "Tên hàng", width: 148, render: (l) => l.itemName ?? "—" },
  { key: "spec", label: "Quy cách", width: 68, render: (l) => l.specification ?? "—" },
  { key: "uom", label: "ĐVT", width: 32, align: "center", render: (l) => l.uom ?? "—" },
  { key: "docQty", label: "SL chứng từ", width: 58, align: "right", render: (l) => fmtNum(l.docQty) },
  { key: "actualQty", label: "SL thực giao", width: 58, align: "right", render: (l) => fmtNum(l.actualQty) },
  { key: "condition", label: "Tình trạng", width: 50, align: "center", render: (l) => CONDITION_VI[l.condition] ?? "—" },
  { key: "notes", label: "Ghi chú", width: 61, render: (l) => l.notes ?? "—" },
];

/* =========================================================================
 * SIGNATURE_BOXES — MUỐN THÊM/BỚT Ô CHỮ KÝ? SỬA MẢNG NÀY.
 * ========================================================================= */
interface SignatureBox {
  role: string;
  getName: (input: DeliveryNotePdfInput) => string;
}

const SIGNATURE_BOXES: SignatureBox[] = [
  { role: "Đại diện bên giao", getName: (i) => i.deliveredByName ?? "" },
  { role: "Thủ kho", getName: () => "" },
  { role: "Đại diện bên nhận", getName: () => "" },
];

/* =========================================================================
 * Styles
 * ========================================================================= */
const COLOR_PRIMARY = "#005D9F";
const COLOR_HEADER_BG = "#F5F5F5";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 9,
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 24,
    color: "#18181B",
  },
  doc: { borderWidth: 1.5, borderColor: "#000" },

  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: "#000",
  },
  headerLeft: {
    width: 130,
    padding: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerLogo: { width: 34, height: 36 },
  headerLeftText: { fontWeight: 700, fontSize: 9 },
  headerCenter: {
    flex: 1,
    padding: 6,
    textAlign: "center",
    fontWeight: 700,
    fontSize: 10,
  },
  headerRight: { width: 160, padding: 6, fontSize: 8.5, textAlign: "right" },
  copyBadge: {
    backgroundColor: COLOR_PRIMARY,
    color: "#FFF",
    paddingVertical: 1,
    paddingHorizontal: 5,
    fontWeight: 700,
    fontSize: 7.5,
    alignSelf: "flex-end",
    marginBottom: 3,
  },

  titleBar: {
    backgroundColor: COLOR_HEADER_BG,
    padding: 6,
    textAlign: "center",
    borderBottomWidth: 1.5,
    borderBottomColor: "#000",
    fontWeight: 700,
    fontSize: 16,
  },
  titleSub: { textAlign: "center", fontSize: 9, marginTop: 2 },

  sectionTitle: {
    backgroundColor: COLOR_PRIMARY,
    color: "#FFF",
    fontWeight: 700,
    fontSize: 9,
    padding: 4,
    textTransform: "uppercase",
  },

  fieldRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#999",
  },
  fieldLabel: {
    width: 110,
    backgroundColor: COLOR_HEADER_BG,
    padding: 4,
    fontWeight: 700,
    borderRightWidth: 0.5,
    borderRightColor: "#999",
    fontSize: 8.5,
  },
  fieldValue: { flex: 1, padding: 4, fontSize: 8.5 },

  partyCol: { flex: 1 },
  partyColBorder: { borderRightWidth: 0.5, borderRightColor: "#999" },

  tHead: {
    flexDirection: "row",
    backgroundColor: COLOR_HEADER_BG,
    fontWeight: 700,
    fontSize: 7.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#444",
  },
  tRow: {
    flexDirection: "row",
    fontSize: 7.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#CCC",
    minHeight: 15,
  },
  tCell: { padding: 2, borderRightWidth: 0.5, borderRightColor: "#CCC" },

  conclusionRow: { flexDirection: "row", padding: 6, gap: 14 },
  conclusionOption: { flexDirection: "row", alignItems: "center", gap: 3, fontSize: 8.5 },
  checkbox: {
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: "#000",
    textAlign: "center",
  },

  signRow: { flexDirection: "row", marginTop: 4, padding: 8 },
  signBox: { flex: 1, textAlign: "center", fontSize: 9, paddingHorizontal: 4 },
  signTitle: { fontWeight: 700, marginBottom: 2 },
  signHint: { fontSize: 8, color: "#555" },
  signSpace: { height: 32 },
  signName: { fontWeight: 700 },

  footerNote: {
    textAlign: "center",
    fontSize: 7,
    color: "#888",
    marginTop: 4,
  },
});

/* =========================================================================
 * Document
 * ========================================================================= */
function DeliveryNotePage({
  input,
  copyLabel,
  logoPath,
}: {
  input: DeliveryNotePdfInput;
  copyLabel: string;
  logoPath: string | null;
}) {
  const lines = input.lines;
  const deliveryResult = input.deliveryResult;

  return (
    <Page size="A4" orientation="portrait" style={styles.page}>
      <View style={styles.doc}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {logoPath ? <Image src={logoPath} style={styles.headerLogo} /> : null}
            <Text style={styles.headerLeftText}>{SELLER.shortName}</Text>
          </View>
          <Text style={styles.headerCenter}>{SELLER.name}</Text>
          <View style={styles.headerRight}>
            <Text style={styles.copyBadge}>{copyLabel}</Text>
            <Text>Ngày lập: {fmtDate(input.createdAt)}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.titleBar}>{LABELS.docTitle}</Text>
        <Text style={styles.titleSub}>Số: {input.noteNo}</Text>

        {/* I. Thông tin tham chiếu */}
        <Text style={styles.sectionTitle}>{LABELS.sectionRef}</Text>
        <View style={{ flexDirection: "row" }}>
          <View style={[styles.partyCol, styles.partyColBorder]}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.refIssueNo}</Text>
              <Text style={styles.fieldValue}>{input.issueRequestNo ?? "—"}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.refPoCode}</Text>
              <Text style={styles.fieldValue}>{input.poCode ?? "—"}</Text>
            </View>
          </View>
          <View style={styles.partyCol}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.refSalesOrderNo}</Text>
              <Text style={styles.fieldValue}>{input.salesOrderNo ?? "—"}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.refContractNo}</Text>
              <Text style={styles.fieldValue}>{input.contractNo ?? "—"}</Text>
            </View>
          </View>
        </View>

        {/* II/III. Bên giao / Bên nhận */}
        <View style={{ flexDirection: "row" }}>
          <View style={[styles.partyCol, styles.partyColBorder]}>
            <Text style={styles.sectionTitle}>{LABELS.sectionSeller}</Text>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.fieldName}</Text>
              <Text style={styles.fieldValue}>{SELLER.name}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.fieldAddress}</Text>
              <Text style={styles.fieldValue}>{SELLER.address}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.fieldTaxCode}</Text>
              <Text style={styles.fieldValue}>{SELLER.taxCode}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.fieldContact}</Text>
              <Text style={styles.fieldValue}>{input.deliveredByName ?? "—"}</Text>
            </View>
          </View>
          <View style={styles.partyCol}>
            <Text style={styles.sectionTitle}>{LABELS.sectionBuyer}</Text>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.fieldName}</Text>
              <Text style={styles.fieldValue}>{input.recipientName}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.fieldAddress}</Text>
              <Text style={styles.fieldValue}>{input.recipientAddress ?? "—"}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.fieldContact}</Text>
              <Text style={styles.fieldValue}>{input.recipientContactName ?? "—"}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.fieldPhone}</Text>
              <Text style={styles.fieldValue}>{input.recipientPhone ?? "—"}</Text>
            </View>
          </View>
        </View>

        {/* IV. Danh mục hàng hoá */}
        <Text style={styles.sectionTitle}>{LABELS.sectionGoods}</Text>
        <View style={styles.tHead}>
          {GOODS_COLUMNS.map((col) => (
            <Text
              key={col.key}
              style={[styles.tCell, { width: col.width, textAlign: col.align ?? "left" }]}
            >
              {col.label}
            </Text>
          ))}
        </View>
        {lines.map((line, idx) => (
          <View
            key={idx}
            style={[styles.tRow, idx % 2 === 1 ? { backgroundColor: "#FAFAFA" } : {}]}
          >
            {GOODS_COLUMNS.map((col) => (
              <Text
                key={col.key}
                style={[styles.tCell, { width: col.width, textAlign: col.align ?? "left" }]}
              >
                {col.render(line, idx)}
              </Text>
            ))}
          </View>
        ))}

        {/* V. Phương tiện vận chuyển */}
        <Text style={styles.sectionTitle}>{LABELS.sectionVehicle}</Text>
        <View style={{ flexDirection: "row" }}>
          <View style={[styles.partyCol, styles.partyColBorder]}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.fieldVehicleType}</Text>
              <Text style={styles.fieldValue}>{input.vehicleType ?? "—"}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.fieldVehiclePlate}</Text>
              <Text style={styles.fieldValue}>{input.vehiclePlate ?? "—"}</Text>
            </View>
          </View>
          <View style={styles.partyCol}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.fieldCarrierName}</Text>
              <Text style={styles.fieldValue}>{input.carrierName ?? "—"}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABELS.fieldCarrierPhone}</Text>
              <Text style={styles.fieldValue}>{input.carrierPhone ?? "—"}</Text>
            </View>
          </View>
        </View>

        {/* VI. Kết luận giao nhận */}
        <Text style={styles.sectionTitle}>{LABELS.sectionConclusion}</Text>
        <View style={styles.conclusionRow}>
          <View style={styles.conclusionOption}>
            <Text style={styles.checkbox}>{deliveryResult === "FULL" ? "X" : ""}</Text>
            <Text>{LABELS.conclusionFull}</Text>
          </View>
          <View style={styles.conclusionOption}>
            <Text style={styles.checkbox}>{deliveryResult === "SHORT" ? "X" : ""}</Text>
            <Text>{LABELS.conclusionShort}</Text>
          </View>
          <View style={styles.conclusionOption}>
            <Text style={styles.checkbox}>{deliveryResult === "DAMAGED" ? "X" : ""}</Text>
            <Text>{LABELS.conclusionDamaged}</Text>
          </View>
        </View>
        {input.conclusionNotes ? (
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{LABELS.conclusionNotesLabel}</Text>
            <Text style={styles.fieldValue}>{input.conclusionNotes}</Text>
          </View>
        ) : null}

        {/* Chữ ký */}
        <View style={styles.signRow}>
          {SIGNATURE_BOXES.map((box) => (
            <View key={box.role} style={styles.signBox}>
              <Text style={styles.signTitle}>{box.role}</Text>
              <Text style={styles.signHint}>{LABELS.signHint}</Text>
              <View style={styles.signSpace} />
              <Text style={styles.signName}>{box.getName(input)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.footerNote}>{LABELS.footerNote}</Text>
      </View>
    </Page>
  );
}

function DeliveryNotePdfDoc(input: DeliveryNotePdfInput) {
  const logoPath = resolveLogoPath();
  const copyCount = Math.min(input.copies ?? 3, LABELS.copyLabels.length);
  const copyLabels = LABELS.copyLabels.slice(0, copyCount);

  return (
    <Document title={`BBGH ${input.noteNo}`} author="GTAM MES" subject="Biên bản giao hàng">
      {copyLabels.map((label) => (
        <DeliveryNotePage key={label} input={input} copyLabel={label} logoPath={logoPath} />
      ))}
    </Document>
  );
}

export async function renderDeliveryNotePdfBuffer(
  input: DeliveryNotePdfInput,
): Promise<Uint8Array> {
  ensureFontsRegistered();
  if (!fontsRegistered) {
    throw new Error(
      `Roboto TTF không tìm thấy. cwd=${process.cwd()} candidates=${FONT_CANDIDATES.join(", ")}`,
    );
  }
  const instance: any = pdf(DeliveryNotePdfDoc(input));
  const blob = await instance.toBlob();
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}
