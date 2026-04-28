"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  Box as BoxIcon,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Filter,
  Layers,
  Loader2,
  Package,
  Plus,
  Search,
  TrendingUp,
  Warehouse,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WarehouseLayout3D, type BinNode } from "./WarehouseLayout3D";
import { BinActionsBar, useBinMutationRefresh } from "./BinActions";

/**
 * V3.6.4 — WarehouseLayoutTab redesign theo design tham khảo của user.
 *
 * Layout:
 *   - Top: rack tabs ("Kệ 01 18/18", "Kệ 02 12/18"...) + "+ Thêm kệ"
 *          + legend (Có hàng / Sắp hết / Trống)
 *   - 2 cột: Sidebar (Thông tin kệ + Thống kê kệ) + Main (3D rack + footer)
 *   - Main top: sub-tabs "Sơ đồ kệ" / "Danh sách hàng" + search + filter + 2D/3D
 *   - Main center: 3D rack visualization
 *   - Main bottom: footer stats card với 5 KPI + "Xem báo cáo chi tiết"
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

type SubTab = "layout" | "list";

export function WarehouseLayoutTab() {
  const refreshBins = useBinMutationRefresh();
  const [selectedBinId, setSelectedBinId] = React.useState<string | null>(null);
  const [hoveredBinId, setHoveredBinId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"3d" | "2d">("3d");
  const [subTab, setSubTab] = React.useState<SubTab>("layout");
  const [selectedRackKey, setSelectedRackKey] = React.useState<string>("");
  /** V3.7.3 — Filter bins theo fill status. */
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "occupied" | "empty" | "low"
  >("all");
  const [filterOpen, setFilterOpen] = React.useState(false);

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

  // Group by rack key
  const racksList = React.useMemo(() => {
    if (!data?.bins) return [];
    const map = new Map<string, BinNode[]>();
    for (const b of data.bins) {
      const key = `${b.area ?? ""}-${b.rack ?? ""}`;
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        area: items[0]?.area ?? "",
        rack: items[0]?.rack ?? "",
        items,
        occupied: items.filter((b) => b.totalQty > 0).length,
        total: items.length,
      }))
      .sort((a, b) => (a.area + a.rack).localeCompare(b.area + b.rack));
  }, [data?.bins]);

  // Auto-select first rack
  React.useEffect(() => {
    if (racksList.length > 0 && !racksList.find((r) => r.key === selectedRackKey)) {
      setSelectedRackKey(racksList[0]!.key);
    }
  }, [racksList, selectedRackKey]);

  const currentRack = racksList.find((r) => r.key === selectedRackKey);

  // Inject primarySku vào bins (lấy từ binDetailQuery cho bin selected, còn lại fallback null)
  // Note: Để hiển thị SKU trên mỗi bin trong 3D layout, lý tưởng là API /layout trả primarySku.
  // Tạm thời hiển thị "X SKU loại" như fallback.
  const binsWithSku: BinNode[] = data?.bins ?? [];

  // V3.7.3 — Apply status filter to currentRack.items
  const filteredItems = React.useMemo(() => {
    if (!currentRack) return [];
    if (statusFilter === "all") return currentRack.items;
    if (statusFilter === "occupied") {
      return currentRack.items.filter((b) => b.totalQty > 0);
    }
    if (statusFilter === "empty") {
      return currentRack.items.filter((b) => b.totalQty === 0);
    }
    return currentRack.items.filter((b) => b.isLow);
  }, [currentRack, statusFilter]);

  // V3.7.3 — bins prop cho 3D view: chỉ filter trong rack hiện tại,
  // giữ nguyên các rack khác để rack-switcher còn options.
  const visibleBins = React.useMemo(() => {
    if (statusFilter === "all") return binsWithSku;
    return binsWithSku.filter((b) => {
      const rackKey = `${b.area ?? ""}-${b.rack ?? ""}`;
      if (rackKey !== selectedRackKey) return true;
      if (statusFilter === "occupied") return b.totalQty > 0;
      if (statusFilter === "empty") return b.totalQty === 0;
      return b.isLow;
    });
  }, [binsWithSku, statusFilter, selectedRackKey]);

  const selectedBin = binsWithSku.find((b) => b.id === selectedBinId) ?? null;

  // Stats kệ hiện tại
  const rackStats = React.useMemo(() => {
    if (!currentRack) return { occupied: 0, low: 0, empty: 0, totalQty: 0, totalSKU: 0 };
    return {
      occupied: currentRack.items.filter((b) => b.totalQty > 0).length,
      low: currentRack.items.filter((b) => b.isLow && b.totalQty > 0).length,
      empty: currentRack.items.filter((b) => b.totalQty === 0).length,
      totalQty: currentRack.items.reduce((s, b) => s + b.totalQty, 0),
      totalSKU: currentRack.items.reduce((s, b) => s + b.skuCount, 0),
    };
  }, [currentRack]);

  const occupiedPct = currentRack ? Math.round((rackStats.occupied / currentRack.total) * 100) : 0;

  return (
    <div className="flex h-full flex-col gap-4 bg-slate-50/40 p-4">
      {/* ── TOP: Rack tabs + Legend ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ml-1 mr-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
            Chọn kệ:
          </span>
          {racksList.map((r) => {
            const isActive = r.key === selectedRackKey;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setSelectedRackKey(r.key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all",
                  isActive
                    ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/40"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                )}
              >
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold",
                  isActive ? "bg-white/20 text-white" : "bg-white text-zinc-600",
                )}>
                  <Boxes className="h-3 w-3" />
                </span>
                <span className="font-mono">Kệ {r.rack}</span>
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] tabular-nums font-bold",
                  isActive ? "bg-white/25 text-white" : "bg-white text-zinc-500",
                )}>{r.occupied}/{r.total}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-300 px-3.5 py-1.5 text-sm font-semibold text-zinc-500 hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-600 transition-all"
            disabled
            title="Chưa hỗ trợ thêm kệ"
          >
            <Plus className="h-3.5 w-3.5" /> Thêm kệ
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2">
            <LegendDot color="#6366f1" label="Có hàng" />
            <LegendDot color="#f59e0b" label="Sắp hết" pulse />
            <LegendDot color="#e2e8f0" label="Trống" stroke="#cbd5e1" />
          </div>
        </div>
      </div>

      {/* ── BODY: 2 columns ── */}
      <div className="grid flex-1 gap-4 lg:grid-cols-[300px_1fr] min-h-0 overflow-hidden">
        {/* SIDEBAR */}
        <div className="flex flex-col gap-4 overflow-y-auto">
          {/* Card: Thông tin kệ */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-3">
              Thông tin kệ
            </h3>
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl font-bold text-zinc-900">
                Kệ {currentRack?.rack ?? "—"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Hoạt động
              </span>
            </div>
            <dl className="space-y-2.5 text-sm">
              <Row label="Mã kệ" value={currentRack ? `${currentRack.area}-${currentRack.rack}` : "—"} mono />
              <Row label="Vị trí" value={currentRack ? `Khu ${currentRack.area}` : "—"} />
              <Row label="Kích thước" value="6000 × 1200 × 2000 mm" />
              <Row label="Tải trọng tối đa" value="1500 kg / tầng" />
              <Row label="Số tầng" value="3" />
              <Row label="Số ô / tầng" value="6" />
              <Row label="Tổng ô" value={String(currentRack?.total ?? 0)} bold />
              <div className="pt-2">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-zinc-500">Đã sử dụng</span>
                  <span className="font-bold text-zinc-900">
                    {rackStats.occupied} ({occupiedPct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                    style={{ width: `${occupiedPct}%` }}
                  />
                </div>
              </div>
            </dl>
          </section>

          {/* Card: Thống kê kệ */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-3">
              Thống kê kệ
            </h3>
            <div className="space-y-2.5">
              <StatRow
                color="#6366f1"
                label="Có hàng"
                count={rackStats.occupied}
                total={currentRack?.total ?? 0}
              />
              <StatRow
                color="#f59e0b"
                label="Sắp hết"
                count={rackStats.low}
                total={currentRack?.total ?? 0}
              />
              <StatRow
                color="#cbd5e1"
                label="Trống"
                count={rackStats.empty}
                total={currentRack?.total ?? 0}
              />
              <div className="pt-2 mt-2 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-sm text-zinc-600">Tổng SKU</span>
                <span className="font-bold text-zinc-900 text-base">{rackStats.totalSKU}</span>
              </div>
            </div>
          </section>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Sub-tabs + search + toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-2 shadow-sm">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSubTab("layout")}
                className={cn(
                  "relative px-3 py-2.5 text-sm font-bold transition-colors",
                  "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-t-full after:transition-all",
                  subTab === "layout"
                    ? "text-indigo-700 after:bg-indigo-600"
                    : "text-zinc-500 hover:text-zinc-800 after:bg-transparent",
                )}
              >
                SƠ ĐỒ KỆ
              </button>
              <button
                type="button"
                onClick={() => setSubTab("list")}
                className={cn(
                  "relative px-3 py-2.5 text-sm font-bold transition-colors",
                  "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-t-full after:transition-all",
                  subTab === "list"
                    ? "text-indigo-700 after:bg-indigo-600"
                    : "text-zinc-500 hover:text-zinc-800 after:bg-transparent",
                )}
              >
                DANH SÁCH HÀNG
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm ô, mã hàng, tên hàng..."
                  className="h-9 w-72 rounded-lg border border-zinc-200 bg-zinc-50/50 pl-9 pr-9 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {search && (
                  <button onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFilterOpen((o) => !o)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50",
                    statusFilter !== "all" &&
                      "border-indigo-500 bg-indigo-50 text-indigo-700",
                  )}
                >
                  <Filter className="h-4 w-4" />
                  {statusFilter === "all"
                    ? "Lọc"
                    : statusFilter === "occupied"
                      ? "Có hàng"
                      : statusFilter === "empty"
                        ? "Trống"
                        : "Sắp hết"}
                </button>
                {filterOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg z-20">
                    {(
                      [
                        { value: "all", label: "Tất cả" },
                        { value: "occupied", label: "Có hàng" },
                        { value: "empty", label: "Trống" },
                        { value: "low", label: "Sắp hết / cảnh báo" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setStatusFilter(opt.value);
                          setFilterOpen(false);
                        }}
                        className={cn(
                          "block w-full px-3 py-1.5 text-left text-xs",
                          statusFilter === opt.value
                            ? "bg-indigo-50 font-semibold text-indigo-700"
                            : "text-zinc-600 hover:bg-zinc-50",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("2d")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-all",
                    viewMode === "2d" ? "bg-white text-indigo-700 shadow-sm" : "text-zinc-600",
                  )}
                >
                  <Layers className="h-3 w-3" /> 2D
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("3d")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-all",
                    viewMode === "3d" ? "bg-white text-indigo-700 shadow-sm" : "text-zinc-600",
                  )}
                >
                  <BoxIcon className="h-3 w-3" /> 3D
                </button>
              </div>
            </div>
          </div>

          {/* Lookup result strip */}
          {debouncedSearch && lookupQuery.data && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-2.5">
              {lookupQuery.data.data.matchedItems.length === 0 ? (
                <p className="text-sm text-zinc-600">Không tìm thấy "{debouncedSearch}"</p>
              ) : (
                <div className="flex items-start gap-3">
                  <Search className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900">
                      Tìm thấy{" "}
                      <span className="text-indigo-700">{lookupQuery.data.data.matchedItems.length}</span> SKU ·{" "}
                      <span className="text-indigo-700">{lookupQuery.data.data.locations.length}</span> vị trí
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {lookupQuery.data.data.locations.slice(0, 12).map((loc) => (
                        <button
                          key={`${loc.binId}-${loc.lotSerialId}`}
                          onClick={() => setSelectedBinId(loc.binId)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white border border-indigo-200 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                        >
                          <span className="font-mono">{loc.binFullCode}</span>
                          <span className="text-indigo-400">·</span>
                          <span>{loc.qty.toLocaleString("vi-VN")}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Main view (3D rack or list) */}
          <div className="relative flex-1 min-h-0 rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            {layoutQuery.isLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải sơ đồ kho...
              </div>
            ) : binsWithSku.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <Warehouse className="h-12 w-12 text-zinc-300" />
                <p className="text-base font-semibold text-zinc-700">Chưa có bins nào</p>
                <p className="text-sm text-zinc-500">Migration 0034 cần được apply.</p>
              </div>
            ) : subTab === "layout" ? (
              <WarehouseLayout3D
                bins={visibleBins}
                selectedBinId={selectedBinId}
                hoveredBinId={hoveredBinId}
                onBinClick={(b) => setSelectedBinId(b.id)}
                onBinHover={setHoveredBinId}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                selectedRack={selectedRackKey}
                onRackChange={setSelectedRackKey}
              />
            ) : (
              <BinListView bins={filteredItems} onSelect={setSelectedBinId} />
            )}
          </div>

          {/* Footer stats card */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              <FooterStat label="Tổng ô" value={String(currentRack?.total ?? 0)} icon={BoxIcon} />
              <Divider />
              <FooterStat
                label="Đã sử dụng"
                value={String(rackStats.occupied)}
                icon={CheckCircle2}
                badge={`${occupiedPct}%`}
                badgeTone="emerald"
              />
              <Divider />
              <FooterStat
                label="Tổng số lượng"
                value={rackStats.totalQty.toLocaleString("vi-VN")}
                icon={Package}
              />
              <Divider />
              <FooterStat
                label="Sắp hết"
                value={`${rackStats.low} ô`}
                icon={AlertTriangle}
                tone="amber"
              />
              <Divider />
              <FooterStat
                label="Trống"
                value={`${rackStats.empty} ô`}
                icon={BoxIcon}
                tone="zinc"
              />
              <div className="ml-auto">
                <Button
                  size="sm"
                  asChild
                  className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-md"
                >
                  <a href="/warehouse?tab=report">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Xem báo cáo chi tiết
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bin detail drawer */}
      {selectedBin && (
        <div className="fixed inset-y-0 right-0 z-30 w-[400px] shadow-2xl ring-1 ring-zinc-200 bg-white overflow-y-auto">
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
              </div>
            )}

            {/* V3.7.4 — Bin actions: + thêm / - rút / chuyển */}
            <BinActionsBar
              bin={{
                id: selectedBin.id,
                fullCode: selectedBin.fullCode,
                isActive: selectedBin.isActive,
                capacity: selectedBin.capacity,
                totalQty: selectedBin.totalQty,
              }}
              contents={(binDetailQuery.data?.data.content ?? []).map((c) => ({
                lotSerialId: c.lotSerialId,
                lotCode: c.lotCode,
                itemId: c.itemId,
                itemSku: c.itemSku,
                itemName: c.itemName,
                itemUom: c.itemUom,
                qty: c.qty,
                status: c.status,
              }))}
              allBins={binsWithSku.map((b) => ({
                id: b.id,
                fullCode: b.fullCode,
                isActive: b.isActive,
                capacity: b.capacity,
                totalQty: b.totalQty,
              }))}
              onMutated={refreshBins}
            />

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
                    <li key={c.lotSerialId} className="rounded-xl border border-zinc-200 bg-white p-3">
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
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className={cn(
        "text-sm",
        mono && "font-mono",
        bold ? "font-bold text-zinc-900" : "text-zinc-700",
      )}>
        {value}
      </dd>
    </div>
  );
}

function StatRow({ color, label, count, total }: { color: string; label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm text-zinc-700 truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-base font-bold tabular-nums text-zinc-900">{count}</span>
        <span className="text-xs text-zinc-400 tabular-nums w-10 text-right">{pct}%</span>
      </div>
    </div>
  );
}

function FooterStat({
  label, value, icon: Icon, tone = "indigo", badge, badgeTone,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: "indigo" | "amber" | "zinc";
  badge?: string;
  badgeTone?: "emerald" | "amber";
}) {
  const map = {
    indigo: { bg: "bg-indigo-50", iconColor: "text-indigo-600", valueColor: "text-zinc-900" },
    amber:  { bg: "bg-amber-50",  iconColor: "text-amber-600",  valueColor: "text-amber-700" },
    zinc:   { bg: "bg-zinc-100",  iconColor: "text-zinc-500",   valueColor: "text-zinc-700" },
  };
  const cls = map[tone];
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", cls.bg)}>
        <Icon className={cn("h-4 w-4", cls.iconColor)} />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
        <div className="flex items-center gap-1.5">
          <span className={cn("text-lg font-bold tabular-nums leading-none", cls.valueColor)}>{value}</span>
          {badge && (
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
              badgeTone === "emerald" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
            )}>
              {badge}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-10 w-px bg-zinc-200" />;
}

function LegendDot({ color, label, pulse, stroke }: {
  color: string; label: string; pulse?: boolean; stroke?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn("inline-block h-2.5 w-2.5 rounded-full", pulse && "animate-pulse")}
        style={{ backgroundColor: color, border: stroke ? `1px solid ${stroke}` : undefined }}
      />
      <span className="text-xs font-semibold text-zinc-700">{label}</span>
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

/* ─── Bin list view (Danh sách hàng tab) ─────────────────────────────────── */

function BinListView({ bins, onSelect }: { bins: BinNode[]; onSelect: (id: string) => void }) {
  return (
    <div className="h-full overflow-auto p-4">
      <table className="w-full">
        <thead className="sticky top-0 bg-white z-10">
          <tr className="border-b-2 border-zinc-100 text-xs font-bold uppercase tracking-wider text-zinc-500">
            <th className="px-3 py-2.5 text-left">Mã ô</th>
            <th className="px-3 py-2.5 text-left">Tầng</th>
            <th className="px-3 py-2.5 text-right">Tồn</th>
            <th className="px-3 py-2.5 text-right">Sức chứa</th>
            <th className="px-3 py-2.5 text-right">% đầy</th>
            <th className="px-3 py-2.5 text-left">SKU</th>
            <th className="px-3 py-2.5 text-left">Lot</th>
            <th className="px-3 py-2.5 text-left">Trạng thái</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {bins.map((b) => {
            const cap = Number(b.capacity ?? "0");
            const pct = cap > 0 ? Math.round((b.totalQty / cap) * 100) : 0;
            return (
              <tr key={b.id} className="border-b border-zinc-50 hover:bg-zinc-50/50 cursor-pointer" onClick={() => onSelect(b.id)}>
                <td className="px-3 py-2.5 font-mono text-sm font-bold text-indigo-600">{b.fullCode}</td>
                <td className="px-3 py-2.5 text-sm text-zinc-700">Tầng {b.levelNo}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm font-bold">{b.totalQty.toLocaleString("vi-VN")}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm text-zinc-600">{cap > 0 ? cap.toLocaleString("vi-VN") : "—"}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-zinc-100 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-zinc-600 w-9 text-right">{pct}%</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-sm text-zinc-700">{b.skuCount}</td>
                <td className="px-3 py-2.5 text-sm text-zinc-700">{b.lotCount}</td>
                <td className="px-3 py-2.5">
                  {b.totalQty === 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">Trống</span>
                  ) : b.isLow ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">Sắp hết</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">Có hàng</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
