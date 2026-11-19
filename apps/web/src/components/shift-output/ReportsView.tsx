"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { downloadFromUrl } from "@/lib/download";
import { addDays } from "@/lib/shift-output/shift-window";
import type { ParetoRow } from "@/lib/shift-output/kpi";
import type { ReportGroup, SummaryRow } from "@/lib/shift-output/report";
import {
  reportExportUrl,
  useReportPareto,
  useReportSummary,
  useReportTrend,
  useShiftContext,
  type ReportRange,
} from "@/hooks/useShiftOutput";
import { fmtDay, fmtInt, fmtPct, KpiTile } from "./primitives";

const ParetoChart = dynamic(() => import("./ShiftCharts").then((m) => m.ParetoChart), {
  ssr: false,
  loading: () => <Skeleton className="h-72 rounded-xl" />,
});
const TrendChart = dynamic(() => import("./ShiftCharts").then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <Skeleton className="h-72 rounded-xl" />,
});

/**
 * V4.10 — Báo cáo: preset Hôm nay / 7 ngày / Tháng này / Tháng trước; tab Ngày/ca ·
 * Theo máy · Theo mã hàng · Theo người/ca · Pareto lỗi · Pareto dừng · Xu hướng;
 * Xuất Excel (Chi tiết + Tổng hợp).
 */
type Tab = "day-shift" | "machine" | "part" | "operator" | "pareto-defect" | "pareto-downtime" | "trend";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "day-shift", label: "Ngày / ca" },
  { key: "machine", label: "Theo máy" },
  { key: "part", label: "Theo mã hàng" },
  { key: "operator", label: "Theo người / ca" },
  { key: "pareto-defect", label: "Pareto lỗi" },
  { key: "pareto-downtime", label: "Pareto dừng máy" },
  { key: "trend", label: "Xu hướng" },
];

type Preset = "today" | "7d" | "month" | "prev-month" | "custom";

function presetRange(p: Preset, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const first = `${today.slice(0, 7)}-01`;
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "month":
      return { from: first, to: today };
    case "prev-month": {
      const pm = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
      const from = `${pm.y}-${String(pm.m).padStart(2, "0")}-01`;
      return { from, to: addDays(first, -1) };
    }
    default:
      return { from: addDays(today, -6), to: today };
  }
}

const inputCls =
  "h-11 rounded-lg border border-zinc-200 bg-white px-3 text-[16px] text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 md:h-9 md:text-md";

export function ReportsView({ siteId }: { siteId: string | null }) {
  const ctx = useShiftContext(siteId);
  const today = ctx.data?.today;
  const [preset, setPreset] = React.useState<Preset>("7d");
  const [custom, setCustom] = React.useState<{ from: string; to: string } | null>(null);
  const [tab, setTab] = React.useState<Tab>("day-shift");
  const [machineId, setMachineId] = React.useState("");
  const [exporting, setExporting] = React.useState(false);

  if (!today) {
    return ctx.isError ? (
      <div className="p-4">
        <QueryError error={ctx.error} onRetry={() => void ctx.refetch()} />
      </div>
    ) : (
      <div className="space-y-3 p-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  const range = preset === "custom" && custom ? custom : presetRange(preset, today);
  const r: ReportRange = { ...range, siteId: ctx.data?.site.id, machineId: machineId || undefined };

  const onExport = async () => {
    setExporting(true);
    try {
      await downloadFromUrl(reportExportUrl(r), `san-luong-ca-${range.from}_${range.to}.xlsx`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-wrap items-end gap-2 rounded-xl bg-white p-3 shadow-xs dark:bg-zinc-900">
        <div className="flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800" role="tablist" aria-label="Khoảng thời gian">
          {(
            [
              ["today", "Hôm nay"],
              ["7d", "7 ngày"],
              ["month", "Tháng này"],
              ["prev-month", "Tháng trước"],
              ["custom", "Tuỳ chọn"],
            ] as Array<[Preset, string]>
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={preset === k}
              onClick={() => {
                setPreset(k);
                if (k === "custom" && !custom) setCustom(presetRange("7d", today));
              }}
              className={cn(
                "min-h-10 rounded-md px-3 text-md font-medium md:min-h-8",
                preset === k ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-950 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        {preset === "custom" && custom ? (
          <>
            <input type="date" aria-label="Từ ngày" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className={inputCls} />
            <input type="date" aria-label="Đến ngày" value={custom.to} min={custom.from} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className={inputCls} />
          </>
        ) : null}
        <select aria-label="Lọc máy" value={machineId} onChange={(e) => setMachineId(e.target.value)} className={inputCls}>
          <option value="">Tất cả máy</option>
          {ctx.data?.machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code}
            </option>
          ))}
        </select>
        <span className="text-md text-zinc-500">
          {fmtDay(range.from)} – {fmtDay(range.to)}
        </span>
        <button
          type="button"
          onClick={() => void onExport()}
          disabled={exporting}
          className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-md font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 md:min-h-9"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {exporting ? "Đang xuất…" : "Xuất Excel"}
        </button>
      </div>

      <TotalsRow r={r} />

      <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 border-b border-zinc-200 dark:border-zinc-800" role="tablist" aria-label="Loại báo cáo">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "relative min-h-11 whitespace-nowrap px-3 text-md font-semibold",
                tab === t.key
                  ? "text-indigo-700 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-indigo-600 dark:text-indigo-300"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "pareto-defect" || tab === "pareto-downtime" ? (
        <ParetoTab type={tab === "pareto-defect" ? "defect" : "downtime"} r={r} />
      ) : tab === "trend" ? (
        <TrendTab r={r} />
      ) : tab === "operator" ? (
        <div className="space-y-3">
          <SummaryTab group="operator" r={r} />
          <SummaryTab group="shift" r={r} title="So sánh theo ca" />
        </div>
      ) : (
        <SummaryTab group={tab} r={r} />
      )}
    </div>
  );
}

function TotalsRow({ r }: { r: ReportRange }) {
  const q = useReportSummary("machine", r);
  const k = q.data?.total;
  if (!k) return <Skeleton className="h-[84px] rounded-xl" />;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      <KpiTile label="Tổng OK" value={fmtInt(k.ok)} sub={`${k.entries} dòng · ${k.machineShifts} máy-ca`} tone="success" />
      <KpiTile label="Tổng NG" value={fmtInt(k.ng)} tone={k.ng ? "danger" : undefined} />
      <KpiTile label="% NG" value={fmtPct(k.ngPct)} />
      <KpiTile label="% đạt kế hoạch" value={fmtPct(k.planPct, 0)} sub={k.planned == null ? "Chưa nhập KH" : `KH ${fmtInt(k.planned)}`} />
      <KpiTile label="Phút dừng" value={k.downtimeMin == null ? "—" : `${fmtInt(k.downtimeMin)}'`} />
      <KpiTile label="% khả dụng" value={fmtPct(k.availabilityPct, 0)} sub={k.availabilityPct == null ? "Chưa ghi dừng máy" : undefined} />
    </div>
  );
}

const GROUP_HEADER: Record<ReportGroup, string> = {
  "day-shift": "Ngày · Ca",
  machine: "Máy",
  part: "Mã hàng",
  operator: "Người phụ trách",
  shift: "Ca",
};

function SummaryTab({ group, r, title }: { group: ReportGroup; r: ReportRange; title?: string }) {
  const q = useReportSummary(group, r);
  const rows = q.data?.rows ?? [];
  const columns: DataTableColumn<SummaryRow>[] = [
    {
      id: "label",
      header: GROUP_HEADER[group],
      mobile: "primary",
      cell: (x) => (
        <span className="block min-w-0">
          <span className={cn("font-medium", group === "part" || group === "machine" ? "font-mono" : undefined)}>
            {group === "day-shift" ? fmtDay(x.label) : x.label}
          </span>
          {x.sub ? <span className="ml-1.5 text-sm text-zinc-500">{x.sub}</span> : null}
        </span>
      ),
    },
    { id: "shifts", header: "Số ca", kind: "number", cell: (x) => fmtInt(x.shiftsRun), hideBelowLg: group === "day-shift" },
    { id: "ok", header: "OK", kind: "number", cell: (x) => <span className="font-semibold">{fmtInt(x.kpi.ok)}</span> },
    { id: "ng", header: "NG", kind: "number", cell: (x) => fmtInt(x.kpi.ng) },
    {
      id: "ngpct",
      header: "%NG",
      kind: "number",
      cell: (x) => (
        <span className={x.kpi.ngPct != null && x.kpi.ngPct > 10 ? "font-semibold text-red-600 dark:text-red-400" : undefined}>{fmtPct(x.kpi.ngPct)}</span>
      ),
    },
    { id: "avg", header: "TB OK/ca", kind: "number", cell: (x) => fmtInt(x.avgOkPerShift == null ? null : Math.round(x.avgOkPerShift)) },
    { id: "plan", header: "% đạt KH", kind: "number", cell: (x) => fmtPct(x.kpi.planPct, 0), hideBelowLg: true },
    { id: "dt", header: "Phút dừng", kind: "number", cell: (x) => (x.kpi.downtimeMin == null ? "—" : `${fmtInt(x.kpi.downtimeMin)}'`) },
    { id: "avail", header: "% khả dụng", kind: "number", cell: (x) => fmtPct(x.kpi.availabilityPct, 0) },
  ];
  if (q.isError) return <QueryError error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div className="space-y-2">
      {title ? <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">{title}</h3> : null}
      {!q.isLoading && rows.length === 0 ? (
        <EmptyState preset="no-data" title="Chưa có dữ liệu trong khoảng này" />
      ) : (
        <DataTable columns={columns} rows={rows} getRowKey={(x) => x.key} loading={q.isLoading} ariaLabel={`Báo cáo ${GROUP_HEADER[group]}`} minWidth={760} />
      )}
    </div>
  );
}

function ParetoTab({ type, r }: { type: "defect" | "downtime"; r: ReportRange }) {
  const q = useReportPareto(type, r);
  const unit = type === "downtime" ? "'" : "";
  const rows = q.data?.rows ?? [];
  const columns: DataTableColumn<ParetoRow>[] = [
    { id: "label", header: type === "defect" ? "Lý do lỗi" : "Lý do dừng", mobile: "primary", cell: (x) => x.label },
    { id: "v", header: type === "defect" ? "SL NG" : "Phút", kind: "number", cell: (x) => `${fmtInt(x.value)}${unit}` },
    { id: "p", header: "%", kind: "number", cell: (x) => fmtPct(x.pct) },
    { id: "c", header: "% tích luỹ", kind: "number", cell: (x) => fmtPct(x.cumPct) },
  ];
  if (q.isError) return <QueryError error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.isLoading && rows.length === 0) {
    return <EmptyState preset="empty-success" title={type === "defect" ? "Không có NG trong khoảng này" : "Không ghi dừng máy trong khoảng này"} />;
  }
  return (
    <div className="grid gap-3 lg:grid-cols-5">
      <div className="rounded-xl bg-white p-3 shadow-xs dark:bg-zinc-900 lg:col-span-3">
        {q.isLoading ? <Skeleton className="h-72 rounded-xl" /> : <ParetoChart rows={rows} unit={unit} />}
      </div>
      <div className="lg:col-span-2">
        <DataTable columns={columns} rows={rows} getRowKey={(x) => x.key} loading={q.isLoading} ariaLabel="Bảng Pareto" dense />
        <p className="mt-2 text-sm text-zinc-500">
          Tổng {fmtInt(q.data?.total)}
          {unit} · &quot;Chưa phân loại&quot; = phần chưa ghi lý do.
        </p>
      </div>
    </div>
  );
}

function TrendTab({ r }: { r: ReportRange }) {
  const q = useReportTrend(r);
  if (q.isError) return <QueryError error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div className="rounded-xl bg-white p-3 shadow-xs dark:bg-zinc-900">
      {q.data ? <TrendChart points={q.data} /> : <Skeleton className="h-72 rounded-xl" />}
    </div>
  );
}
