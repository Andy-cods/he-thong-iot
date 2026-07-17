/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * V3.7.69 YCVT — PDF generator khớp template "Phiếu MRF" (5 sections).
 *
 * Sử dụng @react-pdf/renderer (đã có trong repo, vendored Roboto TTF hỗ trợ
 * tiếng Việt). Layout A4 landscape khớp layout Excel YCVT.
 *
 * Sections (theo Excel mẫu):
 *   Header — XƯỞNG SXKD · Tên cty · Số phiếu · Ngày lập
 *   I.   Thông tin chung (Kính gửi, Bộ phận đề xuất, Người đề xuất, Lý do)
 *   II.  Danh mục vật tư (15 cột)
 *   III. Kiểm tra & Phê duyệt (3 chữ ký dynamic)
 *   IV.  Theo dõi (5 trạng thái)
 *   V.   Quy tắc quản lý (5 bullets)
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

// Roboto bundled TTF (path-resolution multi-mode dev + Docker).
const FONT_CANDIDATES = [
  path.join(process.cwd(), "public/fonts"),
  path.join(process.cwd(), "apps/web/public/fonts"),
];

// V3.7.69 — Logo GTAM path resolution.
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
 * Types
 * ========================================================================= */

export interface YcvtPdfLine {
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

export interface YcvtPdfInput {
  paperFormNo: string;
  createdAt: Date;
  targetDepartment?: string | null;
  proposingDepartment?: string | null;
  requestedByName?: string | null;
  title?: string | null;
  requestReason?: string | null;
  lines: YcvtPdfLine[];
  totalEstimatedAmount?: number | null;

  deptApprovedByName?: string | null;
  deptApprovedAt?: Date | null;
  deptApprovalNote?: string | null;
  directorApprovedByName?: string | null;
  directorApprovedAt?: Date | null;
  directorApprovalNote?: string | null;

  rejectedAt?: Date | null;
  rejectionReason?: string | null;

  poCreatedAt?: Date | null;
  goodsReceivedAt?: Date | null;
  goodsIssuedAt?: Date | null;
  completedAt?: Date | null;
}

const PRIORITY_VI: Record<string, string> = {
  URGENT: "Khẩn",
  NORMAL: "Bình thường",
  RESERVE: "Dự phòng",
};
const CATEGORY_VI: Record<string, string> = {
  TOOL: "CCDC",
  CONSUMABLE: "Tiêu hao",
  MATERIAL: "Vật tư phục vụ SX",
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

/* =========================================================================
 * Styles
 * ========================================================================= */

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

  // Outer frame
  doc: {
    borderWidth: 1.5,
    borderColor: "#000",
  },

  // Header row
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
  headerLogo: {
    width: 38,
    height: 40,
  },
  headerLeftText: {
    fontWeight: 700,
    fontSize: 10,
  },
  headerCenter: {
    flex: 1,
    padding: 6,
    textAlign: "center",
    fontWeight: 700,
    fontSize: 11,
  },
  headerRight: {
    width: 200,
    padding: 6,
    fontSize: 9,
  },
  formNoBadge: {
    backgroundColor: COLOR_PRIMARY,
    color: "#FFF",
    paddingVertical: 1,
    paddingHorizontal: 5,
    fontWeight: 700,
    alignSelf: "flex-end",
  },

  // Title
  titleBar: {
    backgroundColor: COLOR_HEADER_BG,
    padding: 6,
    textAlign: "center",
    borderBottomWidth: 1.5,
    borderBottomColor: "#000",
    fontWeight: 700,
    fontSize: 14,
  },

  // Section title (blue)
  sectionTitle: {
    backgroundColor: COLOR_PRIMARY,
    color: "#FFF",
    fontWeight: 700,
    fontSize: 9,
    padding: 4,
    textTransform: "uppercase",
  },

  // Info row (I)
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
  fieldValue: {
    flex: 1,
    padding: 4,
    fontSize: 8.5,
  },

  // Table (II)
  tHead: {
    flexDirection: "row",
    backgroundColor: COLOR_HEADER_BG,
    fontWeight: 700,
    fontSize: 7.5,
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
  // Col widths — A4 landscape usable = 841.89 - 2*12 = 817.89pt. Sum here = 815pt.
  cSTT: { width: 22, textAlign: "center" },
  cName: { width: 100 },
  cSku: { width: 60 },
  cSpec: { width: 70 },
  cUom: { width: 30, textAlign: "center" },
  cQty: { width: 38, textAlign: "right" },
  cOnHand: { width: 40, textAlign: "right" },
  cApproved: { width: 40, textAlign: "right" },
  cNeed: { width: 48, textAlign: "center" },
  cPrio: { width: 48, textAlign: "center" },
  cCat: { width: 50, textAlign: "center" },
  cPrice: { width: 58, textAlign: "right" },
  cTotal: { width: 68, textAlign: "right" },
  cRef: { width: 48 },
  cNote: { width: 95, borderRightWidth: 0 },

  tFootRow: {
    flexDirection: "row",
    backgroundColor: COLOR_HEADER_BG,
    fontWeight: 700,
    fontSize: 8,
    borderTopWidth: 1,
    borderTopColor: COLOR_BORDER,
    padding: 3,
  },

  // Approval rows (III)
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
    minHeight: 24,
  },
  apCellRole: {
    width: 150,
    padding: 4,
    fontWeight: 700,
    borderRightWidth: 0.5,
    borderRightColor: "#CCC",
    backgroundColor: COLOR_HEADER_BG,
  },
  apCellName: {
    width: 180,
    padding: 4,
    borderRightWidth: 0.5,
    borderRightColor: "#CCC",
  },
  apCellDate: {
    width: 130,
    padding: 4,
    borderRightWidth: 0.5,
    borderRightColor: "#CCC",
    fontSize: 7.5,
  },
  apCellNote: {
    flex: 1,
    padding: 4,
    fontSize: 7.5,
  },
  apSigned: {
    backgroundColor: "#ECFDF5",
  },
  apRejected: {
    backgroundColor: "#FEF2F2",
  },

  // Rules section (V)
  rulesBox: {
    backgroundColor: COLOR_HEADER_BG,
    padding: 8,
    fontSize: 8.5,
  },
  ruleLine: { marginBottom: 2 },
});

/* =========================================================================
 * Document
 * ========================================================================= */

function YcvtPdfDoc(input: YcvtPdfInput) {
  const lines = input.lines;
  const totalAmount = input.totalEstimatedAmount ?? 0;
  const logoPath = resolveLogoPath();

  return (
    <Document
      title={`YCVT ${input.paperFormNo}`}
      author="GTAM MES"
      subject="Phiếu yêu cầu vật tư"
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

          {/* I. Thông tin chung */}
          <Text style={styles.sectionTitle}>I. Thông tin chung</Text>
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, borderRightWidth: 0.5, borderRightColor: "#999" }}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Kính gửi:</Text>
                <Text style={styles.fieldValue}>{input.targetDepartment ?? "—"}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Người đề xuất:</Text>
                <Text style={styles.fieldValue}>{input.requestedByName ?? "—"}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Bộ phận đề xuất:</Text>
                <Text style={styles.fieldValue}>{input.proposingDepartment ?? "—"}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Tiêu đề:</Text>
                <Text style={styles.fieldValue}>{input.title ?? "—"}</Text>
              </View>
            </View>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Lý do đề xuất:</Text>
            <Text style={styles.fieldValue}>{input.requestReason ?? "—"}</Text>
          </View>

          {/* II. Danh mục vật tư */}
          <Text style={styles.sectionTitle}>II. Danh mục vật tư</Text>
          <View style={styles.tHead}>
            <Text style={[styles.tCell, styles.cSTT]}>STT</Text>
            <Text style={[styles.tCell, styles.cName]}>Tên vật tư</Text>
            <Text style={[styles.tCell, styles.cSku]}>Mã VT</Text>
            <Text style={[styles.tCell, styles.cSpec]}>Quy cách</Text>
            <Text style={[styles.tCell, styles.cUom]}>ĐVT</Text>
            <Text style={[styles.tCell, styles.cQty]}>SL</Text>
            <Text style={[styles.tCell, styles.cOnHand]}>Tồn kho</Text>
            <Text style={[styles.tCell, styles.cApproved]}>Duyệt</Text>
            <Text style={[styles.tCell, styles.cNeed]}>Ngày cần</Text>
            <Text style={[styles.tCell, styles.cPrio]}>Ưu tiên</Text>
            <Text style={[styles.tCell, styles.cCat]}>Phân loại</Text>
            <Text style={[styles.tCell, styles.cPrice]}>Đơn giá DK</Text>
            <Text style={[styles.tCell, styles.cTotal]}>Tổng tiền</Text>
            <Text style={[styles.tCell, styles.cRef]}>Mã ref</Text>
            <Text style={[styles.tCell, styles.cNote]}>Ghi chú</Text>
          </View>
          {lines.map((l, idx) => {
            const lineTotal = l.qty * (l.estimatedUnitPrice ?? 0);
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
                <Text style={[styles.tCell, styles.cSku]}>{l.sku ?? "—"}</Text>
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
                <Text style={[styles.tCell, styles.cPrice]}>
                  {fmtNum(l.estimatedUnitPrice)}
                </Text>
                <Text style={[styles.tCell, styles.cTotal]}>
                  {lineTotal > 0 ? fmtNum(lineTotal) : "—"}
                </Text>
                <Text style={[styles.tCell, styles.cRef]}>
                  {l.referenceCode ?? "—"}
                </Text>
                <Text style={[styles.tCell, styles.cNote]}>{l.notes ?? "—"}</Text>
              </View>
            );
          })}
          <View style={styles.tFootRow}>
            <Text style={{ flex: 1, textAlign: "right", paddingRight: 8 }}>
              Tổng tiền dự kiến (VNĐ):
            </Text>
            <Text style={{ width: 70, textAlign: "right", color: COLOR_PRIMARY }}>
              {fmtNum(totalAmount)}
            </Text>
            <Text style={{ width: 128 }} />
          </View>

          {/* III. Kiểm tra & Phê duyệt */}
          <Text style={styles.sectionTitle}>III. Kiểm tra & Phê duyệt</Text>
          <View style={styles.apHead}>
            <Text style={styles.apCellRole}>Vai trò</Text>
            <Text style={styles.apCellName}>Họ tên</Text>
            <Text style={styles.apCellDate}>Ký tên / Ngày</Text>
            <Text style={styles.apCellNote}>Ghi chú</Text>
          </View>
          <View style={[styles.apRow, styles.apSigned]}>
            <Text style={styles.apCellRole}>Người đề xuất</Text>
            <Text style={styles.apCellName}>{input.requestedByName ?? "—"}</Text>
            <Text style={styles.apCellDate}>
              ✓ {fmtDateTime(input.createdAt)}
            </Text>
            <Text style={styles.apCellNote}>Đã ký khi gửi phiếu</Text>
          </View>
          <View
            style={[
              styles.apRow,
              input.deptApprovedAt ? styles.apSigned : {},
            ]}
          >
            <Text style={styles.apCellRole}>Trưởng bộ phận</Text>
            <Text style={styles.apCellName}>
              {input.deptApprovedByName ?? "(Chờ duyệt)"}
            </Text>
            <Text style={styles.apCellDate}>
              {input.deptApprovedAt
                ? `✓ ${fmtDateTime(input.deptApprovedAt)}`
                : "—"}
            </Text>
            <Text style={styles.apCellNote}>
              {input.deptApprovalNote ??
                (input.deptApprovedAt ? "Đã duyệt" : "Đang chờ duyệt")}
            </Text>
          </View>
          <View
            style={[
              styles.apRow,
              input.directorApprovedAt ? styles.apSigned : {},
            ]}
          >
            <Text style={styles.apCellRole}>Giám đốc / Mua hàng</Text>
            <Text style={styles.apCellName}>
              {input.directorApprovedByName ?? "(Chờ duyệt)"}
            </Text>
            <Text style={styles.apCellDate}>
              {input.directorApprovedAt
                ? `✓ ${fmtDateTime(input.directorApprovedAt)}`
                : "—"}
            </Text>
            <Text style={styles.apCellNote}>
              {input.directorApprovalNote ??
                (input.directorApprovedAt
                  ? "Đã duyệt cuối"
                  : "Đang chờ duyệt cuối")}
            </Text>
          </View>
          {input.rejectionReason ? (
            <View style={[styles.apRow, styles.apRejected]}>
              <Text style={[styles.apCellRole, { color: "#B91C1C" }]}>
                TỪ CHỐI
              </Text>
              <Text style={styles.apCellName}>—</Text>
              <Text style={styles.apCellDate}>
                {fmtDateTime(input.rejectedAt)}
              </Text>
              <Text style={[styles.apCellNote, { color: "#B91C1C" }]}>
                {input.rejectionReason}
              </Text>
            </View>
          ) : null}

          {/* IV. Theo dõi */}
          <Text style={styles.sectionTitle}>IV. Theo dõi</Text>
          <View style={styles.apHead}>
            <Text style={[styles.apCellRole, { width: 180 }]}>Trạng thái</Text>
            <Text style={[styles.apCellName, { width: 150 }]}>Ngày thực hiện</Text>
            <Text style={[styles.apCellNote, { flex: 1 }]}>Ghi chú</Text>
          </View>
          {(
            [
              {
                label: "Đã duyệt đề xuất",
                date: input.directorApprovedAt,
                note: input.directorApprovedAt ? "Giám đốc đã duyệt" : "Chưa duyệt cuối",
              },
              {
                label: "Đã tạo đơn mua (PR/PO)",
                date: input.poCreatedAt,
                note: input.poCreatedAt ? "PO đã tạo" : "—",
              },
              {
                label: "Đã nhận hàng",
                date: input.goodsReceivedAt,
                note: input.goodsReceivedAt ? "Hàng về kho" : "—",
              },
              {
                label: "Đã xuất kho",
                date: input.goodsIssuedAt,
                note: input.goodsIssuedAt ? "Đã xuất cho bộ phận" : "—",
              },
              {
                label: "Hoàn tất",
                date: input.completedAt,
                note: input.completedAt ? "Phiếu hoàn tất" : "—",
              },
            ] as Array<{ label: string; date: Date | null | undefined; note: string }>
          ).map((t, idx) => {
            const done = !!t.date;
            return (
              <View
                key={t.label}
                style={[
                  styles.apRow,
                  { minHeight: 16 },
                  done ? styles.apSigned : {},
                  idx % 2 === 1 && !done ? { backgroundColor: "#FAFAFA" } : {},
                ]}
              >
                <Text
                  style={[
                    styles.apCellRole,
                    { width: 180, fontWeight: done ? 700 : 400 },
                  ]}
                >
                  {done ? "✓ " : "○ "}
                  {t.label}
                </Text>
                <Text style={[styles.apCellName, { width: 150 }]}>
                  {done ? fmtDateTime(t.date) : "—"}
                </Text>
                <Text style={[styles.apCellNote, { flex: 1 }]}>{t.note}</Text>
              </View>
            );
          })}

          {/* V. Quy tắc quản lý */}
          <Text style={styles.sectionTitle}>V. Quy tắc quản lý</Text>
          <View style={styles.rulesBox}>
            <Text style={styles.ruleLine}>• Vật tư ESD / Non-ESD phải phân loại riêng</Text>
            <Text style={styles.ruleLine}>• Vật tư lỗi ghi rõ nguyên nhân</Text>
            <Text style={styles.ruleLine}>• Mua dự phòng cần có giải trình</Text>
            <Text style={styles.ruleLine}>• Mỗi phiếu chỉ cho 1 dự án / WO</Text>
            <Text style={styles.ruleLine}>
              • Khi hàng về kho, cập nhật trạng thái "Đã nhận hàng"
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/* =========================================================================
 * Public renderer
 * ========================================================================= */

export async function renderYcvtPdfBuffer(
  input: YcvtPdfInput,
): Promise<Uint8Array> {
  ensureFontsRegistered();
  if (!fontsRegistered) {
    throw new Error(
      `Roboto TTF không tìm thấy. cwd=${process.cwd()} candidates=${FONT_CANDIDATES.join(", ")}`,
    );
  }
  const instance: any = pdf(YcvtPdfDoc(input));
  const blob = await instance.toBlob();
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}
