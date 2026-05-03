"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Factory,
  PauseCircle,
  PlayCircle,
  ScanLine,
  Search,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkOrdersList, type WorkOrderRow } from "@/hooks/useWorkOrders";
import { cn } from "@/lib/utils";

/**
 * V3.7.47 — Quy trình lắp ráp (sub-tab của Operations).
 *
 * UI/UX overview cho VH-A:
 *   - Hero: Quick scan barcode → jump tới /assembly/[woId]
 *   - Stats: tổng WO, đang chạy, tạm dừng, hoàn thành hôm nay
 *   - Active WO grid: cards cho mỗi WO RELEASED/IN_PROGRESS/PAUSED.
 *     Click → mở workspace lắp ráp /assembly/[woId]
 *   - Completed today: quick view các WO vừa hoàn thành
 *
 * Scan barcode workflow:
 *   - User scan WO barcode → POST /api/work-orders/lookup (tìm theo woNo)
 *     hoặc parse format → redirect tới /assembly/[woId]
 *   - Scan linh kiện barcode trong workspace → ghi nhận progress
 */

const STATUS_THEME: Record<
  string,
  { bg: string; text: string; ring: string; icon: React.ReactNode; label: string }
> = {
  RELEASED: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    ring: "ring-blue-200",
    icon: <PlayCircle className="h-3.5 w-3.5" aria-hidden />,
    label: "Sẵn sàng",
  },
  IN_PROGRESS: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    icon: <Activity className="h-3.5 w-3.5" aria-hidden />,
    label: "Đang sản xuất",
  },
  PAUSED: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
    icon: <PauseCircle className="h-3.5 w-3.5" aria-hidden />,
    label: "Tạm dừng",
  },
  QUEUED: {
    bg: "bg-zinc-50",
    text: "text-zinc-700",
    ring: "ring-zinc-200",
    icon: <Clock className="h-3.5 w-3.5" aria-hidden />,
    label: "Hàng đợi",
  },
  COMPLETED: {
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    ring: "ring-emerald-300",
    icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />,
    label: "Hoàn thành",
  },
};

export function AssemblyOverviewTab() {
  const router = useRouter();
  const [scanInput, setScanInput] = React.useState("");
  const [searchQ, setSearchQ] = React.useState("");

  // Active WOs (RELEASED, IN_PROGRESS, PAUSED, QUEUED)
  const activeQuery = useWorkOrdersList({
    status: ["RELEASED", "IN_PROGRESS", "PAUSED", "QUEUED"],
    page: 1,
    pageSize: 50,
  });
  const activeRows = activeQuery.data?.data ?? [];

  // Completed today (lookup with date filter — fallback all completed)
  const completedQuery = useWorkOrdersList({
    status: ["COMPLETED"],
    page: 1,
    pageSize: 10,
  });
  const completedRows = completedQuery.data?.data ?? [];
  const todayISO = new Date().toISOString().slice(0, 10);
  const completedToday = completedRows.filter((r) =>
    (r.completedAt ?? "").startsWith(todayISO),
  );

  // Filter active by search
  const filteredActive = React.useMemo(() => {
    if (!searchQ.trim()) return activeRows;
    const q = searchQ.trim().toLowerCase();
    return activeRows.filter(
      (r) =>
        r.woNo.toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q),
    );
  }, [activeRows, searchQ]);

  // Stats
  const stats = {
    active: activeRows.length,
    inProg: activeRows.filter((r) => r.status === "IN_PROGRESS").length,
    paused: activeRows.filter((r) => r.status === "PAUSED").length,
    completedToday: completedToday.length,
  };

  // Scan barcode handler — try direct woNo lookup
  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const code = scanInput.trim();
    if (!code) return;
    // Match by woNo (format WO-YYMM-NNNN)
    const exactWo = activeRows.find(
      (r) => r.woNo.toLowerCase() === code.toLowerCase(),
    );
    if (exactWo) {
      router.push(`/assembly/${exactWo.id}`);
      return;
    }
    // No exact woNo match → fallback search
    setSearchQ(code);
    setScanInput("");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Hero with scan */}
      <header className="border-b border-zinc-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 shadow-md shadow-orange-200">
            <Wrench className="h-5 w-5 text-white" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-zinc-900">
              Quy trình lắp ráp
            </h1>
            <p className="mt-0.5 text-xs text-zinc-600">
              Xưởng lắp ráp · Quét barcode WO để vào nhanh · Báo cáo tiến độ ·
              Hoàn thành lệnh
            </p>
          </div>

          {/* Scan input */}
          <form
            onSubmit={handleScan}
            className="flex shrink-0 items-center gap-2"
          >
            <div className="relative">
              <ScanLine
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-orange-500"
                aria-hidden
              />
              <Input
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="Quét barcode WO… (VD: WO-2605-0001)"
                className="h-9 w-72 pl-8 font-mono text-sm focus:border-orange-400 focus:ring-orange-400"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="bg-orange-600 hover:bg-orange-700"
              disabled={!scanInput.trim()}
            >
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              Vào WO
            </Button>
          </form>
        </div>

        {/* Stats strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            icon={<Factory className="h-4 w-4 text-blue-600" />}
            label="Đang hoạt động"
            value={stats.active}
            accent="blue"
          />
          <StatCard
            icon={<Activity className="h-4 w-4 text-emerald-600" />}
            label="Đang SX"
            value={stats.inProg}
            accent="emerald"
          />
          <StatCard
            icon={<PauseCircle className="h-4 w-4 text-amber-600" />}
            label="Tạm dừng"
            value={stats.paused}
            accent="amber"
          />
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-700" />}
            label="Hoàn thành hôm nay"
            value={stats.completedToday}
            accent="emerald"
          />
        </div>
      </header>

      {/* Search + WO list */}
      <div className="border-b border-zinc-100 bg-white px-6 py-3">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <Input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Tìm WO theo mã, SKU, tên sản phẩm…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {/* Active WOs section */}
        <section className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Factory className="h-4 w-4 text-orange-600" aria-hidden />
            Lệnh đang hoạt động
            <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-mono text-zinc-600">
              {filteredActive.length}
            </span>
          </h2>

          {activeQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-32 animate-pulse rounded-xl bg-zinc-100"
                />
              ))}
            </div>
          ) : filteredActive.length === 0 ? (
            <EmptyState
              icon={<Factory className="h-8 w-8 text-zinc-300" />}
              title={
                searchQ
                  ? `Không tìm thấy WO khớp "${searchQ}"`
                  : "Chưa có lệnh sản xuất nào"
              }
              description={
                searchQ
                  ? "Thử từ khoá khác hoặc xoá tìm kiếm."
                  : "Lệnh sản xuất sẽ xuất hiện sau khi Gia công duyệt yêu cầu từ Thiết kế."
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredActive.map((wo) => (
                <WoCard key={wo.id} wo={wo} />
              ))}
            </div>
          )}
        </section>

        {/* Completed today */}
        {completedToday.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
              Hoàn thành hôm nay
              <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-mono text-emerald-700">
                {completedToday.length}
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {completedToday.map((wo) => (
                <WoCard key={wo.id} wo={wo} compact />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function WoCard({ wo, compact }: { wo: WorkOrderRow; compact?: boolean }) {
  const theme = STATUS_THEME[wo.status] ?? STATUS_THEME.QUEUED!;
  const goodQty = Number(wo.goodQty ?? 0);
  const plannedQty = Number(wo.plannedQty ?? 0);
  const pct = plannedQty > 0 ? Math.round((goodQty / plannedQty) * 100) : 0;

  return (
    <Link
      href={`/assembly/${wo.id}`}
      className={cn(
        "group block overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:border-orange-300 hover:shadow-md",
        compact ? "border-emerald-100" : "border-zinc-200",
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-zinc-100 bg-gradient-to-br from-zinc-50 to-white px-4 py-2.5">
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold text-zinc-900">
            {wo.woNo}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">
            {wo.notes?.split("\n")[0]?.slice(0, 80) ?? "Lệnh sản xuất"}
          </div>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
            theme.bg,
            theme.text,
            theme.ring,
          )}
        >
          {theme.icon}
          {theme.label}
        </span>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-2 text-xs text-zinc-600">
          <span>Tiến độ</span>
          <span className="font-mono font-semibold tabular-nums text-zinc-900">
            {goodQty.toLocaleString("vi-VN")} / {plannedQty.toLocaleString("vi-VN")}
            {pct > 0 ? ` · ${pct}%` : ""}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
          <div
            className={cn(
              "h-full transition-all duration-500",
              pct >= 100
                ? "bg-emerald-500"
                : pct > 0
                  ? "bg-orange-500"
                  : "bg-zinc-300",
            )}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        {!compact && (
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-zinc-500">
            <span>
              ⌚ {wo.plannedStart ? wo.plannedStart : "—"}
              {wo.plannedEnd ? ` → ${wo.plannedEnd}` : ""}
            </span>
            <span className="inline-flex items-center gap-0.5 font-medium text-orange-600 group-hover:underline">
              Vào xưởng <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: "blue" | "emerald" | "amber";
}) {
  const ringClass = {
    blue: "ring-blue-200 bg-blue-50/50",
    emerald: "ring-emerald-200 bg-emerald-50/50",
    amber: "ring-amber-200 bg-amber-50/50",
  }[accent];
  return (
    <div
      className={cn(
        "rounded-xl border border-white/60 px-4 py-3 ring-1 ring-inset shadow-sm",
        ringClass,
      )}
    >
      <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
        {value}
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
        {icon}
      </div>
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">
          {description}
        </p>
      )}
    </div>
  );
}
