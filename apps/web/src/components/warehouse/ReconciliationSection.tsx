"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Download, Loader2, RefreshCw, Scale } from "lucide-react";
import { downloadCsv, toCsv } from "@/lib/csv";

/**
 * V4.1 Đợt 1c (D4) — Báo cáo kho › "Đối soát trước kiểm kê".
 *
 * CHỈ ĐỌC. Quyết định D4: kiểm kê thực tế rồi điều chỉnh tồn bằng phiếu điều
 * chỉnh — hệ thống KHÔNG tự trừ tồn lịch sử. Hai bảng:
 *   1. Phiếu yêu cầu vật tư "Đã giao" trước Đợt 1b (không phiếu xuất, chưa trừ
 *      tồn) — tổng theo mã + tồn hệ thống hiện tại.
 *   2. Giao dịch xuất không ghi vị trí (bin) — tồn theo bin chưa trừ.
 * Tải CSV (UTF-8 BOM, mở thẳng bằng Excel) để in đi kiểm kê.
 */

interface ReconciliationResp {
  data: {
    generatedAt: string;
    mrDelivered: {
      rows: Array<{
        requestId: string;
        requestNo: string;
        deliveredAt: string | null;
        requestedByName: string | null;
        lineNo: number;
        sku: string;
        itemName: string;
        uom: string | null;
        requestedQty: number;
        deliveredQty: number;
        assumedQty: number;
      }>;
      bySku: Array<{
        itemId: string;
        sku: string;
        itemName: string;
        uom: string | null;
        requestCount: number;
        assumedQty: number;
        onHandTotal: number;
        onHandAfter: number;
      }>;
      truncated: boolean;
    };
    outboundWithoutBin: {
      rows: Array<{
        txnId: string;
        occurredAt: string;
        txType: string;
        sku: string;
        itemName: string;
        uom: string | null;
        lotCode: string | null;
        qty: number;
        refTable: string | null;
        woNo: string | null;
        notes: string | null;
      }>;
      bySku: Array<{
        itemId: string;
        sku: string;
        itemName: string;
        uom: string | null;
        txnCount: number;
        qty: number;
      }>;
      truncated: boolean;
    };
  };
}

const TX_LABEL: Record<string, string> = {
  ASSEMBLY_CONSUME: "Lắp ráp tiêu hao",
  OUT_ISSUE: "Xuất kho",
  ADJUST_MINUS: "Rút hàng / điều chỉnh giảm",
};

function fmt(n: number): string {
  return Number(n.toFixed(4)).toLocaleString("vi-VN");
}

function fmtDate(at: string | null): string {
  if (!at) return "";
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at : d.toLocaleDateString("vi-VN");
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function ReconciliationSection() {
  const q = useQuery<ReconciliationResp>({
    queryKey: ["warehouse", "report", "reconciliation"],
    queryFn: async () => {
      const res = await fetch("/api/warehouse/reports/reconciliation", {
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (body as { error?: { message?: string } })?.error?.message ??
            `HTTP ${res.status}`,
        );
      }
      return body as ReconciliationResp;
    },
    staleTime: 60_000,
  });

  const d = q.data?.data;

  const exportMr = () => {
    if (!d) return;
    const csv = toCsv(
      [
        "Mã phiếu",
        "Ngày giao",
        "Người yêu cầu",
        "Dòng",
        "Mã hàng",
        "Tên hàng",
        "ĐVT",
        "SL yêu cầu",
        "SL ghi đã giao",
        "SL ước tính đã giao (chưa trừ tồn)",
      ],
      d.mrDelivered.rows.map((r) => [
        r.requestNo,
        fmtDate(r.deliveredAt),
        r.requestedByName,
        r.lineNo,
        r.sku,
        r.itemName,
        r.uom,
        r.requestedQty,
        r.deliveredQty,
        r.assumedQty,
      ]),
    );
    downloadCsv(`doi-soat-phieu-yeu-cau-da-giao-${stamp()}.csv`, csv);
  };

  const exportMrSku = () => {
    if (!d) return;
    const csv = toCsv(
      [
        "Mã hàng",
        "Tên hàng",
        "ĐVT",
        "Số phiếu",
        "SL đã giao chưa trừ",
        "Tồn hệ thống",
        "Tồn ước tính sau trừ",
        "Tồn kiểm kê thực tế",
      ],
      d.mrDelivered.bySku.map((r) => [
        r.sku,
        r.itemName,
        r.uom,
        r.requestCount,
        r.assumedQty,
        r.onHandTotal,
        r.onHandAfter,
        "",
      ]),
    );
    downloadCsv(`doi-soat-theo-ma-hang-${stamp()}.csv`, csv);
  };

  const exportNoBin = () => {
    if (!d) return;
    const csv = toCsv(
      [
        "Thời điểm",
        "Loại giao dịch",
        "Mã hàng",
        "Tên hàng",
        "ĐVT",
        "Lô",
        "SL",
        "Lệnh SX",
        "Nguồn",
        "Ghi chú",
        "Mã giao dịch",
      ],
      d.outboundWithoutBin.rows.map((r) => [
        new Date(r.occurredAt).toLocaleString("vi-VN"),
        TX_LABEL[r.txType] ?? r.txType,
        r.sku,
        r.itemName,
        r.uom,
        r.lotCode,
        r.qty,
        r.woNo,
        r.refTable,
        r.notes,
        r.txnId,
      ]),
    );
    downloadCsv(`doi-soat-xuat-khong-vi-tri-${stamp()}.csv`, csv);
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            <Scale className="h-4 w-4 text-indigo-600" aria-hidden /> Đối soát trước kiểm kê
          </h3>
          <p className="mt-0.5 max-w-3xl text-xs text-zinc-500 dark:text-zinc-400">
            Chỉ để tham khảo khi kiểm kê — hệ thống KHÔNG tự trừ tồn. Sau khi đếm thực
            tế, điều chỉnh tồn bằng thao tác Rút hàng / Nhập bổ sung tại Sơ đồ kho.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void q.refetch()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 px-3 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 print:hidden dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
        >
          <RefreshCw className={q.isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Làm mới
        </button>
      </div>

      {q.isLoading ? (
        <p className="inline-flex items-center gap-1 text-xs text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Đang tải đối soát…
        </p>
      ) : q.isError || !d ? (
        <p className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-3.5 w-3.5" />
          {(q.error as Error)?.message ?? "Không tải được báo cáo đối soát."}
        </p>
      ) : (
        <div className="space-y-5">
          {/* 1. Phiếu yêu cầu đã giao chưa trừ tồn */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                1. Phiếu yêu cầu vật tư &quot;Đã giao&quot; chưa trừ tồn ({d.mrDelivered.bySku.length} mã ·{" "}
                {new Set(d.mrDelivered.rows.map((r) => r.requestId)).size} phiếu)
              </h4>
              <div className="flex gap-2 print:hidden">
                <CsvButton onClick={exportMrSku} disabled={d.mrDelivered.bySku.length === 0} label="CSV theo mã" />
                <CsvButton onClick={exportMr} disabled={d.mrDelivered.rows.length === 0} label="CSV chi tiết" />
              </div>
            </div>
            {d.mrDelivered.bySku.length === 0 ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Không có phiếu nào — mọi phiếu đã giao đều có phiếu xuất kho.
              </p>
            ) : (
              <div className="max-h-80 overflow-auto rounded border border-zinc-100 dark:border-zinc-800">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800">
                    <tr className="text-left text-zinc-500 dark:text-zinc-400">
                      <th className="px-2 py-1.5">Mã hàng</th>
                      <th className="px-2 py-1.5">Tên</th>
                      <th className="px-2 py-1.5 text-right">Số phiếu</th>
                      <th className="px-2 py-1.5 text-right">SL đã giao chưa trừ</th>
                      <th className="px-2 py-1.5 text-right">Tồn hệ thống</th>
                      <th className="px-2 py-1.5 text-right">Tồn ước tính</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.mrDelivered.bySku.map((r) => (
                      <tr key={r.itemId} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="px-2 py-1 font-mono font-semibold text-indigo-600 dark:text-indigo-400">{r.sku}</td>
                        <td className="max-w-[260px] truncate px-2 py-1 text-zinc-700 dark:text-zinc-300">{r.itemName}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{r.requestCount}</td>
                        <td className="px-2 py-1 text-right font-mono">
                          {fmt(r.assumedQty)} <span className="text-zinc-400">{r.uom ?? ""}</span>
                        </td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(r.onHandTotal)}</td>
                        <td
                          className={
                            r.onHandAfter < 0
                              ? "px-2 py-1 text-right font-mono font-semibold text-rose-600"
                              : "px-2 py-1 text-right font-mono"
                          }
                        >
                          {fmt(r.onHandAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {d.mrDelivered.rows.length > 0 ? (
              <p className="mt-1 text-[11px] text-zinc-500">
                SL ước tính = SL ghi đã giao nếu có, ngược lại = SL yêu cầu (bản cũ không ghi SL giao).
                {d.mrDelivered.truncated ? " Chi tiết chỉ hiện 2.000 dòng đầu." : ""} Xem phiếu:{" "}
                {[...new Map(d.mrDelivered.rows.map((r) => [r.requestId, r.requestNo])).entries()]
                  .slice(0, 8)
                  .map(([id, no], i) => (
                    <React.Fragment key={id}>
                      {i > 0 ? ", " : ""}
                      <Link href={`/material-requests/${id}`} className="font-mono text-indigo-600 hover:underline">
                        {no}
                      </Link>
                    </React.Fragment>
                  ))}
                {new Set(d.mrDelivered.rows.map((r) => r.requestId)).size > 8 ? "…" : ""}
              </p>
            ) : null}
          </div>

          {/* 2. Giao dịch xuất không có bin */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                2. Giao dịch xuất không ghi vị trí — tồn theo vị trí chưa trừ ({d.outboundWithoutBin.bySku.length} mã)
              </h4>
              <div className="print:hidden">
                <CsvButton onClick={exportNoBin} disabled={d.outboundWithoutBin.rows.length === 0} label="CSV chi tiết" />
              </div>
            </div>
            {d.outboundWithoutBin.bySku.length === 0 ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Không có giao dịch xuất nào thiếu vị trí.
              </p>
            ) : (
              <div className="max-h-80 overflow-auto rounded border border-zinc-100 dark:border-zinc-800">
                <table className="w-full min-w-[520px] text-xs">
                  <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800">
                    <tr className="text-left text-zinc-500 dark:text-zinc-400">
                      <th className="px-2 py-1.5">Mã hàng</th>
                      <th className="px-2 py-1.5">Tên</th>
                      <th className="px-2 py-1.5 text-right">Số giao dịch</th>
                      <th className="px-2 py-1.5 text-right">SL vị trí đang thừa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.outboundWithoutBin.bySku.map((r) => (
                      <tr key={r.itemId} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="px-2 py-1 font-mono font-semibold text-indigo-600 dark:text-indigo-400">{r.sku}</td>
                        <td className="max-w-[260px] truncate px-2 py-1 text-zinc-700 dark:text-zinc-300">{r.itemName}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{r.txnCount}</td>
                        <td className="px-2 py-1 text-right font-mono">
                          {fmt(r.qty)} <span className="text-zinc-400">{r.uom ?? ""}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {d.outboundWithoutBin.truncated ? (
              <p className="mt-1 text-[11px] text-zinc-500">Chi tiết CSV chỉ gồm 2.000 giao dịch đầu.</p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function CsvButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
    >
      <Download className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
