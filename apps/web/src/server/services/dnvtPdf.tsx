/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * V3.10 DNVT — PDF generator khớp form giấy DNVT 567 (mẫu GTAM/PRD-MRF-02).
 * Tách riêng khỏi renderYcvtPdfBuffer: bảng 14 cột (KHÔNG Mã VT/Đơn giá/Tổng
 * tiền), THÊM Tham khảo + Ngày giao hàng; mục III 5 dòng ký; KHÔNG mục IV/V.
 *
 * A4 landscape, font Roboto (hỗ trợ tiếng Việt).
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

/* ===== Types ===== */

export interface DnvtPdfLine {
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

export interface DnvtPdfInput {
  paperFormNo: string;
  createdAt: Date;
  targetDepartment?: string | null;
  proposingDepartment?: string | null;
  requestedByName?: string | null;
  requestReason?: string | null;
  lines: DnvtPdfLine[];

  deptApprovedByName?: string | null;
  deptApprovedAt?: Date | null;
  directorApprovedByName?: string | null;
  directorApprovedAt?: Date | null;

  rejectedAt?: Date | null;
  rejectionReason?: string | null;
}

const PRIORITY_VI: Record<string, string> = {
  URGENT: "Khẩn",
  NORMAL: "Bình thường",
  RESERVE: "Dự phòng",
};
const CATEGORY_VI: Record<string, string> = {
  TOOL: "CCDC",
  CONSUMABLE: "Tiêu hao",
  MATERIAL: "Vật tư",
  OTHER: "Khác",
};

const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${String(dt.getDate()).padStart(2, "0")}/${String(
    dt.getMonth() + 1,
  ).padStart(2, "0")}/${dt.getFullYear()}`;
};
const fmtDateTime = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${fmtDate(dt)} ${String(dt.getHours()).padStart(2, "0")}:${String(
    dt.getMinutes(),
  ).padStart(2, "0")}`;
};
const fmtNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("vi-VN");
};

/* ===== Styles ===== */

const COLOR_PRIMARY = "#005D9F";
const COLOR_HEADER_BG = "#F5F5F5";
const COLOR_BORDER = "#444";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 8.5,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 12,
    color: "#18181B",
  },
  doc: { borderWidth: 1.5, borderColor: "#000" },

  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: "#000",
  },
  headerLeft: {
    width: 140,
    padding: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerLogo: { width: 38, height: 40 },
  headerLeftText: { fontWeight: 700, fontSize: 10 },
  headerCenter: {
    flex: 1,
    padding: 6,
    textAlign: "center",
    fontWeight: 700,
    fontSize: 11,
  },
  headerRight: { width: 200, padding: 6, fontSize: 9 },
  formNoBadge: {
    backgroundColor: COLOR_PRIMARY,
    color: "#FFF",
    paddingVertical: 1,
    paddingHorizontal: 5,
    fontWeight: 700,
    alignSelf: "flex-end",
  },

  titleBar: {
    backgroundColor: COLOR_HEADER_BG,
    padding: 6,
    textAlign: "center",
    borderBottomWidth: 1.5,
    borderBottomColor: "#000",
    fontWeight: 700,
    fontSize: 14,
  },

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
    width: 130,
    backgroundColor: COLOR_HEADER_BG,
    padding: 4,
    fontWeight: 700,
    borderRightWidth: 0.5,
    borderRightColor: "#999",
    fontSize: 8.5,
  },
  fieldValue: { flex: 1, padding: 4, fontSize: 8.5 },

  tHead: {
    flexDirection: "row",
    backgroundColor: COLOR_HEADER_BG,
    fontWeight: 700,
    fontSize: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR_BORDER,
  },
  tRow: {
    flexDirection: "row",
    fontSize: 7.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#CCC",
    minHeight: 14,
  },
  tCell: {
    padding: 2,
    borderRightWidth: 0.5,
    borderRightColor: "#CCC",
  },
  // Col widths — 14 cột. A4 landscape usable ≈ 817.89pt. Sum = 806pt.
  cSTT: { width: 22, textAlign: "center" },
  cName: { width: 128 },
  cSpec: { width: 88 },
  cUom: { width: 32, textAlign: "center" },
  cQty: { width: 36, textAlign: "right" },
  cOnHand: { width: 40, textAlign: "right" },
  cApproved: { width: 40, textAlign: "right" },
  cNeed: { width: 50, textAlign: "center" },
  cPrio: { width: 50, textAlign: "center" },
  cCat: { width: 52, textAlign: "center" },
  cRefCode: { width: 54 },
  cRefNote: { width: 46 },
  cNote: { width: 116 },
  cDelivery: { width: 52, textAlign: "center", borderRightWidth: 0 },

  apHead: {
    flexDirection: "row",
    backgroundColor: COLOR_HEADER_BG,
    fontWeight: 700,
    fontSize: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR_BORDER,
  },
  apRow: {
    flexDirection: "row",
    fontSize: 8.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#CCC",
    minHeight: 26,
  },
  apCellRole: {
    width: 160,
    padding: 4,
    fontWeight: 700,
    borderRightWidth: 0.5,
    borderRightColor: "#CCC",
    backgroundColor: COLOR_HEADER_BG,
  },
  apCellName: {
    flex: 1,
    padding: 4,
    borderRightWidth: 0.5,
    borderRightColor: "#CCC",
  },
  apCellDate: { width: 170, padding: 4, fontSize: 7.5 },
  apSigned: { backgroundColor: "#ECFDF5" },
  apRejected: { backgroundColor: "#FEF2F2" },

  footerNote: {
    marginTop: 4,
    padding: 4,
    textAlign: "right",
    fontSize: 8,
    fontStyle: "italic",
    color: "#52525B",
  },
});

/* ===== Document ===== */

function DnvtPdfDoc(input: DnvtPdfInput) {
  const lines = input.lines;
  const logoPath = resolveLogoPath();

  return (
    <Document
      title={`DNVT ${input.paperFormNo}`}
      author="GTAM MES"
      subject="Phiếu đề xuất vật tư-NPL"
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.doc}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {logoPath ? <Image src={logoPath} style={styles.headerLogo} /> : null}
              <Text style={styles.headerLeftText}>XƯỞNG SXKD</Text>
            </View>
            <Text style={styles.headerCenter}>
              CÔNG TY CỔ PHẦN SẢN XUẤT TỰ ĐỘNG HÓA{"\n"}CÔNG NGHỆ TOÀN CẦU
            </Text>
            <View style={styles.headerRight}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 3 }}>
                <Text style={{ fontWeight: 700, marginRight: 4 }}>Số phiếu:</Text>
                <Text style={styles.formNoBadge}>{input.paperFormNo}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                <Text style={{ fontWeight: 700, marginRight: 4 }}>Ngày lập:</Text>
                <Text>{fmtDate(input.createdAt)}</Text>
              </View>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.titleBar}>PHIẾU ĐỀ XUẤT VẬT TƯ — NPL</Text>

          {/* I. Thông tin chung — stacked (khớp form giấy) */}
          <Text style={styles.sectionTitle}>I. Thông tin chung</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Kính gửi:</Text>
            <Text style={styles.fieldValue}>{input.targetDepartment ?? "—"}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Bộ phận đề xuất:</Text>
            <Text style={styles.fieldValue}>{input.proposingDepartment ?? "—"}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Người đề xuất:</Text>
            <Text style={styles.fieldValue}>{input.requestedByName ?? "—"}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Lý do đề xuất:</Text>
            <Text style={styles.fieldValue}>{input.requestReason ?? "—"}</Text>
          </View>

          {/* II. Danh mục vật tư — 14 cột */}
          <Text style={styles.sectionTitle}>II. Danh mục vật tư</Text>
          <View style={styles.tHead}>
            <Text style={[styles.tCell, styles.cSTT]}>STT</Text>
            <Text style={[styles.tCell, styles.cName]}>Tên vật tư</Text>
            <Text style={[styles.tCell, styles.cSpec]}>Quy cách chi tiết</Text>
            <Text style={[styles.tCell, styles.cUom]}>ĐVT</Text>
            <Text style={[styles.tCell, styles.cQty]}>SL YC</Text>
            <Text style={[styles.tCell, styles.cOnHand]}>Tồn kho</Text>
            <Text style={[styles.tCell, styles.cApproved]}>Duyệt</Text>
            <Text style={[styles.tCell, styles.cNeed]}>Ngày cần</Text>
            <Text style={[styles.tCell, styles.cPrio]}>Ưu tiên</Text>
            <Text style={[styles.tCell, styles.cCat]}>Phân loại</Text>
            <Text style={[styles.tCell, styles.cRefCode]}>Mã tham chiếu</Text>
            <Text style={[styles.tCell, styles.cRefNote]}>Tham khảo</Text>
            <Text style={[styles.tCell, styles.cNote]}>Ghi chú</Text>
            <Text style={[styles.tCell, styles.cDelivery]}>Ngày giao hàng</Text>
          </View>
          {lines.map((l, idx) => {
            const lowStock =
              l.onHandSnapshot != null && l.qty > 0
                ? l.onHandSnapshot < l.qty
                : false;
            return (
              <View
                key={l.lineNo}
                style={[
                  styles.tRow,
                  idx % 2 === 1 ? { backgroundColor: "#FAFAFA" } : {},
                ]}
              >
                <Text style={[styles.tCell, styles.cSTT]}>{idx + 1}</Text>
                <Text style={[styles.tCell, styles.cName]}>{l.name ?? "—"}</Text>
                <Text style={[styles.tCell, styles.cSpec]}>
                  {l.specification ?? "—"}
                </Text>
                <Text style={[styles.tCell, styles.cUom]}>{l.uom ?? "—"}</Text>
                <Text style={[styles.tCell, styles.cQty]}>{fmtNum(l.qty)}</Text>
                <Text
                  style={[
                    styles.tCell,
                    styles.cOnHand,
                    lowStock ? { color: "#DC2626", fontWeight: 700 } : {},
                  ]}
                >
                  {fmtNum(l.onHandSnapshot)}
                </Text>
                <Text style={[styles.tCell, styles.cApproved]}>
                  {fmtNum(l.approvedQty)}
                </Text>
                <Text style={[styles.tCell, styles.cNeed]}>
                  {fmtDate(l.neededBy)}
                </Text>
                <Text style={[styles.tCell, styles.cPrio]}>
                  {PRIORITY_VI[l.priority ?? "NORMAL"] ?? "—"}
                </Text>
                <Text style={[styles.tCell, styles.cCat]}>
                  {CATEGORY_VI[l.category ?? "OTHER"] ?? "—"}
                </Text>
                <Text style={[styles.tCell, styles.cRefCode]}>
                  {l.referenceCode ?? "—"}
                </Text>
                <Text style={[styles.tCell, styles.cRefNote]}>
                  {l.referenceNote ?? "—"}
                </Text>
                <Text style={[styles.tCell, styles.cNote]}>{l.notes ?? "—"}</Text>
                <Text style={[styles.tCell, styles.cDelivery]}>
                  {fmtDate(l.deliveryDate)}
                </Text>
              </View>
            );
          })}

          {/* III. Kiểm tra & Phê duyệt — 5 dòng */}
          <Text style={styles.sectionTitle}>III. Kiểm tra & Phê duyệt</Text>
          <View style={styles.apHead}>
            <Text style={styles.apCellRole}>Vai trò</Text>
            <Text style={styles.apCellName}>Họ tên</Text>
            <Text style={styles.apCellDate}>Ký tên / Ngày</Text>
          </View>
          <View style={[styles.apRow, styles.apSigned]}>
            <Text style={styles.apCellRole}>Người đề xuất</Text>
            <Text style={styles.apCellName}>{input.requestedByName ?? "—"}</Text>
            <Text style={styles.apCellDate}>✓ {fmtDateTime(input.createdAt)}</Text>
          </View>
          <View style={styles.apRow}>
            <Text style={styles.apCellRole}>Kiểm tra tồn kho</Text>
            <Text style={styles.apCellName} />
            <Text style={styles.apCellDate} />
          </View>
          <View style={styles.apRow}>
            <Text style={styles.apCellRole}>Kiểm tra kỹ thuật</Text>
            <Text style={styles.apCellName} />
            <Text style={styles.apCellDate} />
          </View>
          <View style={[styles.apRow, input.deptApprovedAt ? styles.apSigned : {}]}>
            <Text style={styles.apCellRole}>Trưởng bộ phận</Text>
            <Text style={styles.apCellName}>
              {input.deptApprovedByName ?? ""}
            </Text>
            <Text style={styles.apCellDate}>
              {input.deptApprovedAt ? `✓ ${fmtDateTime(input.deptApprovedAt)}` : ""}
            </Text>
          </View>
          <View style={[styles.apRow, input.directorApprovedAt ? styles.apSigned : {}]}>
            <Text style={styles.apCellRole}>Giám đốc</Text>
            <Text style={styles.apCellName}>
              {input.directorApprovedByName ?? ""}
            </Text>
            <Text style={styles.apCellDate}>
              {input.directorApprovedAt
                ? `✓ ${fmtDateTime(input.directorApprovedAt)}`
                : ""}
            </Text>
          </View>
          {input.rejectionReason ? (
            <View style={[styles.apRow, styles.apRejected]}>
              <Text style={[styles.apCellRole, { color: "#B91C1C" }]}>TỪ CHỐI</Text>
              <Text style={[styles.apCellName, { color: "#B91C1C" }]}>
                {input.rejectionReason}
              </Text>
              <Text style={styles.apCellDate}>{fmtDateTime(input.rejectedAt)}</Text>
            </View>
          ) : null}
        </View>

        {/* Footer mẫu */}
        <Text style={styles.footerNote}>
          Mẫu No: GTAM/PRD-MRF-02 | Phiên bản: 1.0 | Hiệu lực: 2025
        </Text>
      </Page>
    </Document>
  );
}

/* ===== Public renderer ===== */

export async function renderDnvtPdfBuffer(
  input: DnvtPdfInput,
): Promise<Uint8Array> {
  ensureFontsRegistered();
  if (!fontsRegistered) {
    throw new Error(
      `Roboto TTF không tìm thấy. cwd=${process.cwd()} candidates=${FONT_CANDIDATES.join(", ")}`,
    );
  }
  const instance: any = pdf(DnvtPdfDoc(input));
  const blob = await instance.toBlob();
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}
