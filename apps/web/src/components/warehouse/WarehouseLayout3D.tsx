"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * V3.6.2 — WarehouseLayout3D — chính diện 1 kệ tại một thời điểm.
 *
 * User yêu cầu:
 *   - Hiển thị 1 kệ (front view chính diện) thay vì dàn isometric tất cả
 *   - List các kệ ở thanh trên, click chuyển kệ
 *   - Background xám sáng (không còn dark gradient)
 *   - Hộp màu indigo/blue gradient + bo góc + size to
 *
 * Layout 1 kệ = 3 ngăn × 6 ô = 18 hộp:
 *   - Trục X: position (1-6) → ngang
 *   - Trục Y: level (3 trên, 1 dưới) → dọc
 *   - Hộp render rect bo góc với 3D effect bằng inset highlight + shadow
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
}

export interface WarehouseLayout3DProps {
  bins: BinNode[];
  selectedBinId: string | null;
  hoveredBinId: string | null;
  onBinClick: (bin: BinNode) => void;
  onBinHover: (binId: string | null) => void;
  className?: string;
}

const BIN_W = 130; // px width of each bin
const BIN_H = 110; // px height of each bin
const GAP_X = 14;  // horizontal gap
const GAP_Y = 14;  // vertical gap
const RACK_PADDING = 32;
const FLOOR_DEPTH = 28; // perspective base depth

interface BinColors {
  fill: string;
  stroke: string;
  highlight: string;
  shadow: string;
  text: string;
  badgeBg: string;
}

function getBinColors(bin: BinNode): BinColors {
  if (!bin.isActive) {
    return {
      fill: "url(#bin-gray-grad)",
      stroke: "#71717a",
      highlight: "rgba(255,255,255,0.4)",
      shadow: "rgba(0,0,0,0.15)",
      text: "#52525b",
      badgeBg: "#71717a",
    };
  }
  if (bin.totalQty <= 0) {
    return {
      fill: "url(#bin-empty-grad)",
      stroke: "#cbd5e1",
      highlight: "rgba(255,255,255,0.6)",
      shadow: "rgba(0,0,0,0.08)",
      text: "#94a3b8",
      badgeBg: "#cbd5e1",
    };
  }
  if (bin.isLow) {
    return {
      fill: "url(#bin-amber-grad)",
      stroke: "#d97706",
      highlight: "rgba(255,255,255,0.5)",
      shadow: "rgba(180,83,9,0.3)",
      text: "#7c2d12",
      badgeBg: "#dc2626",
    };
  }
  // Có hàng — indigo gradient
  return {
    fill: "url(#bin-indigo-grad)",
    stroke: "#4338ca",
    highlight: "rgba(255,255,255,0.55)",
    shadow: "rgba(67,56,202,0.35)",
    text: "#1e1b4b",
    badgeBg: "#3730a3",
  };
}

export function WarehouseLayout3D({
  bins,
  selectedBinId,
  hoveredBinId,
  onBinClick,
  onBinHover,
  className,
}: WarehouseLayout3DProps) {
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
          // Sort: top level first (highest levelNo), then position ASC
          const al = a.levelNo ?? 0;
          const bl = b.levelNo ?? 0;
          if (al !== bl) return bl - al; // higher first
          return (a.position ?? "").localeCompare(b.position ?? "");
        }),
      }))
      .sort((a, b) => (a.area + a.rack).localeCompare(b.area + b.rack));
    return sorted;
  }, [bins]);

  const [selectedRack, setSelectedRack] = React.useState<string>(
    racks[0]?.key ?? "",
  );

  // Auto-select rack đầu khi data load
  React.useEffect(() => {
    if (racks.length > 0 && !racks.find((r) => r.key === selectedRack)) {
      setSelectedRack(racks[0]!.key);
    }
  }, [racks, selectedRack]);

  const currentRack = racks.find((r) => r.key === selectedRack);

  // Layout dimensions của 1 kệ
  const positionsPerLevel = 6;
  const levels = 3;
  const rackContentWidth = positionsPerLevel * BIN_W + (positionsPerLevel - 1) * GAP_X;
  const rackContentHeight = levels * BIN_H + (levels - 1) * GAP_Y;
  const svgWidth = rackContentWidth + RACK_PADDING * 2;
  const svgHeight = rackContentHeight + RACK_PADDING * 2 + FLOOR_DEPTH;

  // Stats kệ hiện tại
  const rackStats = React.useMemo(() => {
    if (!currentRack) return { occupied: 0, empty: 0, low: 0, totalQty: 0 };
    const occupied = currentRack.items.filter((b) => b.totalQty > 0).length;
    const empty = currentRack.items.filter((b) => b.totalQty === 0).length;
    const low = currentRack.items.filter((b) => b.isLow && b.totalQty > 0).length;
    const totalQty = currentRack.items.reduce((s, b) => s + b.totalQty, 0);
    return { occupied, empty, low, totalQty };
  }, [currentRack]);

  return (
    <div className={cn("flex h-full w-full flex-col gap-4", className)}>
      {/* ── Rack tabs ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
        <span className="ml-2 mr-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Chọn kệ:
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
                  ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/30 scale-105"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
              )}
            >
              <span className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold",
                isActive ? "bg-white/20 text-white" : "bg-white text-zinc-600",
              )}>
                {r.area}
              </span>
              <span className="font-mono">Kệ {r.rack}</span>
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                isActive ? "bg-white/25 text-white" : "bg-white text-zinc-500",
              )}>
                {occupied}/{r.items.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Body: rack 3D front view + stats sidebar ── */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* 3D rack view */}
        <div className="relative flex-1 overflow-auto rounded-2xl bg-gradient-to-br from-zinc-100 via-zinc-50 to-zinc-200 shadow-inner ring-1 ring-zinc-300/50">
          {!currentRack ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              Chọn 1 kệ để xem chi tiết
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <svg
                width={svgWidth}
                height={svgHeight}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                style={{ display: "block" }}
              >
                <defs>
                  {/* Indigo gradient — bin có hàng */}
                  <linearGradient id="bin-indigo-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#818cf8" />
                    <stop offset="50%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#4338ca" />
                  </linearGradient>
                  {/* Amber gradient — sắp hết */}
                  <linearGradient id="bin-amber-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#fde68a" />
                    <stop offset="50%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#d97706" />
                  </linearGradient>
                  {/* Empty gradient */}
                  <linearGradient id="bin-empty-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#f8fafc" />
                    <stop offset="100%" stopColor="#e2e8f0" />
                  </linearGradient>
                  {/* Gray gradient — inactive */}
                  <linearGradient id="bin-gray-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#a1a1aa" />
                    <stop offset="100%" stopColor="#71717a" />
                  </linearGradient>
                  <filter id="bin-shadow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                    <feOffset dx="0" dy="3" />
                    <feComponentTransfer>
                      <feFuncA type="linear" slope="0.5" />
                    </feComponentTransfer>
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Floor base — perspective effect */}
                <polygon
                  points={`
                    ${RACK_PADDING - 8},${RACK_PADDING + rackContentHeight + 4}
                    ${RACK_PADDING + rackContentWidth + 8},${RACK_PADDING + rackContentHeight + 4}
                    ${RACK_PADDING + rackContentWidth + 24},${RACK_PADDING + rackContentHeight + FLOOR_DEPTH}
                    ${RACK_PADDING - 24},${RACK_PADDING + rackContentHeight + FLOOR_DEPTH}
                  `}
                  fill="rgba(99,102,241,0.08)"
                  stroke="rgba(99,102,241,0.2)"
                  strokeWidth="1"
                />

                {/* Rack frame — vertical posts trái phải */}
                <rect
                  x={RACK_PADDING - 14}
                  y={RACK_PADDING - 14}
                  width="6"
                  height={rackContentHeight + 28}
                  fill="#71717a"
                  rx="3"
                />
                <rect
                  x={RACK_PADDING + rackContentWidth + 8}
                  y={RACK_PADDING - 14}
                  width="6"
                  height={rackContentHeight + 28}
                  fill="#71717a"
                  rx="3"
                />

                {/* Bins */}
                {currentRack.items.map((bin) => {
                  const lvl = bin.levelNo ?? 1;
                  const pos = parseInt(bin.position ?? "1", 10) || 1;
                  // Y: top-most level (3) = row 0, level 1 = row 2
                  const row = levels - lvl;
                  const col = pos - 1;
                  const x = RACK_PADDING + col * (BIN_W + GAP_X);
                  const y = RACK_PADDING + row * (BIN_H + GAP_Y);

                  const colors = getBinColors(bin);
                  const isSelected = bin.id === selectedBinId;
                  const isHovered = bin.id === hoveredBinId;

                  return (
                    <g
                      key={bin.id}
                      className={cn(
                        "cursor-pointer",
                        bin.isLow && bin.totalQty > 0 && "warehouse-bin-pulse",
                      )}
                      style={{
                        transformOrigin: `${x + BIN_W / 2}px ${y + BIN_H / 2}px`,
                        transformBox: "fill-box",
                        transform: isSelected ? "translateY(-6px) scale(1.04)" : isHovered ? "translateY(-3px)" : undefined,
                        transition: "transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        filter: "url(#bin-shadow)",
                      }}
                      onClick={() => onBinClick(bin)}
                      onMouseEnter={() => onBinHover(bin.id)}
                      onMouseLeave={() => onBinHover(null)}
                    >
                      {/* Main rounded rect */}
                      <rect
                        x={x}
                        y={y}
                        width={BIN_W}
                        height={BIN_H}
                        rx={14}
                        ry={14}
                        fill={colors.fill}
                        stroke={isSelected ? "#fbbf24" : colors.stroke}
                        strokeWidth={isSelected ? 3 : 1.5}
                      />

                      {/* Top inner highlight */}
                      <rect
                        x={x + 4}
                        y={y + 4}
                        width={BIN_W - 8}
                        height={Math.min(20, BIN_H * 0.25)}
                        rx={10}
                        ry={10}
                        fill={colors.highlight}
                        pointerEvents="none"
                      />

                      {/* Bottom shadow inset */}
                      <rect
                        x={x + 4}
                        y={y + BIN_H - 14}
                        width={BIN_W - 8}
                        height="10"
                        rx={6}
                        ry={6}
                        fill={colors.shadow}
                        pointerEvents="none"
                        opacity="0.4"
                      />

                      {/* Position label center */}
                      <text
                        x={x + BIN_W / 2}
                        y={y + BIN_H / 2 - 6}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="13"
                        fontWeight="800"
                        fill={bin.totalQty > 0 ? "#ffffff" : "#94a3b8"}
                        fontFamily="ui-monospace, SFMono-Regular, monospace"
                        pointerEvents="none"
                        style={{ textShadow: bin.totalQty > 0 ? "0 1px 2px rgba(0,0,0,0.3)" : "none" }}
                      >
                        Ô {bin.position}
                      </text>

                      {/* Sub label: full code */}
                      <text
                        x={x + BIN_W / 2}
                        y={y + BIN_H / 2 + 12}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill={bin.totalQty > 0 ? "rgba(255,255,255,0.85)" : "#cbd5e1"}
                        fontFamily="ui-monospace, SFMono-Regular, monospace"
                        pointerEvents="none"
                      >
                        {bin.fullCode}
                      </text>

                      {/* Qty badge — bottom-center if has stock */}
                      {bin.totalQty > 0 && (
                        <g pointerEvents="none">
                          <rect
                            x={x + BIN_W / 2 - 28}
                            y={y + BIN_H - 28}
                            width="56"
                            height="20"
                            rx="10"
                            fill={colors.badgeBg}
                            stroke="rgba(255,255,255,0.6)"
                            strokeWidth="1"
                          />
                          <text
                            x={x + BIN_W / 2}
                            y={y + BIN_H - 18}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="11"
                            fontWeight="700"
                            fill="#ffffff"
                          >
                            {bin.totalQty > 999 ? "999+" : Math.round(bin.totalQty)}
                          </text>
                        </g>
                      )}

                      {/* Selection ring outer */}
                      {isSelected && (
                        <rect
                          x={x - 4}
                          y={y - 4}
                          width={BIN_W + 8}
                          height={BIN_H + 8}
                          rx={18}
                          ry={18}
                          fill="none"
                          stroke="#fbbf24"
                          strokeWidth="2.5"
                          strokeDasharray="6 4"
                          opacity="0.8"
                          pointerEvents="none"
                        />
                      )}
                    </g>
                  );
                })}

                {/* Level labels left side */}
                {[3, 2, 1].map((lvl, idx) => {
                  const y = RACK_PADDING + idx * (BIN_H + GAP_Y) + BIN_H / 2;
                  return (
                    <text
                      key={`lvl-${lvl}`}
                      x={RACK_PADDING - 22}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill="#475569"
                      fontFamily="ui-monospace, SFMono-Regular, monospace"
                    >
                      Ngăn {lvl}
                    </text>
                  );
                })}
              </svg>
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-4 right-4 flex items-center gap-3 rounded-xl bg-white/90 px-4 py-2 shadow-md ring-1 ring-zinc-200 backdrop-blur-md">
            <LegendDot color="#6366f1" label="Có hàng" />
            <LegendDot color="#fbbf24" label="Sắp hết" pulse />
            <LegendDot color="#e2e8f0" label="Trống" stroke="#cbd5e1" />
          </div>
        </div>
      </div>

      <style jsx>{`
        :global(.warehouse-bin-pulse) {
          animation: bin-pulse 2.4s ease-in-out infinite;
        }
        @keyframes bin-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.78; }
        }
      `}</style>
    </div>
  );
}

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
