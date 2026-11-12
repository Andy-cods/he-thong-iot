"use client";

import * as React from "react";
import { formatNumber } from "@/lib/format";

/** Hàng xem trước/xem phiếu — cùng cột với mẫu PHIẾU GIAO HÀNG của xưởng. */
export interface PaperRow {
  stt: number;
  name: string;
  l: number | null;
  w: number | null;
  h: number | null;
  spec: string | null;
  code: string | null;
  mgmt: string | null;
  qty: number;
  recv: number | null;
  price: number | null;
  note: string | null;
}

const PAPER_FONT = { fontFamily: '"Times New Roman", Times, serif' } as const;

/** Giấy phiếu giao hàng thu nhỏ (chỉ để xem; file thật xuất bằng Excel theo mẫu). */
export function DeliverySlipPaper({
  slipNo,
  dateText,
  recipient,
  address,
  rows,
  showPrice,
}: {
  slipNo: string;
  dateText: string;
  recipient: string;
  address: string | null;
  rows: PaperRow[];
  showPrice: boolean;
}) {
  const total = rows.reduce((a, r) => a + r.qty, 0);
  const TH = "border border-zinc-400 px-1 py-0.5 text-center font-semibold";
  const TD = "border border-zinc-300 px-1 py-0.5";
  return (
    <div
      className="overflow-x-auto rounded-xl bg-white p-4 text-[11px] leading-snug text-zinc-900 shadow-sm ring-1 ring-zinc-200"
      style={PAPER_FONT}
    >
      <div className="text-center text-base font-bold">PHIẾU GIAO HÀNG</div>
      <div className="mt-1 flex justify-between gap-4">
        <div>
          <div className="font-bold">CTCP SẢN XUẤT TỰ ĐỘNG HÓA CÔNG NGHỆ TOÀN CẦU</div>
          <div>Địa chỉ: Xóm Trại, Thôn Đông, Xã Thiên Lộc, TP. Hà Nội</div>
          <div>ĐĐ Giao nhận: Số 3 Ngõ Phúc Lộc, Mỹ Lộc, Tiến Thắng, TP. Hà Nội</div>
        </div>
        <div className="shrink-0 text-right">
          <div>{dateText}</div>
          <div>
            Số phiếu : <b>{slipNo}</b>
          </div>
        </div>
      </div>
      <div className="mt-2">
        TO : <b>{recipient || "…"}</b>
      </div>
      <div>Địa Chỉ : {address ?? ""}</div>
      <div className="mb-1">Xuất tại kho : Xưởng sản xuất CTCP.GTAM</div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH} rowSpan={2}>Số TT</th>
            <th className={TH} rowSpan={2}>Tên hàng</th>
            <th className={TH} colSpan={3}>Quy cách</th>
            <th className={TH} rowSpan={2}>Yêu cầu kỹ thuật</th>
            <th className={TH} rowSpan={2}>Mã hàng</th>
            <th className={TH} rowSpan={2}>Mã quản lý</th>
            <th className={TH} rowSpan={2}>ĐVT</th>
            <th className={TH} colSpan={2}>Số lượng</th>
            {showPrice && <th className={TH} rowSpan={2}>Đơn giá</th>}
            <th className={TH} rowSpan={2}>Ghi chú</th>
          </tr>
          <tr>
            <th className={TH}>Dài</th>
            <th className={TH}>Rộng</th>
            <th className={TH}>Cao</th>
            <th className={TH}>Chứng từ</th>
            <th className={TH}>Thực nhận</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.stt}>
              <td className={`${TD} text-center`}>{r.stt}</td>
              <td className={TD}>{r.name}</td>
              <td className={`${TD} text-center`}>{r.l ?? ""}</td>
              <td className={`${TD} text-center`}>{r.w ?? ""}</td>
              <td className={`${TD} text-center`}>{r.h ?? ""}</td>
              <td className={TD}>{r.spec ?? ""}</td>
              <td className={`${TD} text-center`}>{r.code ?? ""}</td>
              <td className={`${TD} text-center`}>{r.mgmt ?? ""}</td>
              <td className={`${TD} text-center`}>Cái</td>
              <td className={`${TD} text-right`}>{formatNumber(r.qty)}</td>
              <td className={`${TD} text-right`}>
                {r.recv != null && r.recv > 0 ? formatNumber(r.recv) : ""}
              </td>
              {showPrice && (
                <td className={`${TD} text-right`}>{r.price != null ? formatNumber(r.price) : ""}</td>
              )}
              <td className={TD}>{r.note ?? ""}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className={TD} colSpan={9}>Tổng</td>
            <td className={`${TD} text-right`}>{formatNumber(total)}</td>
            <td className={TD} colSpan={showPrice ? 3 : 2} />
          </tr>
        </tbody>
      </table>
      <div className="mt-3 grid grid-cols-4 text-center font-bold">
        <div>NGƯỜI LẬP PHIẾU</div>
        <div>NGƯỜI NHẬN HÀNG</div>
        <div>P.QLSX</div>
        <div>GIÁM ĐỐC</div>
      </div>
    </div>
  );
}
