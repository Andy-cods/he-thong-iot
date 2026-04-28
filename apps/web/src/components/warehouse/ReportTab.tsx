"use client";

import * as React from "react";
import { Loader2, Package, AlertTriangle, Box } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V3.7 — Tab "Báo cáo kho".
 *
 * 4 sections:
 *   1. Stats card (tổng bins / occupied / empty / low)
 *   2. Capacity utilization theo kệ (bar chart đơn giản)
 *   3. Bins low-stock (qty < lowThreshold)
 *   4. SKUs chưa gán bin
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
  const [unslotted, setUnslotted] = React.useState<ItemRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [layoutRes, itemsRes] = await Promise.all([
          fetch("/api/warehouse/layout"),
          fetch("/api/items?pageSize=100"),
        ]);
        const layoutJson = (await layoutRes.json()) as {
          data: WarehouseLayoutResp;
        };
        const itemsJson = (await itemsRes.json()) as { data: ItemRow[] };
        if (!cancelled) {
          setData(layoutJson.data);
          setUnslotted(
            (itemsJson.data ?? []).filter((i) => !i.defaultBinCode),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải báo cáo…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-sm text-rose-600">Lỗi tải dữ liệu báo cáo.</div>
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
      <header>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Báo cáo kho
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          Tổng quan utilization, bins thấp tồn và SKU chưa gán vị trí.
        </p>
      </header>

      {/* Stats KPI cards */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={<Box className="h-4 w-4" />}
          label="Tổng bins"
          value={stats.totalBins}
          tone="zinc"
        />
        <KpiCard
          icon={<Package className="h-4 w-4" />}
          label="Đang dùng"
          value={stats.occupiedBins}
          sub={`${stats.totalBins > 0 ? Math.round((stats.occupiedBins / stats.totalBins) * 100) : 0}%`}
          tone="indigo"
        />
        <KpiCard
          icon={<Box className="h-4 w-4" />}
          label="Trống"
          value={stats.emptyBins}
          sub={`${stats.totalBins > 0 ? Math.round((stats.emptyBins / stats.totalBins) * 100) : 0}%`}
          tone="emerald"
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Cảnh báo"
          value={stats.lowStockBins}
          sub="dưới ngưỡng"
          tone="amber"
        />
      </section>

      {/* Distribution by fill level */}
      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">
          Phân bố theo mức tồn (fill ratio)
        </h3>
        <div className="space-y-2">
          <DistRow
            label="Đầy (≥ 85%)"
            count={buckets.full}
            total={stats.totalBins}
            color="bg-violet-500"
          />
          <DistRow
            label="Cao (60–85%)"
            count={buckets.high}
            total={stats.totalBins}
            color="bg-indigo-500"
          />
          <DistRow
            label="Trung (30–60%)"
            count={buckets.mid}
            total={stats.totalBins}
            color="bg-blue-500"
          />
          <DistRow
            label="Thấp (1–30%)"
            count={buckets.low}
            total={stats.totalBins}
            color="bg-teal-500"
          />
          <DistRow
            label="Trống (0%)"
            count={buckets.empty}
            total={stats.totalBins}
            color="bg-zinc-300"
          />
        </div>
      </section>

      {/* Capacity utilization theo kệ */}
      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">
          Utilization theo kệ
        </h3>
        {rackList.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-500">
            Chưa có kệ nào.
          </p>
        ) : (
          <div className="space-y-2">
            {rackList.map((r) => {
              const ratio = r.totalCap > 0 ? r.totalQty / r.totalCap : 0;
              const pct = Math.min(100, Math.round(ratio * 100));
              return (
                <div key={r.rack} className="flex items-center gap-3">
                  <span className="w-16 font-mono text-xs font-semibold text-zinc-700">
                    {r.rack}
                  </span>
                  <div className="relative flex-1 overflow-hidden rounded bg-zinc-100">
                    <div
                      className={cn(
                        "h-5 transition-all",
                        pct >= 85
                          ? "bg-violet-500"
                          : pct >= 60
                            ? "bg-indigo-500"
                            : pct >= 30
                              ? "bg-blue-500"
                              : pct > 0
                                ? "bg-teal-500"
                                : "bg-zinc-200",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-zinc-900 mix-blend-difference">
                      {pct}% · {r.totalQty.toLocaleString("vi-VN")} /{" "}
                      {r.totalCap.toLocaleString("vi-VN")}
                    </span>
                  </div>
                  <span className="w-20 text-right text-xs tabular-nums text-zinc-500">
                    {r.bins.length} bins
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Low stock bins */}
      <section className="rounded-md border border-zinc-200 bg-white">
        <header className="border-b border-zinc-200 p-4">
          <h3 className="text-sm font-semibold text-zinc-900">
            Bins thấp tồn ({lowBins.length})
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Các bin có số lượng dưới ngưỡng cảnh báo (low_threshold).
          </p>
        </header>
        {lowBins.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">
            Không có bin nào dưới ngưỡng.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">Bin</th>
                <th className="px-3 py-2 text-right">Tồn</th>
                <th className="px-3 py-2 text-right">Ngưỡng thấp</th>
                <th className="px-3 py-2 text-right">Cap</th>
                <th className="px-3 py-2 text-right">SKUs</th>
              </tr>
            </thead>
            <tbody>
              {lowBins.map((b) => (
                <tr key={b.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2">
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-xs font-medium text-amber-700">
                      {b.fullCode}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-sm tabular-nums text-zinc-900">
                    {b.totalQty.toLocaleString("vi-VN")}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-500">
                    {Number(b.lowThreshold ?? 0).toLocaleString("vi-VN")}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-500">
                    {Number(b.capacity ?? 0).toLocaleString("vi-VN")}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-500">
                    {b.skuCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Unslotted SKUs */}
      <section className="rounded-md border border-zinc-200 bg-white">
        <header className="border-b border-zinc-200 p-4">
          <h3 className="text-sm font-semibold text-zinc-900">
            SKU chưa gán vị trí kho ({unslotted.length})
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Các SKU chưa có default_bin_id — khi nhận hàng sẽ không tự putaway.
            Vào tab Vật tư → edit → gán bin.
          </p>
        </header>
        {unslotted.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-emerald-600">
            ✓ Tất cả SKU đã được gán vị trí.
          </p>
        ) : (
          <ul className="max-h-72 divide-y divide-zinc-100 overflow-auto">
            {unslotted.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-3 px-4 py-2"
              >
                <div className="min-w-0">
                  <code className="font-mono text-xs font-semibold text-zinc-900">
                    {it.sku}
                  </code>
                  <p className="truncate text-xs text-zinc-600">{it.name}</p>
                </div>
                {it.inventorySummary && it.inventorySummary.totalQty > 0 && (
                  <span className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Có tồn: {it.inventorySummary.totalQty}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  tone: "zinc" | "indigo" | "emerald" | "amber";
}) {
  const tones = {
    zinc: "bg-zinc-50 text-zinc-700 ring-zinc-200",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
  };
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset",
            tones[tone],
          )}
        >
          {icon}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-2xl font-semibold tabular-nums text-zinc-900">
          {value.toLocaleString("vi-VN")}
        </span>
        {sub && <span className="text-xs text-zinc-500">{sub}</span>}
      </div>
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
      <span className="w-32 text-xs text-zinc-700">{label}</span>
      <div className="relative flex-1 overflow-hidden rounded bg-zinc-100">
        <div
          className={cn("h-4 transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-20 text-right text-xs tabular-nums text-zinc-600">
        {count} ({pct}%)
      </span>
    </div>
  );
}

