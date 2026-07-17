"use client";

import * as React from "react";
import { Box, Layers, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V3.6.5 — Premium warehouse rack design.
 *
 * Cải tiến lớn so với V3.6.4:
 * - 6 themes theo fill level: FULL/HIGH/MID/LOW/WARNING/EMPTY (+inactive)
 * - Pallet pyramid stacking 3 rows giảm dần với 3 tone cardboard
 * - Wood pallet 3 slats realistic
 * - Glass reflection vertical stripe trên front
 * - LED status indicator (corner) với pulse glow
 * - Soft drop shadow ellipse beneath bin
 * - Better typography + status pill header
 */

export interface BinNode {
  id: string;
  fullCode: string;
  area: string | null;
  rack: string | null;
  levelNo: number | null;
  position: string | null;
  capacity: string | null;
  lowThreshold: string | null;
  coordX: string | null;
  coordY: string | null;
  coordZ: string | null;
  isActive: boolean;
  description: string | null;
  totalQty: number;
  skuCount: number;
  lotCount: number;
  isLow: boolean;
  primarySku?: string | null;
  /** V3.7.16 — SKU đã slot vào bin (default_bin_id), hiện kể cả khi chưa có tồn. */
  slottedSkus?: string[];
  slotCount?: number;
}

export interface WarehouseLayout3DProps {
  bins: BinNode[];
  selectedBinId: string | null;
  hoveredBinId: string | null;
  onBinClick: (bin: BinNode) => void;
  onBinHover: (binId: string | null) => void;
  className?: string;
  viewMode?: "3d" | "2d";
  onViewModeChange?: (mode: "3d" | "2d") => void;
  selectedRack?: string;
  onRackChange?: (key: string) => void;
}

type ViewMode = "3d" | "2d";

/** V3.7.3 — bigger bins + fonts theo feedback user. */
const BIN_W = 230;
const BIN_H = 160;
const PALLET_H = 10;
const PALLET_BASE_H = 20;
const BIN_DEPTH = 44;
const GAP_X = 36;
const SHELF_THICKNESS = 12;
const POST_W = 14;
const TIER_LABEL_W = 100;
const RACK_PAD = 36;
/** V3.7.3 — base extends wider beyond rack content. */
const BASE_OVERHANG = 36;

/** 6 fill-level themes + 2 special states. */
type ThemeKey = "full" | "high" | "mid" | "low" | "warning" | "slotted" | "empty" | "inactive";

interface BinTheme {
  /** 4-stop gradient cho front face */
  frontStops: [string, string, string, string];
  /** Top face — sáng nhất (light source above-front) */
  topStops: [string, string];
  /** Side face — tối, có depth */
  sideStops: [string, string];
  stroke: string;
  shadow: string;
  textPrimary: string;
  textSecondary: string;
  progressFill: string;
  progressTrack: string;
  /** Glass reflection stripe color (rgba) */
  glassRef: string;
  /** LED indicator (top-right corner) */
  led: string;
  ledGlow: string;
  /** Status label text */
  statusLabel: string;
  /** Cardboard tone group cho pallet boxes */
  palletTone: "indigo" | "blue" | "teal" | "amber" | "gray" | "empty";
}

const THEMES: Record<ThemeKey, BinTheme> = {
  // FULL: >85% capacity — đậm indigo→violet
  full: {
    frontStops: ["#8b5cf6", "#6d5df6", "#5b21b6", "#4c1d95"],
    topStops: ["#a78bfa", "#8b5cf6"],
    sideStops: ["#5b21b6", "#3b0764"],
    stroke: "#4c1d95",
    shadow: "rgba(91, 33, 182, 0.45)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(243, 232, 255, 0.9)",
    progressFill: "#fcd34d",
    progressTrack: "rgba(255, 255, 255, 0.25)",
    glassRef: "rgba(255, 255, 255, 0.35)",
    led: "#fbbf24",
    ledGlow: "rgba(251, 191, 36, 0.6)",
    statusLabel: "Đầy",
    palletTone: "indigo",
  },
  // HIGH: 60-85% — indigo
  high: {
    frontStops: ["#818cf8", "#6366f1", "#4f46e5", "#4338ca"],
    topStops: ["#a5b4fc", "#818cf8"],
    sideStops: ["#3730a3", "#312e81"],
    stroke: "#3730a3",
    shadow: "rgba(67, 56, 202, 0.4)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(224, 231, 255, 0.9)",
    progressFill: "#34d399",
    progressTrack: "rgba(255, 255, 255, 0.25)",
    glassRef: "rgba(255, 255, 255, 0.32)",
    led: "#10b981",
    ledGlow: "rgba(16, 185, 129, 0.6)",
    statusLabel: "Có hàng",
    palletTone: "indigo",
  },
  // MID: 30-60% — blue
  mid: {
    frontStops: ["#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8"],
    topStops: ["#93c5fd", "#60a5fa"],
    sideStops: ["#1e40af", "#1e3a8a"],
    stroke: "#1e40af",
    shadow: "rgba(30, 64, 175, 0.4)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(219, 234, 254, 0.9)",
    progressFill: "#34d399",
    progressTrack: "rgba(255, 255, 255, 0.25)",
    glassRef: "rgba(255, 255, 255, 0.3)",
    led: "#10b981",
    ledGlow: "rgba(16, 185, 129, 0.6)",
    statusLabel: "Có hàng",
    palletTone: "blue",
  },
  // LOW: <30% but >lowThreshold — teal (light)
  low: {
    frontStops: ["#5eead4", "#2dd4bf", "#14b8a6", "#0d9488"],
    topStops: ["#99f6e4", "#5eead4"],
    sideStops: ["#0f766e", "#115e59"],
    stroke: "#0f766e",
    shadow: "rgba(15, 118, 110, 0.4)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(204, 251, 241, 0.95)",
    progressFill: "#fbbf24",
    progressTrack: "rgba(255, 255, 255, 0.3)",
    glassRef: "rgba(255, 255, 255, 0.32)",
    led: "#fbbf24",
    ledGlow: "rgba(251, 191, 36, 0.6)",
    statusLabel: "Còn ít",
    palletTone: "teal",
  },
  // WARNING: dưới lowThreshold — amber pulse
  warning: {
    frontStops: ["#fbbf24", "#f59e0b", "#d97706", "#b45309"],
    topStops: ["#fde68a", "#fbbf24"],
    sideStops: ["#92400e", "#78350f"],
    stroke: "#92400e",
    shadow: "rgba(180, 83, 9, 0.45)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(254, 243, 199, 0.95)",
    progressFill: "#ffffff",
    progressTrack: "rgba(255, 255, 255, 0.3)",
    glassRef: "rgba(255, 255, 255, 0.4)",
    led: "#ef4444",
    ledGlow: "rgba(239, 68, 68, 0.7)",
    statusLabel: "Sắp hết",
    palletTone: "amber",
  },
  // EMPTY: trống
  empty: {
    frontStops: ["#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1"],
    topStops: ["#ffffff", "#e2e8f0"],
    sideStops: ["#94a3b8", "#64748b"],
    stroke: "#cbd5e1",
    shadow: "rgba(100, 116, 139, 0.18)",
    textPrimary: "#64748b",
    textSecondary: "#94a3b8",
    progressFill: "#cbd5e1",
    progressTrack: "rgba(203, 213, 225, 0.5)",
    glassRef: "rgba(255, 255, 255, 0.6)",
    led: "#cbd5e1",
    ledGlow: "rgba(203, 213, 225, 0.3)",
    statusLabel: "Trống",
    palletTone: "empty",
  },
  // V3.7.16 — SLOTTED: bin đã được gán SKU nhưng chưa nhập hàng (sky blue)
  slotted: {
    frontStops: ["#bae6fd", "#7dd3fc", "#38bdf8", "#0284c7"],
    topStops: ["#e0f2fe", "#bae6fd"],
    sideStops: ["#0369a1", "#0c4a6e"],
    stroke: "#0369a1",
    shadow: "rgba(14, 165, 233, 0.35)",
    textPrimary: "#0c4a6e",
    textSecondary: "rgba(12, 74, 110, 0.85)",
    progressFill: "#38bdf8",
    progressTrack: "rgba(14, 165, 233, 0.2)",
    glassRef: "rgba(255, 255, 255, 0.5)",
    led: "#0ea5e9",
    ledGlow: "rgba(14, 165, 233, 0.5)",
    statusLabel: "Đã gán",
    palletTone: "blue",
  },
  // INACTIVE
  inactive: {
    frontStops: ["#a1a1aa", "#71717a", "#52525b", "#3f3f46"],
    topStops: ["#d4d4d8", "#a1a1aa"],
    sideStops: ["#52525b", "#27272a"],
    stroke: "#3f3f46",
    shadow: "rgba(63, 63, 70, 0.35)",
    textPrimary: "#fafafa",
    textSecondary: "#e4e4e7",
    progressFill: "#fafafa",
    progressTrack: "rgba(255, 255, 255, 0.2)",
    glassRef: "rgba(255, 255, 255, 0.18)",
    led: "#71717a",
    ledGlow: "rgba(113, 113, 122, 0.4)",
    statusLabel: "Khoá",
    palletTone: "gray",
  },
};

function getBinTheme(bin: BinNode): { key: ThemeKey; theme: BinTheme; pct: number } {
  const cap = Number(bin.capacity ?? "0");
  const pct = cap > 0 ? Math.min(100, Math.max(0, (bin.totalQty / cap) * 100)) : 0;
  let key: ThemeKey;
  if (!bin.isActive) key = "inactive";
  else if (bin.totalQty <= 0) {
    // V3.7.16 — Bin chưa có tồn nhưng đã gán SKU → theme "slotted" (sky-blue) thay "empty" gray
    key = (bin.slotCount ?? 0) > 0 ? "slotted" : "empty";
  }
  else if (bin.isLow) key = "warning";
  else if (pct > 85) key = "full";
  else if (pct > 60) key = "high";
  else if (pct > 30) key = "mid";
  else key = "low";
  return { key, theme: THEMES[key], pct };
}

export function WarehouseLayout3D({
  bins,
  selectedBinId,
  hoveredBinId,
  onBinClick,
  onBinHover,
  className,
  viewMode: extViewMode,
  onViewModeChange,
  selectedRack: extSelectedRack,
  onRackChange,
}: WarehouseLayout3DProps) {
  const [internalViewMode, setInternalViewMode] = React.useState<ViewMode>("3d");
  const viewMode = extViewMode ?? internalViewMode;
  const setViewMode = (m: ViewMode) => {
    if (onViewModeChange) onViewModeChange(m);
    else setInternalViewMode(m);
  };

  const racks = React.useMemo(() => {
    const map = new Map<string, BinNode[]>();
    for (const b of bins) {
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
        items: items.slice().sort((a, b) => {
          const al = a.levelNo ?? 0;
          const bl = b.levelNo ?? 0;
          if (al !== bl) return bl - al;
          return (a.position ?? "").localeCompare(b.position ?? "");
        }),
      }))
      .sort((a, b) => (a.area + a.rack).localeCompare(b.area + b.rack));
  }, [bins]);

  const [internalRack, setInternalRack] = React.useState<string>(racks[0]?.key ?? "");
  const selectedRack = extSelectedRack ?? internalRack;
  React.useEffect(() => {
    if (racks.length > 0 && !racks.find((r) => r.key === selectedRack)) {
      const first = racks[0]!.key;
      if (onRackChange) onRackChange(first);
      else setInternalRack(first);
    }
  }, [racks, selectedRack, onRackChange]);

  const setSelectedRack = (k: string) => {
    if (onRackChange) onRackChange(k);
    else setInternalRack(k);
  };

  const currentRack = racks.find((r) => r.key === selectedRack);
  const positionsPerLevel = 6;
  const levels = 3;

  return (
    <div className={cn("flex h-full w-full flex-col gap-3", className)}>
      {!extSelectedRack && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ml-2 mr-1 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Chọn kệ</span>
            {racks.map((r) => {
              const isActive = r.key === selectedRack;
              const occupied = r.items.filter((b) => b.totalQty > 0).length;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setSelectedRack(r.key)}
                  className={cn(
                    "group inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all",
                    isActive
                      ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/40 scale-[1.02]"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
                  )}
                >
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold",
                    isActive ? "bg-white/20 text-white" : "bg-white text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
                  )}>{r.area}</span>
                  <span className="font-mono">Kệ {r.rack}</span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    isActive ? "bg-white/25 text-white" : "bg-white text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400",
                  )}>{occupied}/{r.items.length}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
            <button type="button" onClick={() => setViewMode("3d")}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all",
                viewMode === "3d" ? "bg-white text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-400" : "text-zinc-600 dark:text-zinc-400",
              )}>
              <Box className="h-3.5 w-3.5" /> 3D
            </button>
            <button type="button" onClick={() => setViewMode("2d")}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all",
                viewMode === "2d" ? "bg-white text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-400" : "text-zinc-600 dark:text-zinc-400",
              )}>
              <Layers className="h-3.5 w-3.5" /> 2D
            </button>
          </div>
        </div>
      )}

      <div className="relative flex-1 overflow-auto rounded-2xl bg-gradient-to-br from-slate-50 via-white to-slate-100 shadow-inner ring-1 ring-zinc-200/60 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900 dark:ring-zinc-700/60">
        {!currentRack ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
            Chọn 1 kệ để xem chi tiết
          </div>
        ) : viewMode === "3d" ? (
          <Rack3DView
            rack={currentRack}
            levels={levels}
            positionsPerLevel={positionsPerLevel}
            selectedBinId={selectedBinId}
            hoveredBinId={hoveredBinId}
            onBinClick={onBinClick}
            onBinHover={onBinHover}
          />
        ) : (
          <Rack2DView
            rack={currentRack}
            levels={levels}
            positionsPerLevel={positionsPerLevel}
            selectedBinId={selectedBinId}
            hoveredBinId={hoveredBinId}
            onBinClick={onBinClick}
            onBinHover={onBinHover}
          />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 3D RACK VIEW — pallet pyramid + glass reflection + LED                   */
/* ─────────────────────────────────────────────────────────────────────── */

function Rack3DView({
  rack,
  levels,
  positionsPerLevel,
  selectedBinId,
  hoveredBinId,
  onBinClick,
  onBinHover,
}: {
  rack: { key: string; area: string; rack: string; items: BinNode[] };
  levels: number;
  positionsPerLevel: number;
  selectedBinId: string | null;
  hoveredBinId: string | null;
  onBinClick: (bin: BinNode) => void;
  onBinHover: (id: string | null) => void;
}) {
  const tierData = [
    { lvl: 3, label: "Tầng 3", height: "Cao 2.0m" },
    { lvl: 2, label: "Tầng 2", height: "Cao 2.0m" },
    { lvl: 1, label: "Tầng 1", height: "Cao 2.0m" },
  ];

  const cellW = BIN_W + GAP_X;
  const tierH = PALLET_H + BIN_H + PALLET_BASE_H + SHELF_THICKNESS;
  const rackContentWidth = positionsPerLevel * BIN_W + (positionsPerLevel - 1) * GAP_X;

  const baseHeight = 44;
  const positionTagH = 26;
  const groundLabelH = 32;
  const totalRackHeight = levels * tierH + SHELF_THICKNESS;
  const svgWidth = TIER_LABEL_W + RACK_PAD * 2 + rackContentWidth + POST_W * 2 + BIN_DEPTH;
  const svgHeight = RACK_PAD + totalRackHeight + baseHeight + positionTagH + groundLabelH + RACK_PAD;
  const rackLeftX = TIER_LABEL_W + RACK_PAD + POST_W;

  return (
    <div className="flex h-full items-center justify-center overflow-auto p-4">
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ display: "block" }}>
        <defs>
          {/* Bin gradients per theme */}
          {(Object.keys(THEMES) as ThemeKey[]).map((tone) => {
            const t = THEMES[tone];
            return (
              <React.Fragment key={tone}>
                <linearGradient id={`bin-front-${tone}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={t.frontStops[0]} />
                  <stop offset="35%" stopColor={t.frontStops[1]} />
                  <stop offset="70%" stopColor={t.frontStops[2]} />
                  <stop offset="100%" stopColor={t.frontStops[3]} />
                </linearGradient>
                <linearGradient id={`bin-top-${tone}`} x1="20%" y1="0%" x2="80%" y2="100%">
                  <stop offset="0%" stopColor={t.topStops[0]} />
                  <stop offset="100%" stopColor={t.topStops[1]} />
                </linearGradient>
                <linearGradient id={`bin-side-${tone}`} x1="0%" y1="50%" x2="100%" y2="50%">
                  <stop offset="0%" stopColor={t.sideStops[0]} />
                  <stop offset="100%" stopColor={t.sideStops[1]} />
                </linearGradient>
              </React.Fragment>
            );
          })}

          {/* Cardboard tones */}
          {[
            { id: "card-light", from: "#f0d9a8", mid: "#d4af7a", to: "#a8845a" },
            { id: "card-medium", from: "#dda874", mid: "#b8895c", to: "#8b6240" },
            { id: "card-dark", from: "#c4956a", mid: "#9a7048", to: "#705030" },
          ].map((c) => (
            <linearGradient key={c.id} id={c.id} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={c.from} />
              <stop offset="50%" stopColor={c.mid} />
              <stop offset="100%" stopColor={c.to} />
            </linearGradient>
          ))}
          <linearGradient id="card-top-light" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f5e1b8" />
            <stop offset="100%" stopColor="#d4af7a" />
          </linearGradient>

          {/* Wood pallet */}
          <linearGradient id="wood-pallet" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a8896b" />
            <stop offset="50%" stopColor="#7c5e44" />
            <stop offset="100%" stopColor="#52401d" />
          </linearGradient>
          {/* Wood pallet side (darker depth) */}
          <linearGradient id="wood-pallet-side" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5c4220" />
            <stop offset="100%" stopColor="#2e1a08" />
          </linearGradient>

          {/* Empty pallet */}
          <linearGradient id="empty-pallet" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>

          {/* Metallic post */}
          <linearGradient id="metal-post" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3f3f46" />
            <stop offset="35%" stopColor="#a1a1aa" />
            <stop offset="65%" stopColor="#a1a1aa" />
            <stop offset="100%" stopColor="#3f3f46" />
          </linearGradient>
          <linearGradient id="metal-shelf" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#d4d4d8" />
            <stop offset="50%" stopColor="#a1a1aa" />
            <stop offset="100%" stopColor="#52525b" />
          </linearGradient>
          <linearGradient id="metal-base" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#71717a" />
            <stop offset="50%" stopColor="#52525b" />
            <stop offset="100%" stopColor="#27272a" />
          </linearGradient>
          {/* 3D base platform — top face (concrete/metal floor) */}
          <linearGradient id="base-top" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f1f5f9" />
            <stop offset="50%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
          {/* 3D base platform — right side face (deep shadow) */}
          <linearGradient id="base-side" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3f3f46" />
            <stop offset="100%" stopColor="#18181b" />
          </linearGradient>

          {/* Drop shadow filter */}
          <filter id="bin-drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="5" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.4" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* LED glow */}
          <radialGradient id="led-glow-green" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(16, 185, 129, 0.7)" />
            <stop offset="100%" stopColor="rgba(16, 185, 129, 0)" />
          </radialGradient>
          <radialGradient id="led-glow-amber" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(251, 191, 36, 0.7)" />
            <stop offset="100%" stopColor="rgba(251, 191, 36, 0)" />
          </radialGradient>
          <radialGradient id="led-glow-red" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(239, 68, 68, 0.8)" />
            <stop offset="100%" stopColor="rgba(239, 68, 68, 0)" />
          </radialGradient>
        </defs>

        {/* Tier labels */}
        {tierData.map((tier, idx) => {
          const y = RACK_PAD + idx * tierH + PALLET_H + BIN_H / 2;
          return (
            <g key={tier.lvl}>
              <text x={TIER_LABEL_W / 2 + 6} y={y - 8} textAnchor="middle" fontSize="16" fontWeight="700" fill="#1e293b">{tier.label}</text>
              <text x={TIER_LABEL_W / 2 + 6} y={y + 14} textAnchor="middle" fontSize="12" fontWeight="500" fill="#94a3b8">{tier.height}</text>
            </g>
          );
        })}

        {/* Base platform — 3D isometric (drawn BEFORE posts/bins so they appear on top of floor) */}
        {(() => {
          const baseLeftX = rackLeftX - POST_W - BASE_OVERHANG;
          const baseRightX = rackLeftX + rackContentWidth + POST_W + BASE_OVERHANG;
          const baseTopY = RACK_PAD + totalRackHeight;
          const baseBotY = baseTopY + baseHeight;
          const dxBase = 22;
          const dyBase = -16;
          const baseW = baseRightX - baseLeftX;
          return (
            <g>
              {/* Right side face (depth) */}
              <polygon
                points={`${baseRightX},${baseTopY} ${baseRightX + dxBase},${baseTopY + dyBase} ${baseRightX + dxBase},${baseBotY + dyBase} ${baseRightX},${baseBotY}`}
                fill="url(#base-side)"
              />
              {/* Right side bevel highlight (top edge) */}
              <line
                x1={baseRightX}
                y1={baseTopY}
                x2={baseRightX + dxBase}
                y2={baseTopY + dyBase}
                stroke="#71717a"
                strokeWidth="1"
              />
              {/* Front face (steel band) */}
              <rect
                x={baseLeftX}
                y={baseTopY}
                width={baseW}
                height={baseHeight}
                fill="url(#metal-base)"
              />
              {/* Front face — top bevel highlight */}
              <rect
                x={baseLeftX}
                y={baseTopY}
                width={baseW}
                height={2.5}
                fill="#a1a1aa"
              />
              {/* Front face — bottom shadow line */}
              <rect
                x={baseLeftX}
                y={baseBotY - 1.5}
                width={baseW}
                height={1.5}
                fill="#09090b"
              />
              {/* Vertical rivet/seam decorations on front face */}
              {Array.from({ length: positionsPerLevel + 1 }).map((_, idx) => {
                const rx = baseLeftX + 16 + idx * ((baseW - 32) / positionsPerLevel);
                return (
                  <g key={`rivet-${idx}`}>
                    <circle cx={rx} cy={baseTopY + 7} r="1.5" fill="#27272a" />
                    <circle cx={rx} cy={baseTopY + 7} r="0.7" fill="#71717a" />
                    <circle cx={rx} cy={baseBotY - 7} r="1.5" fill="#27272a" />
                    <circle cx={rx} cy={baseBotY - 7} r="0.7" fill="#71717a" />
                  </g>
                );
              })}
              {/* Top face (parallelogram floor — concrete) */}
              <polygon
                points={`${baseLeftX},${baseTopY} ${baseRightX},${baseTopY} ${baseRightX + dxBase},${baseTopY + dyBase} ${baseLeftX + dxBase},${baseTopY + dyBase}`}
                fill="url(#base-top)"
                stroke="#94a3b8"
                strokeWidth="0.6"
                strokeOpacity="0.6"
              />
              {/* Top face front bevel highlight (catches light) */}
              <line
                x1={baseLeftX}
                y1={baseTopY}
                x2={baseRightX}
                y2={baseTopY}
                stroke="#f8fafc"
                strokeWidth="1"
                opacity="0.7"
              />
              {/* Floor seams under each position — isometric diagonal lines */}
              {Array.from({ length: positionsPerLevel - 1 }).map((_, idx) => {
                const seamX = rackLeftX + (idx + 1) * cellW - GAP_X / 2;
                return (
                  <line
                    key={`seam-${idx}`}
                    x1={seamX}
                    y1={baseTopY}
                    x2={seamX + dxBase}
                    y2={baseTopY + dyBase}
                    stroke="#64748b"
                    strokeWidth="0.7"
                    strokeDasharray="3,3"
                    opacity="0.5"
                  />
                );
              })}
              {/* Side face — vertical seam */}
              <line
                x1={baseRightX + dxBase * 0.5}
                y1={baseTopY + dyBase * 0.5}
                x2={baseRightX + dxBase * 0.5}
                y2={baseBotY + dyBase * 0.5}
                stroke="#27272a"
                strokeWidth="0.5"
                opacity="0.5"
              />
              {/* Ground shadow (under entire base) */}
              <ellipse
                cx={baseLeftX + baseW / 2 + dxBase / 2}
                cy={baseBotY + 6}
                rx={baseW / 2 + 18}
                ry={5}
                fill="rgba(0, 0, 0, 0.22)"
                filter="blur(3px)"
              />
            </g>
          );
        })()}

        {/* Posts */}
        <RackPost x={rackLeftX - POST_W} yTop={RACK_PAD} height={totalRackHeight} />
        <RackPost x={rackLeftX + rackContentWidth} yTop={RACK_PAD} height={totalRackHeight} />

        {/* Shelves */}
        {tierData.map((_, idx) => {
          const shelfY = RACK_PAD + idx * tierH + PALLET_H + BIN_H + PALLET_BASE_H;
          return (
            <g key={`shelf-${idx}`}>
              <rect
                x={rackLeftX - POST_W - 4}
                y={shelfY}
                width={rackContentWidth + POST_W * 2 + 8}
                height={SHELF_THICKNESS}
                fill="url(#metal-shelf)"
                rx={2}
              />
              <rect
                x={rackLeftX - POST_W - 4}
                y={shelfY}
                width={rackContentWidth + POST_W * 2 + 8}
                height={2}
                fill="#e4e4e7"
              />
            </g>
          );
        })}

        {/* Bins */}
        {rack.items.map((bin) => {
          const lvl = bin.levelNo ?? 1;
          const pos = parseInt(bin.position ?? "1", 10) || 1;
          const row = levels - lvl;
          const col = pos - 1;
          const x = rackLeftX + col * cellW + GAP_X / 2;
          const y = RACK_PAD + row * tierH;

          return (
            <BinPro3D
              key={bin.id}
              bin={bin}
              x={x}
              y={y}
              isSelected={bin.id === selectedBinId}
              isHovered={bin.id === hoveredBinId}
              onClick={() => onBinClick(bin)}
              onMouseEnter={() => onBinHover(bin.id)}
              onMouseLeave={() => onBinHover(null)}
            />
          );
        })}

        {/* Position tags */}
        {Array.from({ length: positionsPerLevel }).map((_, col) => {
          const x = rackLeftX + col * cellW + GAP_X / 2 + BIN_W / 2;
          const y = RACK_PAD + totalRackHeight + baseHeight + 10;
          const posLabel = String(col + 1).padStart(2, "0");
          return (
            <g key={`pos-${col}`}>
              <rect x={x - 22} y={y} width={44} height={positionTagH} rx={6} fill="#fff" stroke="#cbd5e1" strokeWidth="1.5" />
              <text x={x} y={y + positionTagH / 2 + 1} textAnchor="middle" dominantBaseline="middle"
                fontSize="13" fontWeight="700" fill="#475569" fontFamily="ui-monospace, SFMono-Regular, monospace">
                {posLabel}
              </text>
            </g>
          );
        })}

        {/* Ground label */}
        <g>
          <rect x={rackLeftX - 4} y={RACK_PAD + totalRackHeight + baseHeight + positionTagH + 8}
            width={rackContentWidth + 8} height={groundLabelH - 6} rx={4} fill="#1e293b" />
          <text x={rackLeftX + rackContentWidth / 2}
            y={RACK_PAD + totalRackHeight + baseHeight + positionTagH + 8 + (groundLabelH - 6) / 2 + 1}
            textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="700" fill="#fff" letterSpacing="1.8">
            MẶT ĐỨNG KỆ {rack.area}-{rack.rack}
          </text>
        </g>

        <style jsx>{`
          :global(.warehouse-bin-pulse) {
            animation: bin-pulse 2.4s ease-in-out infinite;
          }
          @keyframes bin-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.78; }
          }
          :global(.led-pulse) {
            animation: led-blink 1.6s ease-in-out infinite;
          }
          @keyframes led-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </svg>
    </div>
  );
}

function RackPost({ x, yTop, height }: { x: number; yTop: number; height: number }) {
  return (
    <g>
      <rect x={x} y={yTop - 8} width={POST_W} height={height + 16} fill="url(#metal-post)" rx={2} />
      <rect x={x - 2} y={yTop - 12} width={POST_W + 4} height={5} rx={2} fill="#52525b" />
      <circle cx={x + POST_W / 2} cy={yTop + 8} r={1.5} fill="#1f1f23" />
      <circle cx={x + POST_W / 2} cy={yTop + height - 8} r={1.5} fill="#1f1f23" />
    </g>
  );
}

/** Pro 3D bin với glass reflection + LED indicator + status pill. */
function BinPro3D({
  bin, x, y, isSelected, isHovered, onClick, onMouseEnter, onMouseLeave,
}: {
  bin: BinNode;
  x: number;
  y: number;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { key: tone, theme, pct } = getBinTheme(bin);
  const hasStock = bin.totalQty > 0;
  const isWarning = tone === "warning";

  // Front face coords
  const fxL = x;
  const fxR = x + BIN_W;
  const fyT = y + PALLET_H;
  const fyB = y + PALLET_H + BIN_H;

  const dx = BIN_DEPTH * 0.7;
  const dy = -BIN_DEPTH * 0.5;
  const bxR = fxR + dx;
  const byT = fyT + dy;
  const byB = fyB + dy;

  const palletYTop = y;

  return (
    <g
      style={{
        cursor: "pointer",
        transformOrigin: `${x + BIN_W / 2}px ${fyT + BIN_H / 2}px`,
        transformBox: "fill-box",
        transform: isSelected
          ? "translateY(-7px) scale(1.04)"
          : isHovered
            ? "translateY(-3px)"
            : undefined,
        transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
      className={cn(isWarning && hasStock && "warehouse-bin-pulse")}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Soft drop shadow ellipse beneath PALLET (lower for realism) */}
      <ellipse
        cx={x + BIN_W / 2 + 4}
        cy={fyB + PALLET_BASE_H + 2}
        rx={BIN_W / 2.3}
        ry={5}
        fill="rgba(0, 0, 0, 0.22)"
        filter="blur(3px)"
      />

      {/* === WOODEN PALLET BASE (under bin) === */}
      <g>
        {/* Right side face (depth) */}
        <polygon
          points={`${fxR},${fyB} ${bxR},${fyB + dy} ${bxR},${fyB + PALLET_BASE_H + dy} ${fxR},${fyB + PALLET_BASE_H}`}
          fill="url(#wood-pallet-side)"
        />
        {/* Front face — 3 plank pattern with gap and feet */}
        {/* Top plank */}
        <rect
          x={fxL}
          y={fyB}
          width={BIN_W}
          height={5}
          fill="url(#wood-pallet)"
        />
        <line x1={fxL} y1={fyB} x2={fxR} y2={fyB} stroke="#c9a47a" strokeWidth="0.6" />
        {/* Middle dark gap */}
        <rect
          x={fxL}
          y={fyB + 5}
          width={BIN_W}
          height={6}
          fill="#2a1a0a"
        />
        {/* 3 vertical feet visible in middle gap */}
        <rect x={fxL + 8} y={fyB + 5} width={22} height={6} fill="url(#wood-pallet)" />
        <rect x={fxL + (BIN_W - 22) / 2} y={fyB + 5} width={22} height={6} fill="url(#wood-pallet)" />
        <rect x={fxL + BIN_W - 30} y={fyB + 5} width={22} height={6} fill="url(#wood-pallet)" />
        {/* Bottom plank */}
        <rect
          x={fxL}
          y={fyB + 11}
          width={BIN_W}
          height={5}
          fill="url(#wood-pallet)"
        />
        <line
          x1={fxL}
          y1={fyB + PALLET_BASE_H - 0.5}
          x2={fxR}
          y2={fyB + PALLET_BASE_H - 0.5}
          stroke="#1a0f04"
          strokeWidth="0.6"
        />
      </g>

      {/* === BIN BODY 3D === */}
      <g filter="url(#bin-drop-shadow)">
        {/* Top face (parallelogram) */}
        <path
          d={`M${fxL},${fyT} L${fxR},${fyT} L${bxR},${byT} L${fxL + dx},${byT} Z`}
          fill={`url(#bin-top-${tone})`}
          stroke={theme.stroke}
          strokeWidth="0.8"
        />
        {/* Right side face */}
        <path
          d={`M${fxR},${fyT} L${bxR},${byT} L${bxR},${byB} L${fxR},${fyB} Z`}
          fill={`url(#bin-side-${tone})`}
          stroke={theme.stroke}
          strokeWidth="0.8"
        />
        {/* Front face (rounded rect) */}
        <rect
          x={fxL}
          y={fyT}
          width={BIN_W}
          height={BIN_H}
          rx={8}
          ry={8}
          fill={`url(#bin-front-${tone})`}
          stroke={theme.stroke}
          strokeWidth="1"
        />
      </g>

      {/* === GLASS REFLECTION STRIPE on front === */}
      <g pointerEvents="none">
        {/* Top inner highlight (above the band) */}
        <rect
          x={fxL + 4}
          y={fyT + 3}
          width={BIN_W - 8}
          height={10}
          rx={4}
          fill={theme.glassRef}
          opacity="0.7"
        />
        {/* Vertical reflection stripe (glass shine) */}
        <polygon
          points={`
            ${fxL + BIN_W * 0.18},${fyT + 6}
            ${fxL + BIN_W * 0.32},${fyT + 6}
            ${fxL + BIN_W * 0.22},${fyT + BIN_H - 8}
            ${fxL + BIN_W * 0.08},${fyT + BIN_H - 8}
          `}
          fill={theme.glassRef}
          opacity="0.35"
        />
      </g>

      {/* === STATUS PILL HEADER === */}
      <g pointerEvents="none">
        {/* Status pill background */}
        <rect
          x={fxL + 8}
          y={fyT + 8}
          width={68}
          height={18}
          rx={9}
          fill="rgba(255, 255, 255, 0.22)"
          stroke="rgba(255, 255, 255, 0.35)"
          strokeWidth="0.8"
        />
        {/* Status dot */}
        <circle cx={fxL + 22} cy={fyT + 22} r={4} fill={theme.led} />
        {/* Status text */}
        <text
          x={fxL + 32}
          y={fyT + 22}
          dominantBaseline="middle"
          fontSize="13"
          fontWeight="700"
          fill={theme.textPrimary}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {theme.statusLabel}
        </text>
      </g>

      {/* === LED INDICATOR (top-right corner) === */}
      <g pointerEvents="none">
        {/* Glow */}
        <circle
          cx={fxR - 18}
          cy={fyT + 22}
          r={11}
          fill={
            theme.led === "#10b981" ? "url(#led-glow-green)" :
            theme.led === "#fbbf24" ? "url(#led-glow-amber)" :
            theme.led === "#ef4444" ? "url(#led-glow-red)" :
            "url(#led-glow-amber)"
          }
        />
        {/* LED bulb */}
        <circle
          cx={fxR - 18}
          cy={fyT + 22}
          r={4.5}
          fill={theme.led}
          className={isWarning ? "led-pulse" : undefined}
        />
        {/* LED inner shine */}
        <circle cx={fxR - 18.5} cy={fyT + 21} r={1.5} fill="rgba(255, 255, 255, 0.8)" />
      </g>

      {/* === MENU DOTS === */}
      <text
        x={fxR - 18}
        y={fyT + 42}
        textAnchor="middle"
        fontSize="17"
        fontWeight="700"
        fill={theme.textSecondary}
        pointerEvents="none"
      >
        ⋮
      </text>

      {/* === FULL CODE === */}
      <text
        x={fxL + 16}
        y={fyT + 60}
        fontSize="13"
        fontWeight="600"
        fill={theme.textSecondary}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        pointerEvents="none"
      >
        {bin.fullCode}
      </text>

      {/* === SKU === V3.7.16: hiển thị slotted SKU khi chưa có tồn */}
      <text
        x={fxL + 16}
        y={fyT + 84}
        fontSize="14"
        fontWeight="700"
        fill={theme.textPrimary}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        pointerEvents="none"
      >
        {bin.primarySku
          ? `SKU: ${bin.primarySku.length > 16 ? bin.primarySku.slice(0, 15) + "…" : bin.primarySku}`
          : hasStock
            ? `${bin.skuCount} SKU · ${bin.lotCount} lot`
            : (bin.slotCount ?? 0) > 0
              ? bin.slottedSkus && bin.slottedSkus[0]
                ? `Đã gán: ${bin.slottedSkus[0].length > 14 ? bin.slottedSkus[0].slice(0, 13) + "…" : bin.slottedSkus[0]}${bin.slotCount! > 1 ? ` +${bin.slotCount! - 1}` : ""}`
                : `Đã gán ${bin.slotCount} SKU`
              : "Trống"}
      </text>

      {/* === QTY === */}
      <text
        x={fxL + 16}
        y={fyT + 116}
        fontSize="22"
        fontWeight="800"
        fill={theme.textPrimary}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        pointerEvents="none"
        style={{ textShadow: hasStock ? "0 1px 2px rgba(0,0,0,0.3)" : "none" }}
      >
        {Math.round(bin.totalQty).toLocaleString("vi-VN")}
        {" "}
        <tspan fontSize="13" fontWeight="500" fill={theme.textSecondary}>
          / {bin.capacity ? Math.round(Number(bin.capacity)).toLocaleString("vi-VN") : "—"}
        </tspan>
      </text>

      {/* === PROGRESS BAR === */}
      <g pointerEvents="none">
        {/* Track */}
        <rect
          x={fxL + 16}
          y={fyT + BIN_H - 18}
          width={BIN_W - 32}
          height={6}
          rx={3}
          fill={theme.progressTrack}
        />
        {/* Fill */}
        <rect
          x={fxL + 16}
          y={fyT + BIN_H - 18}
          width={(BIN_W - 32) * (pct / 100)}
          height={6}
          rx={3}
          fill={theme.progressFill}
        />
        {/* Fill highlight (top edge) */}
        {pct > 0 && (
          <rect
            x={fxL + 16}
            y={fyT + BIN_H - 18}
            width={(BIN_W - 32) * (pct / 100)}
            height={2}
            rx={2}
            fill="rgba(255, 255, 255, 0.5)"
          />
        )}
        {/* Pct label */}
        <text
          x={fxR - 16}
          y={fyT + BIN_H - 22}
          textAnchor="end"
          fontSize="12"
          fontWeight="700"
          fill={theme.textPrimary}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
          opacity="0.85"
        >
          {Math.round(pct)}%
        </text>
      </g>

      {/* === SELECTION RING === */}
      {isSelected && (
        <rect
          x={fxL - 4}
          y={fyT - 4}
          width={BIN_W + 8}
          height={BIN_H + 8}
          rx={12}
          ry={12}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2.5"
          strokeDasharray="6 4"
          opacity="0.95"
          pointerEvents="none"
        />
      )}
    </g>
  );
}

/**
 * Pallet pyramid stack — 3 rows giảm dần với 3 cardboard tones.
 * Số rows tỷ lệ với fillRatio.
 */
function PalletPyramid({
  x, y, width, height, fillRatio, tone,
}: {
  x: number; y: number; width: number; height: number; fillRatio: number; tone: "indigo" | "blue" | "teal" | "amber" | "gray" | "empty";
}) {
  const palletH = 8;
  const stackH = height - palletH - 2;
  // Number of rows based on fillRatio: 1 → 3 rows
  const maxRows = 3;
  const rows = Math.max(1, Math.min(maxRows, Math.round(fillRatio * maxRows + 0.5)));
  const rowH = (stackH - 2) / maxRows;

  // Cardboard tones rotation
  const cardGradients = ["card-light", "card-medium", "card-dark"];

  return (
    <g pointerEvents="none">
      {/* Wood pallet base (3 slats visible) */}
      <rect x={x} y={y + height - palletH} width={width} height={palletH} fill="url(#wood-pallet)" rx={1} />
      {/* Pallet slats (3 horizontal lines) */}
      <line x1={x + 3} y1={y + height - palletH + 2} x2={x + width - 3} y2={y + height - palletH + 2} stroke="#52401d" strokeWidth="0.5" />
      <line x1={x + 3} y1={y + height - palletH + palletH / 2} x2={x + width - 3} y2={y + height - palletH + palletH / 2} stroke="#52401d" strokeWidth="0.5" />
      <line x1={x + 3} y1={y + height - 2} x2={x + width - 3} y2={y + height - 2} stroke="#3a2810" strokeWidth="0.5" />
      {/* Pallet feet */}
      <rect x={x + 6} y={y + height - 2} width={6} height={2} fill="#3a2810" />
      <rect x={x + width / 2 - 3} y={y + height - 2} width={6} height={2} fill="#3a2810" />
      <rect x={x + width - 12} y={y + height - 2} width={6} height={2} fill="#3a2810" />

      {/* Boxes pyramid (giảm dần từ dưới lên) */}
      {Array.from({ length: rows }).map((_, rowIdx) => {
        // Row 0 = bottom (full width), top rows shrink
        const shrinkRatio = 1 - rowIdx * 0.12; // top rows narrower by 12% each
        const rowWidth = width * shrinkRatio;
        const rowX = x + (width - rowWidth) / 2;
        const rowY = y + height - palletH - (rowIdx + 1) * rowH;
        const boxesPerRow = Math.max(2, 4 - rowIdx); // 4 → 3 → 2
        const boxW = (rowWidth - (boxesPerRow + 1)) / boxesPerRow;
        const cardId = cardGradients[rowIdx % cardGradients.length]!;

        return (
          <g key={rowIdx}>
            {Array.from({ length: boxesPerRow }).map((_, colIdx) => {
              const bx = rowX + 1 + colIdx * (boxW + 1);
              return (
                <g key={colIdx}>
                  {/* Box body */}
                  <rect x={bx} y={rowY} width={boxW} height={rowH - 1} fill={`url(#${cardId})`} rx={0.5} />
                  {/* Top edge highlight */}
                  <rect x={bx} y={rowY} width={boxW} height={1.5} fill="url(#card-top-light)" opacity="0.8" />
                  {/* Tape line vertical center */}
                  <line
                    x1={bx + boxW / 2}
                    y1={rowY}
                    x2={bx + boxW / 2}
                    y2={rowY + rowH - 1}
                    stroke="#5a3d1f"
                    strokeWidth="0.4"
                    opacity="0.6"
                  />
                  {/* Box label dot */}
                  <circle cx={bx + boxW - 3} cy={rowY + 3} r={0.8} fill="#7a5530" opacity="0.6" />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/** Pallet trống — chỉ pallet gỗ phẳng. */
function EmptyWoodPallet({ x, y, width }: { x: number; y: number; width: number }) {
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={width} height={8} fill="url(#wood-pallet)" rx={1} opacity="0.6" />
      <line x1={x + 3} y1={y + 2} x2={x + width - 3} y2={y + 2} stroke="#52401d" strokeWidth="0.5" opacity="0.5" />
      <line x1={x + 3} y1={y + 6} x2={x + width - 3} y2={y + 6} stroke="#52401d" strokeWidth="0.5" opacity="0.5" />
    </g>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 2D FLAT VIEW                                                             */
/* ─────────────────────────────────────────────────────────────────────── */

function Rack2DView({
  rack, levels, selectedBinId, hoveredBinId, onBinClick, onBinHover,
}: {
  rack: { key: string; area: string; rack: string; items: BinNode[] };
  levels: number;
  positionsPerLevel: number;
  selectedBinId: string | null;
  hoveredBinId: string | null;
  onBinClick: (bin: BinNode) => void;
  onBinHover: (id: string | null) => void;
}) {
  const tierLabels = ["Tầng 3", "Tầng 2", "Tầng 1"];

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex flex-col gap-4">
        {Array.from({ length: levels }).map((_, idx) => {
          const lvl = levels - idx;
          const tier = tierLabels[idx];
          const items = rack.items
            .filter((b) => b.levelNo === lvl)
            .sort((a, b) => (a.position ?? "").localeCompare(b.position ?? ""));

          return (
            <div key={lvl} className="flex items-stretch gap-3">
              <div className="flex w-[80px] shrink-0 flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white px-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tier}</span>
                <span className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">Cao 2.0m</span>
              </div>
              <div className="flex gap-3">
                {items.map((bin) => (
                  <Bin2DPro
                    key={bin.id}
                    bin={bin}
                    isSelected={bin.id === selectedBinId}
                    isHovered={bin.id === hoveredBinId}
                    onClick={() => onBinClick(bin)}
                    onMouseEnter={() => onBinHover(bin.id)}
                    onMouseLeave={() => onBinHover(null)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bin2DPro({
  bin, isSelected, isHovered, onClick, onMouseEnter, onMouseLeave,
}: {
  bin: BinNode;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { theme, pct } = getBinTheme(bin);
  const hasStock = bin.totalQty > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        width: 160,
        height: 120,
        background: `linear-gradient(180deg, ${theme.frontStops[0]}, ${theme.frontStops[1]} 35%, ${theme.frontStops[2]} 70%, ${theme.frontStops[3]})`,
        borderColor: theme.stroke,
        boxShadow: isSelected
          ? `0 0 0 3px #fbbf24, 0 10px 30px ${theme.shadow}`
          : isHovered
            ? `0 8px 22px ${theme.shadow}`
            : `0 3px 10px ${theme.shadow}`,
        transform: isSelected ? "translateY(-4px) scale(1.02)" : isHovered ? "translateY(-2px)" : undefined,
        transition: "transform 0.2s, box-shadow 0.2s",
      }}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-lg border p-3 text-left",
        bin.isLow && hasStock && "warehouse-bin-pulse",
      )}
    >
      {/* Glass reflection top */}
      <div aria-hidden className="absolute inset-x-1.5 top-1.5 h-3 rounded-md" style={{ background: theme.glassRef, opacity: 0.7 }} />
      {/* Diagonal reflection stripe */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: "12%",
          top: "10%",
          width: "20%",
          height: "75%",
          background: theme.glassRef,
          opacity: 0.25,
          transform: "skewX(-12deg)",
          borderRadius: "4px",
        }}
      />

      <div className="relative flex items-start justify-between">
        <div className="inline-flex items-center gap-1 rounded-full bg-white/20 px-1.5 py-0.5 backdrop-blur-sm border border-white/30">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.led }} />
          <span className="text-[9px] font-bold leading-none" style={{ color: theme.textPrimary }}>
            {theme.statusLabel}
          </span>
        </div>
        <div className="relative">
          {/* LED glow background */}
          <div
            className="absolute inset-0 rounded-full blur-md"
            style={{ backgroundColor: theme.ledGlow }}
          />
          <div className="relative h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.led }} />
        </div>
      </div>

      <div className="relative">
        <p className="font-mono text-[10px] font-semibold leading-none mb-1" style={{ color: theme.textSecondary }}>
          {bin.fullCode}
        </p>
        <p className="font-mono text-[12px] font-bold truncate" style={{ color: theme.textPrimary }}>
          {bin.primarySku ? `SKU: ${bin.primarySku.slice(0, 11)}` : hasStock ? `${bin.skuCount} SKU` : "Trống"}
        </p>
        <p className="mt-1 font-mono text-[14px] font-extrabold" style={{ color: theme.textPrimary }}>
          {Math.round(bin.totalQty).toLocaleString("vi-VN")}
          <span className="font-normal text-[10px] ml-1" style={{ color: theme.textSecondary }}>
            / {bin.capacity ? Math.round(Number(bin.capacity)).toLocaleString("vi-VN") : "—"}
          </span>
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: theme.progressTrack }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: theme.progressFill }} />
          </div>
          <span className="text-[9px] font-bold tabular-nums" style={{ color: theme.textPrimary }}>{Math.round(pct)}%</span>
        </div>
      </div>
    </button>
  );
}
