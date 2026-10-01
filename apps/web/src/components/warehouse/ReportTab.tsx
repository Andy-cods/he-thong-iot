"use client";

import * as React from "react";
import { Loader2, Package, AlertTriangle, Box, RefreshCw, Printer, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { QueryError } from "@/components/ui/query-error";
import { StatTile } from "@/components/ui/data-table";
import { ReconciliationSection } from "./ReconciliationSection";
import { formatQty } from "@/lib/format";

/**
 * V3.7 — Tab "Báo cáo kho".
 *
 * Sections:
 *   1. Stats card (tổng bins / occupied / empty / low)
 *   2. Capacity utilization theo kệ (bar chart đơn giản)
 *   3. Bins low-stock (qty < lowThreshold)
 *   4. SKUs chưa gán bin
 *   5. V4.1 Đợt 1c — Đối soát trước kiểm kê (ReconciliationSection, D4)
 *
 * TASK-6VIEC Việc 4 — "Kiểm kê kho" (StocktakeSection, trước là section #6
 * ở đây từ V4.3 Việc 2) đã tách sang tab riêng "Kiểm kê" — xem StocktakeTab.tsx.
 */

interface BinNode {
  id: string;
  fullCode: string;
  area: string | null;
  rack: string | null;
  levelNo: number | null;
  position: string | null;
  capacity: string | null;
  lowThreshold: string | null;
  isActive: boolean;
  totalQty: number;
  skuCount: number;
  isLow: boolean;
}

interface WarehouseLayoutResp {
  bins: BinNode[];
  stats: {
    totalBins: number;
    occupiedBins: number;
    emptyBins: number;
    lowStockBins: number;
    totalSKUs: number;
    totalLots: number;
    totalQty: number;
  };
}

interface ItemRow {
  id: string;
  sku: string;
  name: string;
  defaultBinCode: string | null;
  inventorySummary?: { totalQty: number };
}

export function ReportTab() {
  const [data, setData] = React.useState<WarehouseLayoutResp | null>(null);
  const [topItems, setTopItems] = React.useState<ItemRow[]>([]);
  const [unslotted, setUnslotted] = React.useState<ItemRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  // V4.1 UI-05: lỗi tải → khối lỗi + "Thử lại", không hiện "Chưa có …".
  const [loadError, setLoadError] = React.useState<unknown>(null);
  const [refreshTick, setRefreshTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [layoutRes, itemsRes] = await Promise.all([
          fetch("/api/warehouse/layout"),
          fetch("/api/items?pageSize=100"),
        ]);
        const badRes = !layoutRes.ok ? layoutRes : !itemsRes.ok ? itemsRes : null;
        if (badRes) {
          throw Object.assign(new Error(`HTTP ${badRes.status}`), { status: badRes.status });
        }
        const layoutJson = (await layoutRes.json()) as {
          data: WarehouseLayoutResp;
        };
        const itemsJson = (await itemsRes.json()) as { data: ItemRow[] };
        if (!cancelled) {
          setData(layoutJson.data);
          const items = itemsJson.data ?? [];
          setUnslotted(items.filter((i) => !i.defaultBinCode));
          // Top 8 SKU by qty
          setTopItems(
            items
              .filter((i) => (i.inventorySummary?.totalQty ?? 0) > 0)
              .sort(
                (a, b) =>
                  (b.inventorySummary?.totalQty ?? 0) -
                  (a.inventorySummary?.totalQty ?? 0),
              )
              .slice(0, 8),
          );
        }
      } catch (e) {
        if (!cancelled) setLoadError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const handleRefresh = () => setRefreshTick((t) => t + 1);
  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải báo cáo…
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <QueryError
        error={loadError}
        onRetry={handleRefresh}
        retrying={loading}
        title="Không tải được dữ liệu báo cáo kho"
      />
    );
  }

  const { bins, stats } = data;

  // Group bins by rack, compute fill ratio
  const byRack = new Map<
    string,
    { rack: string; bins: BinNode[]; totalCap: number; totalQty: number }
  >();
  for (const b of bins) {
    if (!b.rack || !b.area) continue;
    const key = `${b.area}-${b.rack}`;
    const cap = Number(b.capacity ?? 0);
    if (!byRack.has(key)) {
      byRack.set(key, { rack: key, bins: [], totalCap: 0, totalQty: 0 });
    }
    const g = byRack.get(key)!;
    g.bins.push(b);
    g.totalCap += cap;
    g.totalQty += b.totalQty;
  }
  const rackList = Array.from(byRack.values()).sort((a, b) =>
    a.rack.localeCompare(b.rack),
  );

  // Low stock bins (isLow + qty > 0)
  const lowBins = bins.filter((b) => b.isLow && b.totalQty > 0);

  // Capacity buckets
  const buckets = { full: 0, high: 0, mid: 0, low: 0, empty: 0 };
  for (const b of bins) {
    const cap = Number(b.capacity ?? 0);
    if (cap === 0) continue;
    const ratio = b.totalQty / cap;
    if (ratio >= 0.85) buckets.full++;
    else if (ratio >= 0.6) buckets.high++;
    else if (ratio >= 0.3) buckets.mid++;
    else if (ratio > 0) buckets.low++;
    else buckets.empty++;
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Báo cáo kho
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {/* V4.1 UI-27: tiếng Việt hoá thuật ngữ kho (utilization/bins/fill ratio/putaway). */}
            Tỷ lệ sử dụng kệ, ô thấp tồn, mã tồn nhiều nhất và mã chưa gán vị trí.
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 px-3 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
            title="Tải lại dữ liệu"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Làm mới
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 px-3 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
            title="In / Xuất PDF (Ctrl+P)"
          >
            <Printer className="h-3.5 w-3.5" /> In / PDF
          </button>
        </div>
      </header>

      {/* Stats KPI cards — V4.4 B (N1/N2): trước 4 ô `KpiCard` tự chế cùng cỡ
          (không ô nào nổi bật). Đổi sang `StatTile` dùng chung, đúng 1 ô hero
          ("Đang dùng" — chỉ số tổng quan sử dụng kho quan trọng nhất/báo cáo). */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={Box} label="Tổng số ô" value={formatQty(stats.totalBins)} />
        <StatTile
          size="hero"
          icon={Package}
          label="Đang dùng"
          value={formatQty(stats.occupiedBins)}
          sub={`${stats.totalBins > 0 ? Math.round((stats.occupiedBins / stats.totalBins) * 100) : 0}% tổng số ô`}
        />
        <StatTile
          icon={Box}
          label="Trống"
          value={formatQty(stats.emptyBins)}
          sub={`${stats.totalBins > 0 ? Math.round((stats.emptyBins / stats.totalBins) * 100) : 0}%`}
        />
        <StatTile
          icon={AlertTriangle}
          label="Cảnh báo"
          value={formatQty(stats.lowStockBins)}
          sub="dưới ngưỡng"
          tone={stats.lowStockBins > 0 ? "warning" : undefined}
        />
      </section>

      {/* Distribution by fill level */}
      <section className="rounded-xl bg-white p-4 shadow-xs dark:bg-zinc-900">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Phân bố theo mức lấp đầy
        </h3>
        {/* V4.4 B (P1 nặng) — trước 4 màu khác họ (violet/indigo/blue/teal) cho
            cùng khái niệm "% lấp đầy" mà Sơ đồ kho dùng ĐÚNG 1 thang indigo
            (xem `WarehouseLayout3D.tsx` THEMES full/high/mid/low). Đổi về
            cùng 1 thang indigo đậm→nhạt cho nhất quán giữa 2 tab. */}
        <div className="space-y-2">
          <DistRow
            label="Đầy (≥ 85%)"
            count={buckets.full}
            total={stats.totalBins}
            color="bg-indigo-700 dark:bg-indigo-500"
          />
          <DistRow
            label="Cao (60–85%)"
            count={buckets.high}
            total={stats.totalBins}
            color="bg-indigo-500 dark:bg-indigo-400"
          />
          <DistRow
            label="Trung (30–60%)"
            count={buckets.mid}
            total={stats.totalBins}
            color="bg-indigo-400 dark:bg-indigo-400/70"
          />
          <DistRow
            label="Thấp (1–30%)"
            count={buckets.low}
            total={stats.totalBins}
            color="bg-indigo-200 dark:bg-indigo-300/40"
          />
          <DistRow
            label="Trống (0%)"
            count={buckets.empty}
            total={stats.totalBins}
            color="bg-zinc-300 dark:bg-zinc-700"
          />
        </div>
      </section>

      {/* Capacity utilization theo kệ */}
      <section className="rounded-xl bg-white p-4 shadow-xs dark:bg-zinc-900">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Tỷ lệ sử dụng theo kệ
        </h3>
        {rackList.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Chưa có kệ nào.
          </p>
        ) : (
          <div className="space-y-2">
            {rackList.map((r) => {
              const ratio = r.totalCap > 0 ? r.totalQty / r.totalCap : 0;
              const pct = Math.min(100, Math.round(ratio * 100));
              return (
                <div key={r.rack} className="flex items-center gap-3">
                  <span
                    className="w-24 shrink-0 truncate whitespace-nowrap font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300"
                    title={r.rack}
                  >
                    {r.rack}
                  </span>
                  <div className="relative min-w-0 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className={cn(
                        "h-5 transition-all",
                        // V4.4 B — cùng thang indigo với "Phân bố theo mức lấp đầy" ở trên.
                        pct >= 85
                          ? "bg-indigo-700 dark:bg-indigo-500"
                          : pct >= 60
                            ? "bg-indigo-500 dark:bg-indigo-400"
                            : pct >= 30
                              ? "bg-indigo-400 dark:bg-indigo-400/70"
                              : pct > 0
                                ? "bg-indigo-200 dark:bg-indigo-300/40"
                                : "bg-zinc-200 dark:bg-zinc-700",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {/* V4.1: nhãn % nằm NGOÀI thanh (trước đây chữ trong thanh gần như vô hình). */}
                  <span className="w-32 shrink-0 whitespace-nowrap text-right sm:w-44 text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
                    {r.totalCap > 0 ? (
                      <>
                        <span className="font-semibold">{pct}%</span> · {formatQty(r.totalQty)} /{" "}
                        {formatQty(r.totalCap)}
                      </>
                    ) : (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {formatQty(r.totalQty)} · chưa có sức chứa
                      </span>
                    )}
                  </span>
                  <span className="hidden w-12 shrink-0 whitespace-nowrap text-right text-xs sm:inline-block tabular-nums text-zinc-500 dark:text-zinc-400">
                    {r.bins.length} ô
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Top SKU by qty */}
      <section className="rounded-xl bg-white shadow-xs dark:bg-zinc-900">
        <header className="border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            <TrendingUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            Mã tồn nhiều nhất ({topItems.length})
          </h3>
        </header>
        {topItems.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Chưa có mã vật tư nào có tồn.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="w-10 px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Mã vật tư</th>
                <th className="px-3 py-2 text-left">Tên</th>
                <th className="px-3 py-2 text-left">Ô mặc định</th>
                <th className="px-3 py-2 text-right">Tồn</th>
              </tr>
            </thead>
            <tbody>
              {topItems.map((it, idx) => (
                <tr key={it.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                    {it.sku}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <span className="block truncate" title={it.name}>
                      {it.name}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {it.defaultBinCode ? (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                        {it.defaultBinCode}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatQty(it.inventorySummary?.totalQty ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Low stock bins */}
      <section className="rounded-xl bg-white shadow-xs dark:bg-zinc-900">
        <header className="border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Ô thấp tồn ({lowBins.length})
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Các ô kệ có số lượng dưới ngưỡng cảnh báo tồn thấp đã cài cho ô.
          </p>
        </header>
        {lowBins.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Không có ô nào dưới ngưỡng.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">Ô kệ</th>
                <th className="px-3 py-2 text-right">Tồn</th>
                <th className="px-3 py-2 text-right">Ngưỡng thấp</th>
                <th className="px-3 py-2 text-right">Sức chứa</th>
                <th className="px-3 py-2 text-right">Số mã</th>
              </tr>
            </thead>
            <tbody>
              {lowBins.map((b) => (
                <tr key={b.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-2">
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                      {b.fullCode}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-sm tabular-nums text-zinc-900 dark:text-zinc-50">
                    {formatQty(b.totalQty)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {formatQty(b.lowThreshold ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {formatQty(b.capacity ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {b.skuCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Unslotted SKUs */}
      <section className="rounded-xl bg-white shadow-xs dark:bg-zinc-900">
        <header className="border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Mã chưa gán vị trí kho ({unslotted.length})
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Các mã vật tư chưa có ô kệ mặc định — khi nhận hàng hệ thống sẽ không
            tự xếp kệ. Vào tab Vật tư → Sửa → gán ô kệ mặc định.
          </p>
        </header>
        {unslotted.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-emerald-600 dark:text-emerald-400">
            ✓ Tất cả mã vật tư đã được gán vị trí.
          </p>
        ) : (
          <ul className="max-h-72 divide-y divide-zinc-100 overflow-auto dark:divide-zinc-800">
            {unslotted.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-3 px-4 py-2"
              >
                <div className="min-w-0">
                  <code className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                    {it.sku}
                  </code>
                  <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">{it.name}</p>
                </div>
                {it.inventorySummary && it.inventorySummary.totalQty > 0 && (
                  <span className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                    Có tồn: {formatQty(it.inventorySummary.totalQty)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* TASK-6VIEC Việc 4 — "Kiểm kê kho" (StocktakeSection) tách sang tab
          riêng "Kiểm kê" (ngang "Báo cáo kho") — xem StocktakeTab.tsx. */}

      {/* V4.1 Đợt 1c (D4) — đối soát trước kiểm kê (chỉ đọc, không tự trừ tồn) */}
      <ReconciliationSection />
    </div>
  );
}

function DistRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 text-xs text-zinc-700 dark:text-zinc-300">{label}</span>
      <div className="relative flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
        <div
          className={cn("h-4 transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-24 whitespace-nowrap text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
        {count} ô ({pct}%)
      </span>
    </div>
  );
}

