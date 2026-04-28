"use client";

import * as React from "react";
import { Box, Layers, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V3.6.3 — Enterprise warehouse layout với 3D isometric + 2D toggle.
 *
 * 4 yêu cầu:
 * 1. Layout: rack tabs trên + chính diện kệ giữa (1 kệ tại 1 thời điểm)
 * 2. Chế độ 3D mặc định: bin = parallelogram box (top + front + right faces)
 *    với shadow mềm, highlight phản chiếu, edge bo nhẹ, metal rack frame
 * 3. 2D toggle: card phẳng đơn giản (fallback)
 * 4. Mỗi tầng (level) có label "Tầng 1/2/3" rõ ràng
 *
 * Color palette enterprise:
 * - Indigo #6366F1 / Purple #6D5DF6 (có hàng)
 * - Amber #F59E0B (sắp hết)
 * - Slate gray (trống)
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
  /** V3.6.3 — primary SKU display (lấy từ content[0] nếu có). */
  primarySku?: string | null;
}

export interface WarehouseLayout3DProps {
  bins: BinNode[];
  selectedBinId: string | null;
  hoveredBinId: string | null;
  onBinClick: (bin: BinNode) => void;
  onBinHover: (binId: string | null) => void;
  className?: string;
}

type ViewMode = "3d" | "2d";

const BIN_W_3D = 150;
const BIN_H_3D = 120;
const BIN_DEPTH = 38;
const GAP_X_3D = 18;
const GAP_Y_3D = 26;
const TIER_LABEL_W = 80;
const RACK_PAD_X = 50;
const RACK_PAD_Y = 40;

const BIN_W_2D = 140;
const BIN_H_2D = 110;
const GAP_X_2D = 12;
const GAP_Y_2D = 12;

interface BinTheme {
  /** Stops gradient cho front face (top → bottom) */
  frontStops: [string, string, string];
  /** Top face — sáng hơn front (light source from above) */
  topStops: [string, string];
  /** Side face — tối hơn front */
  sideStops: [string, string];
  /** Border / stroke color */
  stroke: string;
  /** Shadow color rgba */
  shadow: string;
  /** Text màu chính trên bin */
  textPrimary: string;
  /** Text phụ */
  textSecondary: string;
  /** Progress bar fill */
  progressFill: string;
  /** Progress bar track */
  progressTrack: string;
  /** Highlight reflection */
  highlight: string;
}

const THEMES: Record<"normal" | "low" | "empty" | "inactive", BinTheme> = {
  normal: {
    frontStops: ["#818cf8", "#6366f1", "#4338ca"],
    topStops: ["#a5b4fc", "#818cf8"],
    sideStops: ["#4338ca", "#312e81"],
    stroke: "#3730a3",
    shadow: "rgba(67, 56, 202, 0.35)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(255, 255, 255, 0.85)",
    progressFill: "#ffffff",
    progressTrack: "rgba(255, 255, 255, 0.25)",
    highlight: "rgba(255, 255, 255, 0.45)",
  },
  low: {
    frontStops: ["#fcd34d", "#f59e0b", "#b45309"],
    topStops: ["#fde68a", "#fcd34d"],
    sideStops: ["#b45309", "#78350f"],
    stroke: "#92400e",
    shadow: "rgba(180, 83, 9, 0.4)",
    textPrimary: "#1c1917",
    textSecondary: "#451a03",
    progressFill: "#7c2d12",
    progressTrack: "rgba(124, 45, 18, 0.2)",
    highlight: "rgba(255, 255, 255, 0.5)",
  },
  empty: {
    frontStops: ["#f8fafc", "#f1f5f9", "#e2e8f0"],
    topStops: ["#ffffff", "#f8fafc"],
    sideStops: ["#cbd5e1", "#94a3b8"],
    stroke: "#cbd5e1",
    shadow: "rgba(100, 116, 139, 0.15)",
    textPrimary: "#94a3b8",
    textSecondary: "#cbd5e1",
    progressFill: "#cbd5e1",
    progressTrack: "rgba(203, 213, 225, 0.4)",
    highlight: "rgba(255, 255, 255, 0.7)",
  },
  inactive: {
    frontStops: ["#a1a1aa", "#71717a", "#52525b"],
    topStops: ["#d4d4d8", "#a1a1aa"],
    sideStops: ["#52525b", "#3f3f46"],
    stroke: "#3f3f46",
    shadow: "rgba(63, 63, 70, 0.35)",
    textPrimary: "#fafafa",
    textSecondary: "#e4e4e7",
    progressFill: "#fafafa",
    progressTrack: "rgba(255, 255, 255, 0.2)",
    highlight: "rgba(255, 255, 255, 0.3)",
  },
};

function getBinTheme(bin: BinNode): BinTheme {
  if (!bin.isActive) return THEMES.inactive;
  if (bin.totalQty <= 0) return THEMES.empty;
  if (bin.isLow) return THEMES.low;
  return THEMES.normal;
}

function fillPercent(bin: BinNode): number {
  const cap = Number(bin.capacity ?? "0");
  if (cap <= 0) return 0;
  return Math.min(100, Math.max(0, (bin.totalQty / cap) * 100));
}

export function WarehouseLayout3D({
  bins,
  selectedBinId,
  hoveredBinId,
  onBinClick,
  onBinHover,
  className,
}: WarehouseLayout3DProps) {
  const [viewMode, setViewMode] = React.useState<ViewMode>("3d");

  // Group bins theo rack
  const racks = React.useMemo(() => {
    const map = new Map<string, BinNode[]>();
    for (const b of bins) {
      const key = `${b.area ?? ""}-${b.rack ?? ""}`;
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    const sorted = Array.from(map.entries())
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
    return sorted;
  }, [bins]);

  const [selectedRack, setSelectedRack] = React.useState<string>(racks[0]?.key ?? "");

  React.useEffect(() => {
    if (racks.length > 0 && !racks.find((r) => r.key === selectedRack)) {
      setSelectedRack(racks[0]!.key);
    }
  }, [racks, selectedRack]);

  const currentRack = racks.find((r) => r.key === selectedRack);
  const positionsPerLevel = 6;
  const levels = 3;

  return (
    <div className={cn("flex h-full w-full flex-col gap-4", className)}>
      {/* ── Rack tabs + view toggle ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ml-2 mr-1 text-xs font-bold uppercase tracking-wider text-zinc-500">
            Chọn kệ
          </span>
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
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold",
                    isActive ? "bg-white/20 text-white" : "bg-white text-zinc-600",
                  )}
                >
                  {r.area}
                </span>
                <span className="font-mono">Kệ {r.rack}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    isActive ? "bg-white/25 text-white" : "bg-white text-zinc-500",
                  )}
                >
                  {occupied}/{r.items.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* 2D / 3D toggle */}
        <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("3d")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all",
              viewMode === "3d"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900",
            )}
          >
            <Box className="h-3.5 w-3.5" />
            3D
          </button>
          <button
            type="button"
            onClick={() => setViewMode("2d")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all",
              viewMode === "2d"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900",
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            2D
          </button>
        </div>
      </div>

      {/* ── Body: rack view ── */}
      <div className="relative flex-1 overflow-auto rounded-2xl bg-gradient-to-br from-slate-50 via-white to-slate-100 shadow-inner ring-1 ring-zinc-200/60">
        {!currentRack ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
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

        {/* Legend */}
        <div className="absolute bottom-4 right-4 flex items-center gap-3 rounded-xl bg-white/90 px-4 py-2 shadow-md ring-1 ring-zinc-200 backdrop-blur-md">
          <LegendDot color="#6366f1" label="Có hàng" />
          <LegendDot color="#f59e0b" label="Sắp hết" pulse />
          <LegendDot color="#e2e8f0" label="Trống" stroke="#cbd5e1" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 3D ISOMETRIC RACK VIEW                                                   */
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
  const tierLabels = ["Tầng 3", "Tầng 2", "Tầng 1"]; // top→down
  const rackContentWidth = positionsPerLevel * BIN_W_3D + (positionsPerLevel - 1) * GAP_X_3D;
  const rackContentHeight = levels * BIN_H_3D + (levels - 1) * GAP_Y_3D;
  // depth offset trên top = BIN_DEPTH * cos(30) ≈ 33; right offset = BIN_DEPTH * sin(60) ≈ 33
  const svgWidth = TIER_LABEL_W + rackContentWidth + RACK_PAD_X * 2 + BIN_DEPTH;
  const svgHeight = rackContentHeight + RACK_PAD_Y * 2 + BIN_DEPTH;

  return (
    <div className="flex h-full items-center justify-center p-6">
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ display: "block" }}
      >
        <defs>
          {/* Gradients per theme */}
          {(["normal", "low", "empty", "inactive"] as const).map((tone) => {
            const t = THEMES[tone];
            return (
              <React.Fragment key={tone}>
                <linearGradient id={`grad-front-${tone}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={t.frontStops[0]} />
                  <stop offset="50%" stopColor={t.frontStops[1]} />
                  <stop offset="100%" stopColor={t.frontStops[2]} />
                </linearGradient>
                <linearGradient id={`grad-top-${tone}`} x1="0%" y1="0%" x2="50%" y2="100%">
                  <stop offset="0%" stopColor={t.topStops[0]} />
                  <stop offset="100%" stopColor={t.topStops[1]} />
                </linearGradient>
                <linearGradient id={`grad-side-${tone}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={t.sideStops[0]} />
                  <stop offset="100%" stopColor={t.sideStops[1]} />
                </linearGradient>
              </React.Fragment>
            );
          })}

          <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
            <feOffset dx="0" dy="6" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.4" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Rack metallic frame: vertical posts left + right */}
        <RackPosts
          x={TIER_LABEL_W + RACK_PAD_X}
          y={RACK_PAD_Y}
          width={rackContentWidth + BIN_DEPTH}
          height={rackContentHeight + BIN_DEPTH}
        />

        {/* Tier labels + horizontal beams */}
        {tierLabels.map((label, idx) => {
          const y = RACK_PAD_Y + idx * (BIN_H_3D + GAP_Y_3D) + BIN_H_3D / 2;
          const beamY = RACK_PAD_Y + idx * (BIN_H_3D + GAP_Y_3D) + BIN_H_3D + 4;
          return (
            <g key={label}>
              {/* Tier label */}
              <rect
                x={4}
                y={y - 14}
                width={TIER_LABEL_W - 14}
                height={28}
                rx={8}
                fill="#fff"
                stroke="#e4e4e7"
                strokeWidth="1.5"
              />
              <text
                x={(TIER_LABEL_W - 10) / 2 + 4}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="12"
                fontWeight="700"
                fill="#3f3f46"
              >
                {label}
              </text>
              {/* Horizontal beam */}
              {idx < tierLabels.length - 1 && (
                <rect
                  x={TIER_LABEL_W + RACK_PAD_X - 8}
                  y={beamY}
                  width={rackContentWidth + BIN_DEPTH + 16}
                  height={5}
                  rx={2.5}
                  fill="#9ca3af"
                  opacity="0.5"
                />
              )}
            </g>
          );
        })}

        {/* Bins */}
        {rack.items.map((bin) => {
          const lvl = bin.levelNo ?? 1;
          const pos = parseInt(bin.position ?? "1", 10) || 1;
          const row = levels - lvl;
          const col = pos - 1;
          const x = TIER_LABEL_W + RACK_PAD_X + col * (BIN_W_3D + GAP_X_3D);
          const y = RACK_PAD_Y + row * (BIN_H_3D + GAP_Y_3D);

          return (
            <Bin3D
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

        <style jsx>{`
          :global(.warehouse-bin-pulse) {
            animation: bin-pulse 2.4s ease-in-out infinite;
          }
          @keyframes bin-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.78; }
          }
        `}</style>
      </svg>
    </div>
  );
}

/** Vertical metallic posts cho khung kệ. */
function RackPosts({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  const postW = 8;
  return (
    <g>
      {/* Left post */}
      <rect
        x={x - postW - 6}
        y={y - 12}
        width={postW}
        height={height + 24}
        rx={4}
        fill="url(#post-grad)"
      />
      {/* Right post */}
      <rect
        x={x + width + 6}
        y={y - 12}
        width={postW}
        height={height + 24}
        rx={4}
        fill="url(#post-grad)"
      />
      <defs>
        <linearGradient id="post-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#71717a" />
          <stop offset="50%" stopColor="#a1a1aa" />
          <stop offset="100%" stopColor="#52525b" />
        </linearGradient>
      </defs>
      {/* Top cap */}
      <rect x={x - postW - 8} y={y - 16} width={width + postW * 2 + 16} height={6} rx={3} fill="#71717a" />
      {/* Bottom base */}
      <rect x={x - postW - 8} y={y + height + 12} width={width + postW * 2 + 16} height={8} rx={3} fill="#52525b" />
    </g>
  );
}

/** 1 bin 3D với 3 faces (top, front, right) + content. */
function Bin3D({
  bin,
  x,
  y,
  isSelected,
  isHovered,
  onClick,
  onMouseEnter,
  onMouseLeave,
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
  const tone =
    !bin.isActive ? "inactive" :
    bin.totalQty <= 0 ? "empty" :
    bin.isLow ? "low" : "normal";
  const theme = THEMES[tone];
  const dx = BIN_DEPTH * 0.7;
  const dy = -BIN_DEPTH * 0.5;
  const fillPct = fillPercent(bin);

  // Box corners
  const fxL = x;
  const fxR = x + BIN_W_3D;
  const fyT = y;
  const fyB = y + BIN_H_3D;
  const bxL = x + dx;
  const bxR = x + BIN_W_3D + dx;
  const byT = y + dy;
  const byB = y + BIN_H_3D + dy;

  // Faces
  const topPath = `M${fxL},${fyT} L${fxR},${fyT} L${bxR},${byT} L${bxL},${byT} Z`;
  const sidePath = `M${fxR},${fyT} L${bxR},${byT} L${bxR},${byB} L${fxR},${fyB} Z`;
  // Front rounded rect — separate

  return (
    <g
      style={{
        cursor: "pointer",
        transformOrigin: `${x + BIN_W_3D / 2}px ${y + BIN_H_3D / 2}px`,
        transformBox: "fill-box",
        transform: isSelected
          ? "translateY(-8px) scale(1.04)"
          : isHovered
            ? "translateY(-4px)"
            : undefined,
        transition: "transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
      className={cn(bin.isLow && bin.totalQty > 0 && "warehouse-bin-pulse")}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      filter="url(#soft-shadow)"
    >
      {/* Top face (rhombus) */}
      <path
        d={topPath}
        fill={`url(#grad-top-${tone})`}
        stroke={theme.stroke}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Right side face */}
      <path
        d={sidePath}
        fill={`url(#grad-side-${tone})`}
        stroke={theme.stroke}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Front face — rounded rect */}
      <rect
        x={fxL}
        y={fyT}
        width={BIN_W_3D}
        height={BIN_H_3D}
        rx={10}
        ry={10}
        fill={`url(#grad-front-${tone})`}
        stroke={theme.stroke}
        strokeWidth="1.5"
      />

      {/* Glassmorphism highlight on top of front */}
      <rect
        x={fxL + 6}
        y={fyT + 6}
        width={BIN_W_3D - 12}
        height={Math.min(22, BIN_H_3D * 0.22)}
        rx={6}
        ry={6}
        fill={theme.highlight}
        opacity="0.7"
        pointerEvents="none"
      />

      {/* Content layout: code (top), SKU (mid), qty/cap + progress bar (bottom) */}
      <text
        x={fxL + 12}
        y={fyT + 22}
        fontSize="11"
        fontWeight="800"
        fill={theme.textPrimary}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        pointerEvents="none"
        style={{ textShadow: bin.totalQty > 0 ? "0 1px 2px rgba(0,0,0,0.25)" : "none" }}
      >
        {bin.fullCode}
      </text>

      {/* SKU (only if has primary) */}
      {bin.primarySku ? (
        <text
          x={fxL + 12}
          y={fyT + 50}
          fontSize="13"
          fontWeight="700"
          fill={theme.textPrimary}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
          pointerEvents="none"
        >
          {bin.primarySku.length > 16 ? `${bin.primarySku.slice(0, 14)}…` : bin.primarySku}
        </text>
      ) : (
        <text
          x={fxL + 12}
          y={fyT + 50}
          fontSize="11"
          fontStyle="italic"
          fill={theme.textSecondary}
          pointerEvents="none"
        >
          {bin.totalQty > 0 ? `${bin.skuCount} SKU · ${bin.lotCount} lot` : "Trống"}
        </text>
      )}

      {/* Qty / Capacity */}
      <text
        x={fxL + 12}
        y={fyT + BIN_H_3D - 28}
        fontSize="10"
        fontWeight="600"
        fill={theme.textSecondary}
        pointerEvents="none"
      >
        SL:{" "}
        <tspan fontSize="13" fontWeight="800" fill={theme.textPrimary}>
          {Math.round(bin.totalQty).toLocaleString("vi-VN")}
        </tspan>
        <tspan fill={theme.textSecondary}>
          {" / "}{bin.capacity ? Math.round(Number(bin.capacity)).toLocaleString("vi-VN") : "—"}
        </tspan>
      </text>

      {/* Progress bar */}
      <rect
        x={fxL + 12}
        y={fyT + BIN_H_3D - 14}
        width={BIN_W_3D - 24}
        height={5}
        rx={2.5}
        fill={theme.progressTrack}
        pointerEvents="none"
      />
      <rect
        x={fxL + 12}
        y={fyT + BIN_H_3D - 14}
        width={(BIN_W_3D - 24) * (fillPct / 100)}
        height={5}
        rx={2.5}
        fill={theme.progressFill}
        pointerEvents="none"
      />

      {/* Selection outer ring */}
      {isSelected && (
        <rect
          x={fxL - 4}
          y={fyT - 4}
          width={BIN_W_3D + 8}
          height={BIN_H_3D + 8}
          rx={14}
          ry={14}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2.5"
          strokeDasharray="6 4"
          opacity="0.9"
          pointerEvents="none"
        />
      )}
    </g>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 2D FLAT VIEW                                                             */
/* ─────────────────────────────────────────────────────────────────────── */

function Rack2DView({
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
  const tierLabels = ["Tầng 3", "Tầng 2", "Tầng 1"];

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex flex-col gap-4">
        {Array.from({ length: levels }).map((_, idx) => {
          const lvl = levels - idx;
          const tier = tierLabels[idx];
          const items = rack.items.filter((b) => b.levelNo === lvl).sort((a, b) =>
            (a.position ?? "").localeCompare(b.position ?? ""),
          );

          return (
            <div key={lvl} className="flex items-stretch gap-3">
              <div className="flex w-[80px] shrink-0 flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white px-2 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{tier}</span>
              </div>
              <div className="flex gap-3">
                {items.map((bin) => (
                  <Bin2D
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

function Bin2D({
  bin,
  isSelected,
  isHovered,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  bin: BinNode;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const tone =
    !bin.isActive ? "inactive" :
    bin.totalQty <= 0 ? "empty" :
    bin.isLow ? "low" : "normal";
  const theme = THEMES[tone];
  const fillPct = fillPercent(bin);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        width: BIN_W_2D,
        height: BIN_H_2D,
        background: `linear-gradient(180deg, ${theme.frontStops[0]}, ${theme.frontStops[1]} 50%, ${theme.frontStops[2]})`,
        borderColor: theme.stroke,
        boxShadow: isSelected
          ? `0 0 0 3px #fbbf24, 0 8px 24px ${theme.shadow}`
          : isHovered
            ? `0 6px 18px ${theme.shadow}`
            : `0 2px 8px ${theme.shadow}`,
        transform: isSelected ? "translateY(-4px) scale(1.02)" : isHovered ? "translateY(-2px)" : undefined,
        transition: "transform 0.2s, box-shadow 0.2s",
      }}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-xl border p-3 text-left",
        bin.isLow && bin.totalQty > 0 && "warehouse-bin-pulse",
      )}
    >
      <div
        aria-hidden
        className="absolute inset-x-2 top-1.5 h-5 rounded-md"
        style={{ background: theme.highlight, opacity: 0.6 }}
      />

      <div className="relative">
        <p
          className="font-mono text-[11px] font-extrabold leading-none"
          style={{ color: theme.textPrimary, textShadow: bin.totalQty > 0 ? "0 1px 2px rgba(0,0,0,0.25)" : "none" }}
        >
          {bin.fullCode}
        </p>
        <p
          className="mt-1.5 truncate font-mono text-[12px] font-bold leading-tight"
          style={{ color: theme.textPrimary }}
        >
          {bin.primarySku
            ? bin.primarySku.length > 14 ? `${bin.primarySku.slice(0, 12)}…` : bin.primarySku
            : bin.totalQty > 0 ? `${bin.skuCount} SKU` : "Trống"}
        </p>
      </div>

      <div className="relative">
        <p className="text-[10px] font-semibold tabular-nums" style={{ color: theme.textSecondary }}>
          SL:{" "}
          <span className="text-[12px] font-extrabold" style={{ color: theme.textPrimary }}>
            {Math.round(bin.totalQty).toLocaleString("vi-VN")}
          </span>
          <span> / {bin.capacity ? Math.round(Number(bin.capacity)).toLocaleString("vi-VN") : "—"}</span>
        </p>
        <div
          className="mt-1.5 h-1 rounded-full"
          style={{ background: theme.progressTrack }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${fillPct}%`, background: theme.progressFill }}
          />
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function LegendDot({ color, label, pulse, stroke }: {
  color: string; label: string; pulse?: boolean; stroke?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn("inline-block h-3 w-3 rounded-md", pulse && "animate-pulse")}
        style={{ backgroundColor: color, border: stroke ? `1px solid ${stroke}` : undefined }}
      />
      <span className="text-xs font-semibold text-zinc-700">{label}</span>
    </div>
  );
}
