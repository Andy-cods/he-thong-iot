"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { formatDate, formatNumber } from "@/lib/format";
import {
  slipExportUrl,
  useDeliverySlip,
  useDeliverySlips,
  useReceiveDeliverySlip,
  type SlipStatus,
} from "@/hooks/useDeliverySlips";
import { DeliverySlipPaper, type PaperRow } from "@/components/bom-grid-pro/DeliverySlipPaper";

const STATUS: Record<SlipStatus, { label: string; cls: string }> = {
  SENT: { label: "Đã gửi", cls: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" },
  PARTIAL_RECEIVED: { label: "Nhận một phần", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  RECEIVED: { label: "Đã nhận đủ", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  CANCELLED: { label: "Đã huỷ", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800" },
};
const KIND_LABEL = { SURFACE: "Gửi nhà thầu phụ", ASSEMBLY: "Giao lắp ráp" } as const;

function vnDateText(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `Ngày ${p(d.getUTCDate())} tháng ${p(d.getUTCMonth() + 1)} năm ${d.getUTCFullYear()}`;
}

function SlipDetail({ templateId, slipId }: { templateId: string; slipId: string }) {
  const q = useDeliverySlip(slipId);
  const recvMut = useReceiveDeliverySlip(templateId);
  const [add, setAdd] = React.useState<Record<string, string>>({});
  const d = q.data?.data;
  if (q.isLoading || !d) return <Skeleton className="h-48 w-full" />;
  const { slip, lines } = d;
  const canReceive = slip.kind === "SURFACE" && (slip.status === "SENT" || slip.status === "PARTIAL_RECEIVED");

  const rows: PaperRow[] = lines.map((l) => ({
    stt: l.stt,
    name: l.snap.name,
    l: l.snap.dims?.l ?? null,
    w: l.snap.dims?.w ?? null,
    h: l.snap.dims?.h ?? null,
    spec: l.snap.surfaceTreatment,
    code: l.snap.positionCode,
    mgmt: l.snap.projectCode,
    qty: Number(l.qtyDoc),
    recv: Number(l.qtyReceived),
    price: l.unitPrice != null ? Number(l.unitPrice) : null,
    note: l.note,
  }));

  const pending = lines
    .map((l) => ({ l, qty: Number(add[l.id] ?? 0) }))
    .filter((x) => x.qty > 0);
  const overDoc = pending.some((x) => x.qty > Number(x.l.qtyDoc) - Number(x.l.qtyReceived) + 5e-5);

  const submit = async () => {
    try {
      await recvMut.mutateAsync({
        slipId,
        lines: pending.map((x) => ({ slipLineId: x.l.id, qty: x.qty })),
      });
      toast.success("Đã ghi thực nhận, hàng chuyển sang QC");
      setAdd({});
    } catch (e) {
      toast.error((e as Error).message || "Không ghi được thực nhận.");
    }
  };

  return (
    <div className="space-y-3">
      <DeliverySlipPaper
        slipNo={slip.slipNo}
        dateText={vnDateText(slip.createdAt)}
        recipient={lines[0]?.snap.recipient.name ?? slip.recipientText ?? ""}
        address={lines[0]?.snap.recipient.address ?? null}
        rows={rows}
        showPrice={slip.kind === "SURFACE"}
      />
      {canReceive && (
        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
          <div className="mb-2 text-sm font-medium">Nhận hàng về (cộng dồn, tối đa theo chứng từ)</div>
          <div className="space-y-1.5">
            {lines.map((l) => {
              const left = Number(l.qtyDoc) - Number(l.qtyReceived);
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 basis-40 truncate">{l.stt}. {l.snap.name}</span>
                  <span className="text-xs text-zinc-500">
                    đã nhận {formatNumber(Number(l.qtyReceived))}/{formatNumber(Number(l.qtyDoc))}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={left}
                    step="any"
                    disabled={left <= 5e-5}
                    value={add[l.id] ?? ""}
                    placeholder={left > 5e-5 ? `≤ ${formatNumber(left)}` : "đủ"}
                    aria-label={`Nhận thêm ${l.snap.name}`}
                    onChange={(e) => setAdd((p) => ({ ...p, [l.id]: e.target.value }))}
                    className="h-8 w-24 rounded-lg border border-zinc-200 bg-white px-2 text-right font-mono text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-end">
            <Button type="button" size="sm" onClick={submit} disabled={pending.length === 0 || overDoc || recvMut.isPending}>
              {recvMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Ghi thực nhận → QC
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** BOM V5 WP8b — tab "Phiếu giao": danh sách phiếu của BOM, xem, tải Excel, nhập Thực nhận (SURFACE). */
export function DeliverySlipsPanel({ bomId }: { bomId: string }) {
  const q = useDeliverySlips(bomId);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const rows = q.data?.data ?? [];

  if (q.isError) return <QueryError error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div className="h-full overflow-y-auto p-5">
      {q.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Chưa có phiếu giao. Chọn dòng trong lưới BOM rồi bấm &quot;Gửi nhà thầu phụ&quot; hoặc &quot;Giao lắp ráp&quot;.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => {
            const st = STATUS[s.status];
            const open = openId === s.id;
            return (
              <li key={s.id} className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    className="font-mono text-sm font-semibold hover:underline"
                    onClick={() => setOpenId(open ? null : s.id)}
                    aria-expanded={open}
                  >
                    {s.slipNo}
                  </button>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                  <span className="text-xs text-zinc-500">{KIND_LABEL[s.kind]}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{s.recipientText}</span>
                  <span className="text-xs text-zinc-500">
                    {s.lineCount} dòng · SL {formatNumber(s.totalQtyDoc)}
                    {s.kind === "SURFACE" ? ` · nhận ${formatNumber(s.totalQtyReceived)}` : ""}
                  </span>
                  <span className="text-xs text-zinc-500">{formatDate(s.createdAt, "dd/MM/yyyy HH:mm")}</span>
                  <a
                    href={slipExportUrl(s.id)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden /> Excel
                  </a>
                </div>
                {open && (
                  <div className="border-t border-zinc-100 p-4 dark:border-zinc-800">
                    <SlipDetail templateId={bomId} slipId={s.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
