"use client";

import * as React from "react";
import {
  AlertTriangle,
  Box,
  Boxes,
  CheckCircle2,
  Loader2,
  Package,
  Search,
  Warehouse,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WarehouseLayout3D, type BinNode } from "./WarehouseLayout3D";

/**
 * V3.6 — WarehouseLayoutTab.
 *
 * Tab "Sơ đồ kho" trong /warehouse hub:
 * - Header: search lookup SKU + KPI inline
 * - 3D layout 70% + side drawer 30% (bin detail) khi click
 */

interface BinDetail {
  itemId: string;
  itemSku: string | null;
  itemName: string | null;
  itemUom: string | null;
  lotSerialId: string;
  lotCode: string | null;
  serialCode: string | null;
  qty: number;
  mfgDate: string | null;
  expDate: string | null;
  status: string;
}

interface LookupRow {
  binId: string;
  binFullCode: string;
  area: string | null;
  rack: string | null;
  levelNo: number | null;
  position: string | null;
  lotSerialId: string;
  lotCode: string | null;
  qty: number;
  mfgDate: string | null;
  expDate: string | null;
  status: string;
}

interface LayoutResponse {
  data: {
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
  };
}

export function WarehouseLayoutTab() {
  const [selectedBinId, setSelectedBinId] = React.useState<string | null>(null);
  const [hoveredBinId, setHoveredBinId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const layoutQuery = useQuery<LayoutResponse>({
    queryKey: ["warehouse", "layout"],
    queryFn: async () => {
      const res = await fetch("/api/warehouse/layout", { credentials: "include" });
      if (!res.ok) throw new Error("Không tải được layout kho");
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const lookupQuery = useQuery({
    queryKey: ["warehouse", "lookup", debouncedSearch],
    queryFn: async () => {
      const res = await fetch(
        `/api/warehouse/lookup?q=${encodeURIComponent(debouncedSearch)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error();
      return res.json() as Promise<{
        data: {
          matchedItems: Array<{ id: string; sku: string; name: string; uom: string | null }>;
          locations: LookupRow[];
        };
      }>;
    },
    enabled: debouncedSearch.length >= 1,
    staleTime: 15_000,
  });

  const binDetailQuery = useQuery({
    queryKey: ["warehouse", "bin", selectedBinId],
    queryFn: async () => {
      const res = await fetch(`/api/warehouse/bins/${selectedBinId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      return res.json() as Promise<{ data: { binId: string; content: BinDetail[] } }>;
    },
    enabled: !!selectedBinId,
    staleTime: 10_000,
  });

  const data = layoutQuery.data?.data;
  const bins = data?.bins ?? [];
  const stats = data?.stats;
  const selectedBin = bins.find((b) => b.id === selectedBinId) ?? null;
  const hoveredBin = bins.find((b) => b.id === hoveredBinId) ?? null;

  const lookupHits = new Set<string>();
  if (lookupQuery.data?.data.locations) {
    for (const loc of lookupQuery.data.data.locations) {
      lookupHits.add(loc.binId);
    }
  }

  return (
    <div className="flex h-full flex-col bg-zinc-50/30">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md">
              <Warehouse className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">Sơ đồ kho — Khu A</h1>
              <p className="text-xs text-zinc-500">
                Mã hoá vị trí: Khu-Kệ-Ngăn-Ô (vd A-01-2-03)
              </p>
            </div>
          </div>

          {/* Search lookup */}
          <div className="relative min-w-[280px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm SKU hoặc tên linh kiện..."
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-9 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* KPI strip */}
        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <KpiPill icon={Box} label="Tổng vị trí" value={stats.totalBins} color="zinc" />
            <KpiPill icon={Package} label="Có hàng" value={stats.occupiedBins} color="emerald" />
            <KpiPill icon={Box} label="Trống" value={stats.emptyBins} color="zinc" />
            <KpiPill icon={AlertTriangle} label="Sắp hết" value={stats.lowStockBins} color="amber" />
            <KpiPill icon={Boxes} label="SKU đang trữ" value={stats.totalSKUs} color="indigo" />
            <KpiPill icon={Package} label="Lots" value={stats.totalLots} color="violet" />
            <KpiPill icon={CheckCircle2} label="Tổng SL" value={Math.round(stats.totalQty)} color="blue" />
          </div>
        )}
      </header>

      {/* Lookup result strip */}
      {debouncedSearch && lookupQuery.data && (
        <div className="border-b border-zinc-200 bg-indigo-50/50 px-6 py-3">
          {lookupQuery.data.data.matchedItems.length === 0 ? (
            <p className="text-sm text-zinc-600">Không tìm thấy "{debouncedSearch}"</p>
          ) : (
            <div className="flex items-start gap-3">
              <Search className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900">
                  Tìm thấy{" "}
                  <span className="text-indigo-700">{lookupQuery.data.data.matchedItems.length}</span>{" "}
                  SKU ·{" "}
                  <span className="text-indigo-700">{lookupQuery.data.data.locations.length}</span>{" "}
                  vị trí
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {lookupQuery.data.data.locations.map((loc) => (
                    <button
                      key={`${loc.binId}-${loc.lotSerialId}`}
                      onClick={() => setSelectedBinId(loc.binId)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white border border-indigo-200 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      <span className="font-mono">{loc.binFullCode}</span>
                      <span className="text-indigo-400">·</span>
                      <span>{loc.qty.toLocaleString("vi-VN")}</span>
                      {loc.lotCode && (
                        <>
                          <span className="text-indigo-400">·</span>
                          <span className="font-mono text-[10px]">{loc.lotCode}</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Body: 3D layout + side panel */}
      <div className="relative flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {layoutQuery.isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải sơ đồ kho...
            </div>
          ) : bins.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <Warehouse className="h-12 w-12 text-zinc-300" />
              <p className="text-base font-semibold text-zinc-700">Chưa có bins nào</p>
              <p className="text-sm text-zinc-500">
                Migration 0034 cần được apply để seed 90 bins khu A.
              </p>
            </div>
          ) : (
            <div className="absolute inset-4">
              <WarehouseLayout3D
                bins={bins}
                selectedBinId={selectedBinId}
                hoveredBinId={hoveredBinId}
                onBinClick={(b) => setSelectedBinId(b.id)}
                onBinHover={setHoveredBinId}
              />
            </div>
          )}

          {/* Hover tooltip */}
          {hoveredBin && hoveredBin.id !== selectedBinId && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-xl bg-black/80 px-4 py-2 text-sm text-white backdrop-blur-md shadow-xl">
              <p className="font-mono font-bold">{hoveredBin.fullCode}</p>
              <p className="text-xs text-white/70">
                {hoveredBin.totalQty > 0
                  ? `${hoveredBin.totalQty.toLocaleString("vi-VN")} SL · ${hoveredBin.skuCount} SKU · ${hoveredBin.lotCount} lot`
                  : "Trống"}
              </p>
            </div>
          )}
        </div>

        {/* Side panel — bin detail */}
        {selectedBin && (
          <div className="w-[380px] shrink-0 border-l border-zinc-200 bg-white overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-3.5">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">Vị trí</p>
                <p className="font-mono text-lg font-bold text-zinc-900">{selectedBin.fullCode}</p>
              </div>
              <button
                onClick={() => setSelectedBinId(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <DetailStat label="Tổng SL" value={selectedBin.totalQty.toLocaleString("vi-VN")} />
                <DetailStat label="Số SKU" value={String(selectedBin.skuCount)} />
                <DetailStat label="Số lot" value={String(selectedBin.lotCount)} />
                <DetailStat
                  label="Sức chứa"
                  value={selectedBin.capacity ? Number(selectedBin.capacity).toLocaleString("vi-VN") : "—"}
                />
              </div>

              {selectedBin.isLow && selectedBin.totalQty > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" /> Cảnh báo sắp hết
                  </p>
                  <p className="mt-1 text-xs">
                    Còn {selectedBin.totalQty.toLocaleString("vi-VN")} ·
                    Ngưỡng cảnh báo {Number(selectedBin.lowThreshold ?? 0).toLocaleString("vi-VN")}
                  </p>
                </div>
              )}

              <div>
                <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Nội dung
                </h3>
                {binDetailQuery.isLoading ? (
                  <p className="text-sm text-zinc-500">Đang tải...</p>
                ) : !binDetailQuery.data?.data.content.length ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-500">
                    Vị trí trống
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {binDetailQuery.data.data.content.map((c) => (
                      <li key={`${c.lotSerialId}`} className="rounded-xl border border-zinc-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-sm font-semibold text-indigo-600">{c.itemSku ?? "—"}</p>
                            <p className="mt-0.5 text-xs text-zinc-700 truncate">{c.itemName ?? "—"}</p>
                          </div>
                          <span className="font-mono text-base font-bold tabular-nums text-emerald-700">
                            {c.qty.toLocaleString("vi-VN")}
                            {c.itemUom && <span className="ml-1 text-xs font-normal text-zinc-500">{c.itemUom}</span>}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                          {c.lotCode && (
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-indigo-700">
                              Lot: {c.lotCode}
                            </span>
                          )}
                          {c.serialCode && (
                            <span className="rounded bg-violet-50 px-1.5 py-0.5 font-mono text-violet-700">
                              SN: {c.serialCode}
                            </span>
                          )}
                          {c.mfgDate && <span>NSX: {c.mfgDate}</span>}
                          {c.expDate && <span>HSD: {c.expDate}</span>}
                          <span className={cn(
                            "rounded px-1.5 py-0.5 font-medium",
                            c.status === "AVAILABLE" ? "bg-emerald-50 text-emerald-700" :
                            c.status === "HOLD" ? "bg-red-50 text-red-700" :
                            "bg-zinc-100 text-zinc-600",
                          )}>
                            {c.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiPill({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: "indigo" | "emerald" | "amber" | "zinc" | "violet" | "blue";
}) {
  const map = {
    indigo:  { bg: "bg-indigo-50",  iconBg: "bg-indigo-100",  iconText: "text-indigo-700",  valueText: "text-indigo-700"  },
    emerald: { bg: "bg-emerald-50", iconBg: "bg-emerald-100", iconText: "text-emerald-700", valueText: "text-emerald-700" },
    amber:   { bg: "bg-amber-50",   iconBg: "bg-amber-100",   iconText: "text-amber-700",   valueText: "text-amber-700"   },
    zinc:    { bg: "bg-zinc-50",    iconBg: "bg-zinc-100",    iconText: "text-zinc-600",    valueText: "text-zinc-700"    },
    violet:  { bg: "bg-violet-50",  iconBg: "bg-violet-100",  iconText: "text-violet-700",  valueText: "text-violet-700"  },
    blue:    { bg: "bg-blue-50",    iconBg: "bg-blue-100",    iconText: "text-blue-700",    valueText: "text-blue-700"    },
  };
  const cls = map[color];
  return (
    <div className={cn("flex items-center gap-2.5 rounded-xl border border-zinc-100 px-3 py-2", cls.bg)}>
      <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", cls.iconBg)}>
        <Icon className={cn("h-3.5 w-3.5", cls.iconText)} strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        <p className={cn("text-base font-bold tabular-nums leading-none", cls.valueText)}>
          {value.toLocaleString("vi-VN")}
        </p>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-base font-bold text-zinc-900">{value}</p>
    </div>
  );
}
