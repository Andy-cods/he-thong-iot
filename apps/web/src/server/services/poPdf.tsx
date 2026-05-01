/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * V3.7.38 — Purchase Order PDF generator theo template DDH-Mau.xlsx.
 *
 * Layout matching:
 *   ┌────────────────────────────────────────────────┐
 *   │             ĐƠN ĐẶT HÀNG                       │
 *   │                          Ngày: ____            │
 *   │                          P.O. Number: ____     │
 *   │                          Mã NCC: ____          │
 *   ├────────────────────────────────────────────────┤
 *   │ Bên cung cấp           │  Bên mua (GTAM)       │
 *   ├────────────────────────────────────────────────┤
 *   │ Mã | Tên | Vật liệu | ĐVT | SL | Giá | Tổng    │
 *   ├────────────────────────────────────────────────┤
 *   │ Ghi chú          │       Tổng / VAT / Thanh toán│
 *   ├────────────────────────────────────────────────┤
 *   │ Chất lượng / Giao hàng / Thanh toán             │
 *   ├────────────────────────────────────────────────┤
 *   │ Xác nhận bên cung cấp │ Xác nhận bên mua       │
 *   └────────────────────────────────────────────────┘
 *
 * Font: Roboto (Google Fonts CDN) — hỗ trợ Vietnamese diacritics đầy đủ.
 */

import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";

// V3.7.40 — Roboto bundled TTF (hỗ trợ tiếng Việt diacritics đầy đủ).
// Path resolution multi-mode:
//   - Dev:    cwd = apps/web  → public/fonts/
//   - Docker: cwd = /app      → apps/web/public/fonts/
const FONT_CANDIDATES = [
  path.join(process.cwd(), "public/fonts"),
  path.join(process.cwd(), "apps/web/public/fonts"),
];
let fontsRegistered = false;
function ensureFontsRegistered() {
  if (fontsRegistered) return;
  for (const dir of FONT_CANDIDATES) {
    try {
      const regularPath = path.join(dir, "Roboto-Regular.ttf");
      const boldPath = path.join(dir, "Roboto-Bold.ttf");
      if (fs.existsSync(regularPath) && fs.existsSync(boldPath)) {
        Font.register({
          family: "Roboto",
          fonts: [
            { src: regularPath, fontWeight: 400 },
            { src: boldPath, fontWeight: 700 },
          ],
        });
        Font.registerHyphenationCallback((word) => [word]);
        fontsRegistered = true;
        return;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[poPdf] Font register failed", err);
    }
  }
  // eslint-disable-next-line no-console
  console.warn(
    "[poPdf] Roboto TTF not found in:",
    FONT_CANDIDATES.join(", "),
  );
}

// =====================================================================
// Buyer (GTAM) — fixed info từ DDH-Mau template.
// TODO: Make configurable via /api/admin/settings (V3.8+).
// =====================================================================
const BUYER = {
  name: "CÔNG TY CP SẢN XUẤT TỰ ĐỘNG HÓA CÔNG NGHỆ",
  shortName: "GTAM",
  address:
    "Xóm Trại, Thôn Đông, Xã Kim Nỗ, Huyện Đông Anh, Thành phố Hà Nội",
  taxCode: "0110409405",
  phone: "0983400018",
  email: "anhpv@gtam.vn",
  preparedBy: "",
} as const;

// =====================================================================
// Types — input shape cho PDF
// =====================================================================
export interface POPdfLine {
  lineNo: number;
  itemSku: string | null;
  itemName: string | null;
  itemUom: string | null;
  /** Vật liệu / Quy cách (specs từ BOM line metadata.size hoặc item dimensions). */
  spec?: string | null;
  orderedQty: string | number;
  unitPrice: string | number;
  taxRate?: string | number | null;
  lineTotal: string | number;
}

export interface POPdfInput {
  poCode: string;
  orderDate: Date;
  reference?: string | null;
  supplier: {
    name: string;
    code?: string | null;
    address?: string | null;
    taxCode?: string | null;
    phone?: string | null;
    email?: string | null;
    contactName?: string | null;
  };
  lines: POPdfLine[];
  /** Sum trước thuế. */
  subtotal: number;
  /** Phần trăm thuế VAT (VD 0.1 = 10%). */
  taxRate: number;
  /** Tổng cuối (subtotal + tax). */
  total: number;
  notes?: string | null;
  /** Người lập đơn (thường là TM-A). */
  preparedBy?: string | null;
}

// =====================================================================
// Styles
// =====================================================================
const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 9,
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 28,
    color: "#111",
  },
  // Title row
  titleRow: { flexDirection: "row", marginBottom: 10 },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 700,
    textAlign: "center",
    letterSpacing: 1.5,
  },
  metaCol: {
    width: 200,
    fontSize: 9,
  },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 90, color: "#555" },
  metaValue: { flex: 1, fontWeight: 700 },
  // Two parties block
  partiesRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  partyBox: {
    flex: 1,
    border: "1pt solid #999",
    padding: 8,
    fontSize: 8.5,
    minHeight: 110,
  },
  partyTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 4,
    color: "#0a4ec7",
  },
  partyLine: { marginBottom: 2 },
  partyKey: { color: "#555" },
  // Items table
  table: { marginTop: 10, border: "1pt solid #444" },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e6eefa",
    fontWeight: 700,
    borderBottom: "1pt solid #444",
    fontSize: 8.5,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #ccc",
    fontSize: 8,
    minHeight: 16,
  },
  tableCell: {
    padding: 4,
    borderRight: "0.5pt solid #ccc",
  },
  cMa: { width: 30, textAlign: "center" },
  cName: { flex: 2 },
  cSpec: { flex: 1.5 },
  cUom: { width: 32, textAlign: "center" },
  cQty: { width: 40, textAlign: "right" },
  cPrice: { width: 60, textAlign: "right" },
  cTotal: { width: 70, textAlign: "right", borderRight: "none" },
  // Footer
  footerRow: { flexDirection: "row", marginTop: 8 },
  notesBox: {
    flex: 2,
    border: "1pt solid #999",
    padding: 6,
    fontSize: 8.5,
    minHeight: 70,
  },
  totalsBox: { flex: 1, marginLeft: 8, fontSize: 9 },
  totalsRow: {
    flexDirection: "row",
    paddingVertical: 2,
    borderBottom: "0.5pt solid #ddd",
  },
  totalsLabel: { flex: 1, color: "#555" },
  totalsValue: { width: 80, textAlign: "right", fontWeight: 700 },
  totalsFinalLabel: {
    flex: 1,
    fontWeight: 700,
    color: "#0a4ec7",
  },
  totalsFinalValue: {
    width: 80,
    textAlign: "right",
    fontWeight: 700,
    color: "#0a4ec7",
    fontSize: 11,
  },
  // Terms
  termsBox: {
    marginTop: 10,
    flexDirection: "row",
    gap: 6,
  },
  termCol: {
    flex: 1,
    border: "1pt solid #ccc",
    padding: 6,
    fontSize: 7.5,
  },
  termTitle: { fontWeight: 700, fontSize: 8.5, marginBottom: 2 },
  // Signatures
  signRow: { flexDirection: "row", marginTop: 14 },
  signBox: {
    flex: 1,
    textAlign: "center",
    fontSize: 9,
  },
  signTitle: { fontWeight: 700, marginBottom: 28 },
});

// =====================================================================
// Helpers
// =====================================================================
const fmtVnd = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString("vi-VN") : "0";
const fmtDate = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// =====================================================================
// PDF Document
// =====================================================================
export function PurchaseOrderPdfDoc(input: POPdfInput) {
  return (
    <Document
      title={`PO ${input.poCode}`}
      author="GTAM MES"
      subject="Đơn đặt hàng"
    >
      <Page size="A4" style={styles.page}>
        {/* Title row */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>ĐƠN ĐẶT HÀNG</Text>
          <View style={styles.metaCol}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Ngày</Text>
              <Text style={styles.metaValue}>{fmtDate(input.orderDate)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>P.O. Number</Text>
              <Text style={styles.metaValue}>{input.poCode}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Mã NCC</Text>
              <Text style={styles.metaValue}>{input.supplier.code ?? "—"}</Text>
            </View>
            {input.reference && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Tham chiếu</Text>
                <Text style={styles.metaValue}>{input.reference}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Two parties */}
        <View style={styles.partiesRow}>
          {/* Supplier (Bên cung cấp) */}
          <View style={styles.partyBox}>
            <Text style={styles.partyTitle}>Bên cung cấp</Text>
            <View style={styles.partyLine}>
              <Text style={styles.partyKey}>Tên doanh nghiệp:</Text>
              <Text>{input.supplier.name}</Text>
            </View>
            {input.supplier.contactName && (
              <View style={styles.partyLine}>
                <Text style={styles.partyKey}>Người nhận đơn:</Text>
                <Text>{input.supplier.contactName}</Text>
              </View>
            )}
            <View style={styles.partyLine}>
              <Text style={styles.partyKey}>Địa chỉ:</Text>
              <Text>{input.supplier.address ?? "—"}</Text>
            </View>
            <View style={styles.partyLine}>
              <Text style={styles.partyKey}>Mã số thuế:</Text>
              <Text>{input.supplier.taxCode ?? "—"}</Text>
            </View>
            <View style={styles.partyLine}>
              <Text style={styles.partyKey}>Điện thoại:</Text>
              <Text>{input.supplier.phone ?? "—"}</Text>
            </View>
            {input.supplier.email && (
              <View style={styles.partyLine}>
                <Text style={styles.partyKey}>E-mail:</Text>
                <Text>{input.supplier.email}</Text>
              </View>
            )}
          </View>

          {/* Buyer (Bên mua = GTAM) */}
          <View style={styles.partyBox}>
            <Text style={styles.partyTitle}>Bên mua</Text>
            <View style={styles.partyLine}>
              <Text style={styles.partyKey}>Tên doanh nghiệp:</Text>
              <Text>{BUYER.name}</Text>
            </View>
            <View style={styles.partyLine}>
              <Text style={styles.partyKey}>Người lập đơn:</Text>
              <Text>{input.preparedBy ?? "—"}</Text>
            </View>
            <View style={styles.partyLine}>
              <Text style={styles.partyKey}>Địa chỉ:</Text>
              <Text>{BUYER.address}</Text>
            </View>
            <View style={styles.partyLine}>
              <Text style={styles.partyKey}>Mã số thuế:</Text>
              <Text>{BUYER.taxCode}</Text>
            </View>
            <View style={styles.partyLine}>
              <Text style={styles.partyKey}>Điện thoại:</Text>
              <Text>{BUYER.phone}</Text>
            </View>
            <View style={styles.partyLine}>
              <Text style={styles.partyKey}>E-mail:</Text>
              <Text>{BUYER.email}</Text>
            </View>
            <View style={[styles.partyLine, { marginTop: 4 }]}>
              <Text style={{ fontStyle: "italic" }}>
                Công ty {BUYER.shortName} xác nhận đặt hàng tại Quý công ty
                theo mẫu yêu cầu sau:
              </Text>
            </View>
          </View>
        </View>

        {/* Items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCell, styles.cMa]}>Mã</Text>
            <Text style={[styles.tableCell, styles.cName]}>
              Tên sản phẩm/Mô tả
            </Text>
            <Text style={[styles.tableCell, styles.cSpec]}>Vật liệu/Quy cách</Text>
            <Text style={[styles.tableCell, styles.cUom]}>ĐVT</Text>
            <Text style={[styles.tableCell, styles.cQty]}>Số lượng</Text>
            <Text style={[styles.tableCell, styles.cPrice]}>Đơn giá</Text>
            <Text style={[styles.tableCell, styles.cTotal]}>Thành tiền</Text>
          </View>
          {input.lines.map((l) => (
            <View key={l.lineNo} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.cMa]}>{l.lineNo}</Text>
              <Text style={[styles.tableCell, styles.cName]}>
                {l.itemSku ?? "—"}
                {l.itemName ? ` — ${l.itemName}` : ""}
              </Text>
              <Text style={[styles.tableCell, styles.cSpec]}>
                {l.spec ?? "—"}
              </Text>
              <Text style={[styles.tableCell, styles.cUom]}>
                {l.itemUom ?? "—"}
              </Text>
              <Text style={[styles.tableCell, styles.cQty]}>
                {fmtVnd(Number(l.orderedQty))}
              </Text>
              <Text style={[styles.tableCell, styles.cPrice]}>
                {fmtVnd(Number(l.unitPrice))}
              </Text>
              <Text style={[styles.tableCell, styles.cTotal]}>
                {fmtVnd(Number(l.lineTotal))}
              </Text>
            </View>
          ))}
        </View>

        {/* Footer: notes + totals */}
        <View style={styles.footerRow}>
          <View style={styles.notesBox}>
            <Text style={{ fontWeight: 700, marginBottom: 4 }}>
              Ghi chú và yêu cầu
            </Text>
            <Text>{input.notes ?? ""}</Text>
          </View>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Tổng (trước thuế)</Text>
              <Text style={styles.totalsValue}>{fmtVnd(input.subtotal)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Chiết khấu</Text>
              <Text style={styles.totalsValue}>0</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                Thuế GTGT ({(input.taxRate * 100).toFixed(0)}%)
              </Text>
              <Text style={styles.totalsValue}>
                {fmtVnd(input.subtotal * input.taxRate)}
              </Text>
            </View>
            <View style={[styles.totalsRow, { borderBottom: "none" }]}>
              <Text style={styles.totalsFinalLabel}>Tổng cộng (VND)</Text>
              <Text style={styles.totalsFinalValue}>
                {fmtVnd(input.total)}
              </Text>
            </View>
          </View>
        </View>

        {/* Terms */}
        <View style={styles.termsBox}>
          <View style={styles.termCol}>
            <Text style={styles.termTitle}>Chất lượng sản phẩm</Text>
            <Text>
              Bên cung cấp đảm bảo chất lượng, gia công đúng theo bản vẽ yêu cầu.
            </Text>
          </View>
          <View style={styles.termCol}>
            <Text style={styles.termTitle}>Điều khoản giao hàng</Text>
            <Text>Theo thỏa thuận hoặc theo hợp đồng nguyên tắc đã ký.</Text>
          </View>
          <View style={styles.termCol}>
            <Text style={styles.termTitle}>Địa điểm giao hàng</Text>
            <Text>Theo thỏa thuận hoặc theo hợp đồng nguyên tắc đã ký.</Text>
          </View>
          <View style={styles.termCol}>
            <Text style={styles.termTitle}>Điều khoản thanh toán</Text>
            <Text>
              Bên mua thanh toán số tiền hàng sau 60 ngày kể từ ngày nhận đủ
              chứng từ.
            </Text>
          </View>
        </View>

        {/* Signatures */}
        <View style={styles.signRow}>
          <View style={styles.signBox}>
            <Text style={styles.signTitle}>Xác nhận của bên cung cấp</Text>
            <Text>(Ký, ghi rõ họ tên)</Text>
          </View>
          <View style={styles.signBox}>
            <Text style={styles.signTitle}>Xác nhận của bên mua</Text>
            <Text>(Ký, ghi rõ họ tên)</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Render PDF document → Node Buffer (cho HTTP response). */
export async function renderPoPdfBuffer(input: POPdfInput): Promise<Buffer> {
  // V3.7.40 — Register Roboto fonts trước khi render (lazy, idempotent).
  // V3.7.41 — Throw nếu register fail để upstream catch + báo lỗi rõ.
  ensureFontsRegistered();
  if (!fontsRegistered) {
    throw new Error(
      `Roboto TTF không tìm thấy. cwd=${process.cwd()}, candidates=${FONT_CANDIDATES.join(",")}`,
    );
  }
  const blob = await pdf(PurchaseOrderPdfDoc(input)).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
