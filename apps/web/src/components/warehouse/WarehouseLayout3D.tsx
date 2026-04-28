"use client";

import * as React from "react";
import { Box, Layers, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V3.6.4 — Enterprise warehouse rack với pallet/hộp hàng 3D thật.
 *
 * Theo design tham khảo của user:
 * - Khung kệ kim loại realistic: 4 posts + 3 horizontal shelves + sàn base
 * - Mỗi ô có pallet (stack hộp carton) phía trên
 * - Bin = parallelogram box indigo gradient với mã ô + SKU + qty
 * - Position labels (01-06) ở dưới đáy như metal tags
 * - "MẶT ĐỨNG KỆ A-01" label dưới sàn
 * - Tier labels "Tầng X / Cao 2.0m" bên trái
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
}

export interface WarehouseLayout3DProps {
  bins: BinNode[];
  selectedBinId: string | null;
  hoveredBinId: string | null;
  onBinClick: (bin: BinNode) => void;
  onBinHover: (binId: string | null) => void;
  className?: string;
  /** External viewMode controlled (optional). */
  viewMode?: "3d" | "2d";
  onViewModeChange?: (mode: "3d" | "2d") => void;
  /** External rack selection controlled (optional). */
  selectedRack?: string;
  onRackChange?: (key: string) => void;
}

type ViewMode = "3d" | "2d";

/** Constants for 3D layout */
const BIN_W = 175;        // mỗi ô rộng
const BIN_H = 105;        // mỗi ô cao (vùng front face)
const PALLET_H = 52;      // chiều cao pallet+boxes phía trên
const BIN_DEPTH = 30;     // depth 3D
const GAP_X = 18;
const SHELF_THICKNESS = 10;
const POST_W = 12;
const TIER_LABEL_W = 90;
const RACK_PAD = 32;

interface BinTheme {
  frontStops: [string, string, string];
  topStops: [string, string];
  sideStops: [string, string];
  stroke: string;
  shadow: string;
  textPrimary: string;
  textSecondary: string;
  progressFill: string;
  progressTrack: string;
  highlight: string;
  /** Color cho cardboard boxes phía trên */
  palletTone: "indigo" | "amber" | "empty" | "gray";
}

const THEMES: Record<"normal" | "low" | "empty" | "inactive", BinTheme> = {
  normal: {
    frontStops: ["#6366f1", "#5b58e8", "#4338ca"],
    topStops: ["#818cf8", "#6366f1"],
    sideStops: ["#3730a3", "#312e81"],
    stroke: "#3730a3",
    shadow: "rgba(67, 56, 202, 0.4)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(255, 255, 255, 0.85)",
    progressFill: "#ffffff",
    progressTrack: "rgba(255, 255, 255, 0.25)",
    highlight: "rgba(255, 255, 255, 0.3)",
    palletTone: "indigo",
  },
  low: {
    frontStops: ["#fbbf24", "#f59e0b", "#b45309"],
    topStops: ["#fcd34d", "#fbbf24"],
    sideStops: ["#92400e", "#78350f"],
    stroke: "#92400e",
    shadow: "rgba(180, 83, 9, 0.4)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(255, 255, 255, 0.9)",
    progressFill: "#ffffff",
    progressTrack: "rgba(255, 255, 255, 0.3)",
    highlight: "rgba(255, 255, 255, 0.4)",
    palletTone: "amber",
  },
  empty: {
    frontStops: ["#f1f5f9", "#e2e8f0", "#cbd5e1"],
    topStops: ["#f8fafc", "#e2e8f0"],
    sideStops: ["#94a3b8", "#64748b"],
    stroke: "#cbd5e1",
    shadow: "rgba(100, 116, 139, 0.18)",
    textPrimary: "#94a3b8",
    textSecondary: "#cbd5e1",
    progressFill: "#cbd5e1",
    progressTrack: "rgba(203, 213, 225, 0.5)",
    highlight: "rgba(255, 255, 255, 0.6)",
    palletTone: "empty",
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
    highlight: "rgba(255, 255, 255, 0.25)",
    palletTone: "gray",
  },
};

function getBinTone(bin: BinNode): "normal" | "low" | "empty" | "inactive" {
  if (!bin.isActive) return "inactive";
  if (bin.totalQty <= 0) return "empty";
  if (bin.isLow) return "low";
  return "normal";
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
      {/* Inline rack tabs nếu không bị control external */}
      {!extSelectedRack && (
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
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold",
                    isActive ? "bg-white/20 text-white" : "bg-white text-zinc-600",
                  )}>{r.area}</span>
                  <span className="font-mono">Kệ {r.rack}</span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    isActive ? "bg-white/25 text-white" : "bg-white text-zinc-500",
                  )}>{occupied}/{r.items.length}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-0.5">
            <button type="button" onClick={() => setViewMode("3d")}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all",
                viewMode === "3d" ? "bg-white text-indigo-700 shadow-sm" : "text-zinc-600",
              )}>
              <Box className="h-3.5 w-3.5" /> 3D
            </button>
            <button type="button" onClick={() => setViewMode("2d")}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all",
                viewMode === "2d" ? "bg-white text-indigo-700 shadow-sm" : "text-zinc-600",
              )}>
              <Layers className="h-3.5 w-3.5" /> 2D
            </button>
          </div>
        </div>
      )}

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
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* 3D RACK VIEW — pallet stack + metallic frame                             */
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
  const tierH = PALLET_H + BIN_H + SHELF_THICKNESS;
  const rackContentWidth = positionsPerLevel * BIN_W + (positionsPerLevel - 1) * GAP_X;

  // SVG dimensions
  const baseHeight = 36;          // sàn nền dưới đáy
  const positionTagH = 22;        // dải nhãn position 01-06
  const groundLabelH = 26;        // "MẶT ĐỨNG KỆ A-01"
  const totalRackHeight = levels * tierH + SHELF_THICKNESS; // shelves bottom
  const svgWidth = TIER_LABEL_W + RACK_PAD * 2 + rackContentWidth + POST_W * 2 + BIN_DEPTH;
  const svgHeight = RACK_PAD + totalRackHeight + baseHeight + positionTagH + groundLabelH + RACK_PAD;

  const rackLeftX = TIER_LABEL_W + RACK_PAD + POST_W;

  return (
    <div className="flex h-full items-center justify-center p-4">
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ display: "block" }}>
        <defs>
          {/* Bin gradients */}
          {(["normal", "low", "empty", "inactive"] as const).map((tone) => {
            const t = THEMES[tone];
            return (
              <React.Fragment key={tone}>
                <linearGradient id={`bin-front-${tone}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={t.frontStops[0]} />
                  <stop offset="50%" stopColor={t.frontStops[1]} />
                  <stop offset="100%" stopColor={t.frontStops[2]} />
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

          {/* Cardboard pallet gradients */}
          <linearGradient id="cardboard-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#d4a574" />
            <stop offset="50%" stopColor="#b8895c" />
            <stop offset="100%" stopColor="#8b6240" />
          </linearGradient>
          <linearGradient id="cardboard-top" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e6b88a" />
            <stop offset="100%" stopColor="#c19975" />
          </linearGradient>
          <linearGradient id="empty-pallet" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>

          {/* Metallic post gradient */}
          <linearGradient id="metal-post" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#52525b" />
            <stop offset="40%" stopColor="#a1a1aa" />
            <stop offset="60%" stopColor="#a1a1aa" />
            <stop offset="100%" stopColor="#52525b" />
          </linearGradient>
          <linearGradient id="metal-shelf" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a1a1aa" />
            <stop offset="50%" stopColor="#71717a" />
            <stop offset="100%" stopColor="#52525b" />
          </linearGradient>
          <linearGradient id="metal-base" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#71717a" />
            <stop offset="100%" stopColor="#3f3f46" />
          </linearGradient>

          <filter id="bin-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" />
            <feOffset dx="0" dy="4" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.35" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Tier labels (left side) */}
        {tierData.map((tier, idx) => {
          const y = RACK_PAD + idx * tierH + (PALLET_H + BIN_H) / 2;
          return (
            <g key={tier.lvl}>
              <text
                x={TIER_LABEL_W / 2 + 6}
                y={y - 6}
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#1e293b"
              >
                {tier.label}
              </text>
              <text
                x={TIER_LABEL_W / 2 + 6}
                y={y + 12}
                textAnchor="middle"
                fontSize="10"
                fontWeight="500"
                fill="#94a3b8"
              >
                {tier.height}
              </text>
            </g>
          );
        })}

        {/* RACK STRUCTURE: vertical posts (left + right) */}
        <RackPost x={rackLeftX - POST_W} yTop={RACK_PAD} height={totalRackHeight} />
        <RackPost x={rackLeftX + rackContentWidth} yTop={RACK_PAD} height={totalRackHeight} />

        {/* Horizontal shelves — at bottom of each tier */}
        {tierData.map((_, idx) => {
          const shelfY = RACK_PAD + idx * tierH + PALLET_H + BIN_H;
          return (
            <g key={`shelf-${idx}`}>
              {/* Shelf horizontal bar */}
              <rect
                x={rackLeftX - POST_W - 4}
                y={shelfY}
                width={rackContentWidth + POST_W * 2 + 8}
                height={SHELF_THICKNESS}
                fill="url(#metal-shelf)"
                rx={2}
              />
              {/* Shelf top edge highlight */}
              <rect
                x={rackLeftX - POST_W - 4}
                y={shelfY}
                width={rackContentWidth + POST_W * 2 + 8}
                height={2}
                fill="#d4d4d8"
              />
            </g>
          );
        })}

        {/* Bins (with pallets) — render top tier first to handle overlap */}
        {rack.items.map((bin) => {
          const lvl = bin.levelNo ?? 1;
          const pos = parseInt(bin.position ?? "1", 10) || 1;
          const row = levels - lvl;
          const col = pos - 1;
          const x = rackLeftX + col * cellW + GAP_X / 2;
          const y = RACK_PAD + row * tierH;

          return (
            <Bin3DWithPallet
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

        {/* BASE PLATFORM — sàn dưới đáy */}
        <g>
          <rect
            x={rackLeftX - POST_W - 16}
            y={RACK_PAD + totalRackHeight}
            width={rackContentWidth + POST_W * 2 + 32}
            height={baseHeight}
            fill="url(#metal-base)"
            rx={3}
          />
          {/* Base top highlight */}
          <rect
            x={rackLeftX - POST_W - 16}
            y={RACK_PAD + totalRackHeight}
            width={rackContentWidth + POST_W * 2 + 32}
            height={3}
            fill="#a1a1aa"
          />
        </g>

        {/* POSITION TAGS — 01, 02, 03... at bottom */}
        {Array.from({ length: positionsPerLevel }).map((_, col) => {
          const x = rackLeftX + col * cellW + GAP_X / 2 + BIN_W / 2;
          const y = RACK_PAD + totalRackHeight + baseHeight + 8;
          const posLabel = String(col + 1).padStart(2, "0");
          return (
            <g key={`pos-${col}`}>
              <rect
                x={x - 18}
                y={y}
                width={36}
                height={positionTagH}
                rx={6}
                fill="#fff"
                stroke="#cbd5e1"
                strokeWidth="1.5"
              />
              <text
                x={x}
                y={y + positionTagH / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="11"
                fontWeight="700"
                fill="#475569"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {posLabel}
              </text>
            </g>
          );
        })}

        {/* GROUND LABEL — "MẶT ĐỨNG KỆ A-01" */}
        <g>
          <rect
            x={rackLeftX - 4}
            y={RACK_PAD + totalRackHeight + baseHeight + positionTagH + 6}
            width={rackContentWidth + 8}
            height={groundLabelH - 6}
            rx={4}
            fill="#1e293b"
          />
          <text
            x={rackLeftX + rackContentWidth / 2}
            y={RACK_PAD + totalRackHeight + baseHeight + positionTagH + 6 + (groundLabelH - 6) / 2 + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="11"
            fontWeight="700"
            fill="#fff"
            letterSpacing="1.5"
          >
            MẶT ĐỨNG KỆ {rack.area}-{rack.rack}
          </text>
        </g>

        <style jsx>{`
          :global(.warehouse-bin-pulse) {
            animation: bin-pulse 2.4s ease-in-out infinite;
          }
          @keyframes bin-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.8; }
          }
        `}</style>
      </svg>
    </div>
  );
}

/** Vertical metallic post của khung kệ. */
function RackPost({ x, yTop, height }: { x: number; yTop: number; height: number }) {
  return (
    <g>
      <rect x={x} y={yTop - 8} width={POST_W} height={height + 16} fill="url(#metal-post)" rx={2} />
      {/* Top cap */}
      <rect x={x - 2} y={yTop - 12} width={POST_W + 4} height={5} rx={2} fill="#52525b" />
      {/* Bolts highlight */}
      <circle cx={x + POST_W / 2} cy={yTop + 8} r={1.5} fill="#1f1f23" />
      <circle cx={x + POST_W / 2} cy={yTop + height - 8} r={1.5} fill="#1f1f23" />
    </g>
  );
}

/** Bin 3D với pallet/boxes phía trên. */
function Bin3DWithPallet({
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
  const tone = getBinTone(bin);
  const theme = THEMES[tone];
  const pct = fillPercent(bin);
  const hasStock = bin.totalQty > 0;

  // Front face top-left
  const fxL = x;
  const fxR = x + BIN_W;
  const fyT = y + PALLET_H;        // bin starts BELOW pallet area
  const fyB = y + PALLET_H + BIN_H;

  // 3D depth offset (right + up for top face, right for side)
  const dx = BIN_DEPTH * 0.7;
  const dy = -BIN_DEPTH * 0.5;
  const bxR = fxR + dx;
  const byT = fyT + dy;
  const byB = fyB + dy;

  // Pallet area (top of bin)
  const palletYTop = y;
  const palletYBottom = y + PALLET_H;

  return (
    <g
      style={{
        cursor: "pointer",
        transformOrigin: `${x + BIN_W / 2}px ${fyT + BIN_H / 2}px`,
        transformBox: "fill-box",
        transform: isSelected
          ? "translateY(-6px) scale(1.03)"
          : isHovered
            ? "translateY(-3px)"
            : undefined,
        transition: "transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
      className={cn(bin.isLow && hasStock && "warehouse-bin-pulse")}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      filter="url(#bin-shadow)"
    >
      {/* PALLET / BOXES STACK on top */}
      {hasStock ? (
        <PalletStack
          x={fxL + 8}
          y={palletYTop + 4}
          width={BIN_W - 16}
          height={PALLET_H - 6}
          fillRatio={pct / 100}
          tone={theme.palletTone}
        />
      ) : tone === "empty" ? (
        // Empty: chỉ pallet phẳng (không có boxes)
        <EmptyPallet x={fxL + 12} y={palletYBottom - 12} width={BIN_W - 24} />
      ) : null}

      {/* BIN BODY 3D */}
      {/* Top face */}
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
        rx={6}
        ry={6}
        fill={`url(#bin-front-${tone})`}
        stroke={theme.stroke}
        strokeWidth="1"
      />

      {/* Top edge highlight */}
      <rect
        x={fxL + 3}
        y={fyT + 3}
        width={BIN_W - 6}
        height={3}
        rx={1.5}
        fill={theme.highlight}
        pointerEvents="none"
      />

      {/* CONTENT TEXT */}
      {/* Header line: "Ô 01" + ⋮ */}
      <g>
        {/* Box icon */}
        <rect x={fxL + 10} y={fyT + 11} width={14} height={14} rx={3} fill="rgba(255,255,255,0.2)" />
        <rect x={fxL + 12} y={fyT + 13} width={10} height={3} fill="rgba(255,255,255,0.6)" />
        <text
          x={fxL + 30}
          y={fyT + 22}
          fontSize="12"
          fontWeight="700"
          fill={theme.textPrimary}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          pointerEvents="none"
        >
          Ô {bin.position}
        </text>
        {/* Menu dots */}
        <text
          x={fxR - 14}
          y={fyT + 22}
          fontSize="14"
          fontWeight="700"
          fill={theme.textSecondary}
          textAnchor="middle"
          pointerEvents="none"
        >
          ⋮
        </text>
      </g>

      {/* Mã ô */}
      <text
        x={fxL + 12}
        y={fyT + 42}
        fontSize="10"
        fontWeight="600"
        fill={theme.textSecondary}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        pointerEvents="none"
      >
        {bin.fullCode.replace(/^[A-Z]/, "")}
      </text>

      {/* SKU */}
      <text
        x={fxL + 12}
        y={fyT + 60}
        fontSize="11"
        fontWeight="700"
        fill={theme.textPrimary}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        pointerEvents="none"
      >
        {bin.primarySku
          ? `SKU: ${bin.primarySku.length > 13 ? bin.primarySku.slice(0, 11) + "…" : bin.primarySku}`
          : hasStock
            ? `SKU: ${bin.skuCount} loại`
            : "Trống"}
      </text>

      {/* Qty / Capacity */}
      <text
        x={fxL + 12}
        y={fyT + 80}
        fontSize="13"
        fontWeight="800"
        fill={theme.textPrimary}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        pointerEvents="none"
      >
        {Math.round(bin.totalQty).toLocaleString("vi-VN")}
        {" "}
        <tspan fontSize="10" fontWeight="500" fill={theme.textSecondary}>
          / {bin.capacity ? Math.round(Number(bin.capacity)).toLocaleString("vi-VN") : "—"}
        </tspan>
      </text>

      {/* Progress bar */}
      <rect x={fxL + 12} y={fyT + BIN_H - 12} width={BIN_W - 24} height={3.5} rx={1.75} fill={theme.progressTrack} />
      <rect x={fxL + 12} y={fyT + BIN_H - 12} width={(BIN_W - 24) * (pct / 100)} height={3.5} rx={1.75} fill={theme.progressFill} />

      {/* Selection ring */}
      {isSelected && (
        <rect
          x={fxL - 4}
          y={fyT - 4}
          width={BIN_W + 8}
          height={BIN_H + 8}
          rx={10}
          ry={10}
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

/** Stack hộp carton phía trên bin (mô phỏng pallet). */
function PalletStack({
  x, y, width, height, fillRatio, tone,
}: {
  x: number; y: number; width: number; height: number; fillRatio: number; tone: "indigo" | "amber" | "empty" | "gray";
}) {
  // Số "hàng" boxes hiển thị tỷ lệ với fillRatio
  const rows = Math.max(1, Math.round(fillRatio * 2.5));
  const palletH = 6;
  const stackH = height - palletH - 2;
  const rowH = Math.min(stackH / rows, 14);
  const boxesPerRow = 4;
  const boxW = (width - 4) / boxesPerRow - 1;

  return (
    <g pointerEvents="none">
      {/* Pallet base (wood gray) */}
      <rect x={x} y={y + height - palletH} width={width} height={palletH} fill="#52525b" rx={1} />
      <rect x={x} y={y + height - palletH} width={width} height={1.5} fill="#71717a" />

      {/* Boxes stack */}
      {Array.from({ length: rows }).map((_, rowIdx) => {
        const rowY = y + height - palletH - (rowIdx + 1) * rowH;
        return (
          <g key={rowIdx}>
            {Array.from({ length: boxesPerRow }).map((_, colIdx) => {
              const bx = x + 2 + colIdx * (boxW + 1);
              return (
                <g key={colIdx}>
                  <rect x={bx} y={rowY} width={boxW} height={rowH - 1} fill="url(#cardboard-grad)" rx={0.5} />
                  <rect x={bx} y={rowY} width={boxW} height={1.5} fill="url(#cardboard-top)" />
                  {/* Tape line giữa */}
                  <line
                    x1={bx + boxW / 2}
                    y1={rowY}
                    x2={bx + boxW / 2}
                    y2={rowY + rowH - 1}
                    stroke="#8b6240"
                    strokeWidth="0.3"
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/** Pallet phẳng cho bin trống. */
function EmptyPallet({ x, y, width }: { x: number; y: number; width: number }) {
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={width} height={8} fill="url(#empty-pallet)" rx={1} />
      <line x1={x} y1={y + 4} x2={x + width} y2={y + 4} stroke="#94a3b8" strokeWidth="0.5" />
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
              <div className="flex w-[80px] shrink-0 flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white px-2 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{tier}</span>
                <span className="mt-0.5 text-[10px] text-zinc-400">Cao 2.0m</span>
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
  bin, isSelected, isHovered, onClick, onMouseEnter, onMouseLeave,
}: {
  bin: BinNode;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const tone = getBinTone(bin);
  const theme = THEMES[tone];
  const fillPct = fillPercent(bin);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        width: 150,
        height: 110,
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
        "group relative flex flex-col justify-between overflow-hidden rounded-lg border p-3 text-left",
        bin.isLow && bin.totalQty > 0 && "warehouse-bin-pulse",
      )}
    >
      <div aria-hidden className="absolute inset-x-2 top-1.5 h-3 rounded-md" style={{ background: theme.highlight, opacity: 0.6 }} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold leading-none flex items-center gap-1" style={{ color: theme.textPrimary }}>
            <span className="inline-block h-3 w-3 rounded bg-white/20" />
            Ô {bin.position}
          </p>
          <p className="mt-1 font-mono text-[10px]" style={{ color: theme.textSecondary }}>
            {bin.fullCode.replace(/^[A-Z]/, "")}
          </p>
        </div>
        <MoreVertical className="h-3.5 w-3.5" style={{ color: theme.textSecondary }} />
      </div>
      <div className="relative">
        <p className="font-mono text-[11px] font-bold truncate" style={{ color: theme.textPrimary }}>
          {bin.primarySku ? `SKU: ${bin.primarySku.slice(0, 12)}` : bin.totalQty > 0 ? `${bin.skuCount} SKU` : "Trống"}
        </p>
        <p className="mt-0.5 font-mono text-[12px] font-extrabold" style={{ color: theme.textPrimary }}>
          {Math.round(bin.totalQty).toLocaleString("vi-VN")}
          <span className="font-normal text-[10px]" style={{ color: theme.textSecondary }}>
            {" / "}{bin.capacity ? Math.round(Number(bin.capacity)).toLocaleString("vi-VN") : "—"}
          </span>
        </p>
        <div className="mt-1 h-1 rounded-full" style={{ background: theme.progressTrack }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${fillPct}%`, background: theme.progressFill }} />
        </div>
      </div>
    </button>
  );
}
