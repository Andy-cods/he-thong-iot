/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BOM V5 — PDF "PHIẾU GIAO HÀNG" (in giấy A4 NGANG) theo mẫu FORM GTAM.
 * Cùng thư viện + font Roboto vendored (public/fonts) như deliveryNotePdf.tsx
 * (repo chỉ có font sans tiếng Việt, không có font serif).
 *
 * Muốn sửa nhanh: chữ công ty → COMPANY · độ rộng cột → W (tổng ≈ 794pt)
 * · ô ký → SIGNATURES.
 */
import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { formatDate, formatQty } from "@/lib/format";
import type { SlipDetail, SlipLineSnap } from "@/server/repos/deliverySlips";

const FONT_DIRS = [
  path.join(process.cwd(), "public/fonts"),
  path.join(process.cwd(), "apps/web/public/fonts"),
];
let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  for (const dir of FONT_DIRS) {
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

const COMPANY = {
  name: "CTCP SẢN XUẤT TỰ ĐỘNG HÓA CÔNG NGHỆ TOÀN CẦU",
  address: "Địa chỉ: Xóm Trại, Thôn Đông, Xã Thiên Lộc, TP. Hà Nội",
  deliveryPoint: "ĐĐ Giao nhận: Số 3 Ngõ Phúc Lộc, Mỹ Lộc, Tiến Thắng, TP. Hà Nội",
  warehouse: "Xuất tại kho : Xưởng sản xuất CTCP.GTAM",
};

const SIGNATURES = ["NGƯỜI LẬP PHIẾU", "NGƯỜI NHẬN HÀNG", "P.QLSX", "GIÁM ĐỐC"];

const W = { stt: 28, name: 150, d: 34, spec: 110, code: 70, mgmt: 90, uom: 34, qty: 44, price: 56, note: 66 };
const BORDER = "#000";

const s = StyleSheet.create({
  page: { fontFamily: "Roboto", fontSize: 9, paddingTop: 24, paddingBottom: 28, paddingHorizontal: 24, color: "#000" },
  top: { flexDirection: "row", justifyContent: "space-between" },
  topLeft: { flex: 1 },
  topRight: { width: 220, textAlign: "right", fontSize: 9.5 },
  company: { fontWeight: 700, fontSize: 10 },
  title: { textAlign: "center", fontWeight: 700, fontSize: 18, marginTop: 4, marginBottom: 6 },
  infoLine: { fontSize: 9.5, marginBottom: 2 },
  table: { marginTop: 6, borderTopWidth: 0.7, borderLeftWidth: 0.7, borderColor: BORDER },
  row: { flexDirection: "row" },
  cell: { borderRightWidth: 0.7, borderBottomWidth: 0.7, borderColor: BORDER, padding: 2.5, fontSize: 8.5, justifyContent: "center" },
  head: { fontWeight: 700, textAlign: "center", fontSize: 8.5 },
  signRow: { flexDirection: "row", marginTop: 10 },
  signBox: { flex: 1, textAlign: "center" },
  signTitle: { fontWeight: 700, fontSize: 9.5 },
  signHint: { fontSize: 8, marginTop: 1 },
  pageNo: { position: "absolute", bottom: 10, right: 24, fontSize: 7, color: "#666" },
});

const num = (n: number | string | null | undefined) => (n == null ? "" : formatQty(n));
const money = (n: number | string | null | undefined) =>
  n == null ? "" : Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 2 });

function vnDateLine(d: Date): string {
  const [dd, mm, yyyy] = formatDate(d, "dd/MM/yyyy").split("/");
  return `Ngày ${dd} tháng ${mm} năm ${yyyy}`;
}

type Align = "left" | "center" | "right";
function Cell({
  w,
  children,
  align = "left",
  bold,
  h,
}: {
  w: number;
  children?: React.ReactNode;
  align?: Align;
  bold?: boolean;
  h?: number;
}) {
  return (
    <View style={[s.cell, { width: w }, h ? { height: h } : {}]}>
      <Text style={[{ textAlign: align }, bold ? s.head : {}]}>{children}</Text>
    </View>
  );
}

function TableHeader() {
  const H1 = 17;
  const tall = (w: number, label: string) => (
    <Cell key={label} w={w} bold h={H1 * 2}>
      {label}
    </Cell>
  );
  return (
    <View style={s.row} fixed>
      {tall(W.stt, "Số TT")}
      {tall(W.name, "Tên hàng")}
      <View style={{ width: W.d * 3 }}>
        <Cell w={W.d * 3} bold h={H1}>
          Quy cách
        </Cell>
        <View style={s.row}>
          <Cell w={W.d} bold h={H1}>
            Dài
          </Cell>
          <Cell w={W.d} bold h={H1}>
            Rộng
          </Cell>
          <Cell w={W.d} bold h={H1}>
            Cao
          </Cell>
        </View>
      </View>
      {tall(W.spec, "Yêu cầu kỹ thuật")}
      {tall(W.code, "Mã hàng")}
      {tall(W.mgmt, "Mã quản lý")}
      {tall(W.uom, "ĐVT")}
      <View style={{ width: W.qty * 2 }}>
        <Cell w={W.qty * 2} bold h={H1}>
          Số lượng
        </Cell>
        <View style={s.row}>
          <Cell w={W.qty} bold h={H1}>
            Chứng từ
          </Cell>
          <Cell w={W.qty} bold h={H1}>
            Thực nhận
          </Cell>
        </View>
      </View>
      {tall(W.price, "Đơn giá")}
      {tall(W.note, "Ghi chú")}
    </View>
  );
}

function SlipDoc({ detail }: { detail: SlipDetail }) {
  const { slip, lines } = detail;
  const first = (lines[0]?.snap ?? null) as SlipLineSnap | null;
  const recipient = first?.recipient ?? { name: slip.recipientText ?? "", address: null };
  const totalDoc = lines.reduce((a, l) => a + Number(l.qtyDoc), 0);
  const totalRecv = lines.reduce((a, l) => a + Number(l.qtyReceived), 0);
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

  return (
    <Document title={`Phiếu giao hàng ${slip.slipNo}`} author="GTAM MES" subject="Phiếu giao hàng">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.top}>
          <View style={s.topLeft}>
            <Text style={s.company}>{COMPANY.name}</Text>
            <Text style={s.infoLine}>{COMPANY.address}</Text>
            <Text style={s.infoLine}>{COMPANY.deliveryPoint}</Text>
          </View>
          <View style={s.topRight}>
            <Text style={s.infoLine}>{vnDateLine(slip.createdAt)}</Text>
            <Text style={s.infoLine}>Số phiếu : {slip.slipNo}</Text>
          </View>
        </View>
        <Text style={s.title}>PHIẾU GIAO HÀNG</Text>
        <Text style={s.infoLine}>
          <Text>TO : </Text>
          <Text style={{ fontWeight: 700 }}>{recipient.name}</Text>
        </Text>
        <Text style={s.infoLine}>Địa Chỉ : {recipient.address ?? ""}</Text>
        <Text style={s.infoLine}>{COMPANY.warehouse}</Text>

        <View style={s.table}>
          <TableHeader />
          {lines.map((ln) => {
            const sn = ln.snap as SlipLineSnap;
            const recv = Number(ln.qtyReceived);
            return (
              <View key={ln.id} style={s.row} wrap={false}>
                <Cell w={W.stt} align="center">{String(ln.stt)}</Cell>
                <Cell w={W.name}>{sn.name}</Cell>
                <Cell w={W.d} align="center">{sn.dims ? num(sn.dims.l) : ""}</Cell>
                <Cell w={W.d} align="center">{sn.dims ? num(sn.dims.w) : ""}</Cell>
                <Cell w={W.d} align="center">{sn.dims ? num(sn.dims.h) : ""}</Cell>
                <Cell w={W.spec}>{sn.surfaceTreatment ?? ""}</Cell>
                <Cell w={W.code}>{sn.positionCode ?? ""}</Cell>
                <Cell w={W.mgmt}>{sn.projectCode ?? ""}</Cell>
                <Cell w={W.uom} align="center">{sn.uom ?? "Cái"}</Cell>
                <Cell w={W.qty} align="right">{num(ln.qtyDoc)}</Cell>
                <Cell w={W.qty} align="right">{recv > 0 ? num(recv) : ""}</Cell>
                <Cell w={W.price} align="right">{money(ln.unitPrice)}</Cell>
                <Cell w={W.note}>{ln.note ?? ""}</Cell>
              </View>
            );
          })}
          <View style={s.row} wrap={false}>
            <Cell w={W.stt + W.name + W.d * 3 + W.spec + W.code + W.mgmt + W.uom} align="center" bold>
              Tổng
            </Cell>
            <Cell w={W.qty} align="right" bold>{num(r4(totalDoc))}</Cell>
            <Cell w={W.qty} align="right" bold>{totalRecv > 0 ? num(r4(totalRecv)) : ""}</Cell>
            <Cell w={W.price + W.note}>{""}</Cell>
          </View>
        </View>

        <View style={s.signRow} wrap={false}>
          {SIGNATURES.map((t) => (
            <View key={t} style={s.signBox}>
              <Text style={s.signTitle}>{t}</Text>
              <Text style={s.signHint}>(Ký, họ tên)</Text>
              <View style={{ height: 50 }} />
            </View>
          ))}
        </View>

        <Text
          style={s.pageNo}
          fixed
          render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Trang ${pageNumber}/${totalPages}` : "")}
        />
      </Page>
    </Document>
  );
}

export async function renderDeliverySlipPdfBuffer(detail: SlipDetail): Promise<Uint8Array> {
  ensureFonts();
  if (!fontsRegistered) {
    throw new Error(`Roboto TTF không tìm thấy. cwd=${process.cwd()} candidates=${FONT_DIRS.join(", ")}`);
  }
  const instance: any = pdf(<SlipDoc detail={detail} />);
  const blob = await instance.toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
