"use client";

import * as React from "react";
import { Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V3.6 — WarehouseLayout3D — isometric 3D rendering của warehouse.
 *
 * Render bins thành parallelogram boxes với:
 *   - Top face (45° skew)
 *   - Front face (vertical)
 *   - Side face (15° skew)
 * Light source giả lập từ trên (top sáng nhất, side tối hơn).
 *
 * Color theo trạng thái:
 *   - Empty (qty=0): gray, low opacity
 *   - Normal: emerald
 *   - Low stock: amber với pulse
 *
 * Input bins[] có coordX/Y/Z từ DB. Project về 2D:
 *   px = (x - z) * cos30
 *   py = (x + z) * sin30 - y
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

const BIN_W = 50;   // px width (front face)
const BIN_H = 55;   // px height (front face)
const BIN_D = 35;   // px depth (side face)
const ISO_ANGLE = 30; // degrees

// Cosine + sine 30°
const COS30 = Math.cos((ISO_ANGLE * Math.PI) / 180);
const SIN30 = Math.sin((ISO_ANGLE * Math.PI) / 180);

interface ProjectedPos {
  px: number;
  py: number;
}

/**
 * V3.6.1 — Project (x, y, z) → screen (px, py).
 *
 * Convention từ DB seed (migration 0034):
 *   coord_x = (rack - 1) * 1.5   → kệ trải ngang (sàn X, max ~6m cho 5 kệ)
 *   coord_y = (position - 1) * 0.5 → ô dọc theo kệ (sàn Y, max ~2.5m cho 6 ô)
 *   coord_z = (level - 1) * 0.8  → ngăn cao (vertical, max ~1.6m cho 3 ngăn)
 *
 * Isometric 30°. SCALE đủ lớn để 90 bins không overlap.
 */
const FLOOR_SCALE = 130; // px per meter (sàn)
const VERT_SCALE = 90;   // px per meter (cao)

function project(x: number, y: number, z: number): ProjectedPos {
  return {
    px: (x - y) * COS30 * FLOOR_SCALE,
    py: (x + y) * SIN30 * FLOOR_SCALE - z * VERT_SCALE,
  };
}

function getBinColor(bin: BinNode): {
  top: string;
  front: string;
  side: string;
  stroke: string;
} {
  if (!bin.isActive) {
    return { top: "#e4e4e7", front: "#d4d4d8", side: "#a1a1aa", stroke: "#71717a" };
  }
  if (bin.totalQty <= 0) {
    return { top: "#f4f4f5", front: "#e4e4e7", side: "#d4d4d8", stroke: "#a1a1aa" };
  }
  if (bin.isLow) {
    return { top: "#fde68a", front: "#fbbf24", side: "#d97706", stroke: "#92400e" };
  }
  // Normal stock — emerald
  return { top: "#a7f3d0", front: "#34d399", side: "#059669", stroke: "#047857" };
}

export function WarehouseLayout3D({
  bins,
  selectedBinId,
  hoveredBinId,
  onBinClick,
  onBinHover,
  className,
}: WarehouseLayout3DProps) {
  // Compute viewBox from projected positions
  const projected = React.useMemo(() => {
    return bins.map((b) => {
      const x = Number(b.coordX ?? "0");
      const y = Number(b.coordY ?? "0");
      const z = Number(b.coordZ ?? "0");
      return { bin: b, ...project(x, y, z) };
    });
  }, [bins]);

  const bounds = React.useMemo(() => {
    if (projected.length === 0) {
      return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of projected) {
      if (p.px < minX) minX = p.px;
      if (p.px + BIN_W > maxX) maxX = p.px + BIN_W;
      if (p.py - BIN_H - BIN_D < minY) minY = p.py - BIN_H - BIN_D;
      if (p.py + BIN_D > maxY) maxY = p.py + BIN_D;
    }
    return {
      minX: minX - 60,
      minY: minY - 60,
      maxX: maxX + 60,
      maxY: maxY + 60,
    };
  }, [projected]);

  const viewWidth = bounds.maxX - bounds.minX;
  const viewHeight = bounds.maxY - bounds.minY;

  // V3.6.1 — Paint order: back-to-front + bottom-to-top.
  //   Back: higher coord_y (xa người xem) vẽ trước
  //   Bottom: thấp coord_z vẽ trước (ngăn dưới che ngăn trên)
  //   Đối với cùng (y,z): kệ phía sau (low x) vẽ trước
  const sorted = React.useMemo(() => {
    return [...projected].sort((a, b) => {
      const ay = Number(a.bin.coordY ?? "0");
      const by = Number(b.bin.coordY ?? "0");
      const az = Number(a.bin.coordZ ?? "0");
      const bz = Number(b.bin.coordZ ?? "0");
      const ax = Number(a.bin.coordX ?? "0");
      const bx = Number(b.bin.coordX ?? "0");
      // Back row first
      if (ay !== by) return by - ay;
      // Bottom level first
      if (az !== bz) return az - bz;
      // Left rack first
      return ax - bx;
    });
  }, [projected]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900", className)}>
      {/* Grid floor */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`${bounds.minX} ${bounds.minY} ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="grid-pattern" width="60" height="35" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 35" fill="none" stroke="rgba(99,102,241,0.10)" strokeWidth="1" />
          </pattern>
          <radialGradient id="floor-glow" cx="50%" cy="50%">
            <stop offset="0%" stopColor="rgba(99,102,241,0.12)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0)" />
          </radialGradient>
          <filter id="bin-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="2" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.4" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Floor grid */}
        <rect
          x={bounds.minX}
          y={bounds.minY}
          width={viewWidth}
          height={viewHeight}
          fill="url(#floor-glow)"
        />
        <rect
          x={bounds.minX}
          y={bounds.minY}
          width={viewWidth}
          height={viewHeight}
          fill="url(#grid-pattern)"
        />

        {/* Bins */}
        {sorted.map((p, idx) => {
          const bin = p.bin;
          const isSelected = bin.id === selectedBinId;
          const isHovered = bin.id === hoveredBinId;
          const colors = getBinColor(bin);
          const baseX = p.px;
          const baseY = p.py;

          // 3D parallelogram coordinates
          // Front face (rectangle)
          const front = `${baseX},${baseY} ${baseX + BIN_W},${baseY} ${baseX + BIN_W},${baseY - BIN_H} ${baseX},${baseY - BIN_H}`;
          // Top face (parallelogram skewed)
          const top = `${baseX},${baseY - BIN_H} ${baseX + BIN_W},${baseY - BIN_H} ${baseX + BIN_W + BIN_D * COS30},${baseY - BIN_H - BIN_D * SIN30} ${baseX + BIN_D * COS30},${baseY - BIN_H - BIN_D * SIN30}`;
          // Side face (right side, parallelogram)
          const side = `${baseX + BIN_W},${baseY} ${baseX + BIN_W + BIN_D * COS30},${baseY - BIN_D * SIN30} ${baseX + BIN_W + BIN_D * COS30},${baseY - BIN_H - BIN_D * SIN30} ${baseX + BIN_W},${baseY - BIN_H}`;

          return (
            <g
              key={bin.id}
              className={cn(
                "cursor-pointer transition-transform",
                bin.isLow && bin.totalQty > 0 && "warehouse-bin-pulse",
                isSelected && "warehouse-bin-selected",
                isHovered && "warehouse-bin-hover",
              )}
              style={{
                transformOrigin: `${baseX + BIN_W / 2}px ${baseY - BIN_H / 2}px`,
                transformBox: "fill-box",
                animationDelay: `${idx * 6}ms`,
              }}
              onClick={() => onBinClick(bin)}
              onMouseEnter={() => onBinHover(bin.id)}
              onMouseLeave={() => onBinHover(null)}
            >
              {/* Side */}
              <polygon
                points={side}
                fill={colors.side}
                stroke={colors.stroke}
                strokeWidth={isSelected ? 2 : 1}
                opacity={bin.totalQty > 0 ? 1 : 0.5}
                filter="url(#bin-shadow)"
              />
              {/* Front */}
              <polygon
                points={front}
                fill={colors.front}
                stroke={colors.stroke}
                strokeWidth={isSelected ? 2 : 1}
                opacity={bin.totalQty > 0 ? 1 : 0.5}
              />
              {/* Top */}
              <polygon
                points={top}
                fill={colors.top}
                stroke={colors.stroke}
                strokeWidth={isSelected ? 2 : 1}
                opacity={bin.totalQty > 0 ? 1 : 0.5}
              />

              {/* Selection ring */}
              {isSelected && (
                <polygon
                  points={top}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth={3}
                />
              )}

              {/* Bin code label on front */}
              <text
                x={baseX + BIN_W / 2}
                y={baseY - BIN_H / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="9"
                fontWeight="600"
                fill={bin.totalQty > 0 ? "#1e293b" : "#71717a"}
                fontFamily="monospace"
                pointerEvents="none"
              >
                {bin.position}
              </text>

              {/* Qty badge top-right corner if has stock */}
              {bin.totalQty > 0 && (
                <g pointerEvents="none">
                  <circle
                    cx={baseX + BIN_W + BIN_D * COS30 - 8}
                    cy={baseY - BIN_H - BIN_D * SIN30 + 8}
                    r={9}
                    fill={bin.isLow ? "#dc2626" : "#1e293b"}
                  />
                  <text
                    x={baseX + BIN_W + BIN_D * COS30 - 8}
                    y={baseY - BIN_H - BIN_D * SIN30 + 8}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="9"
                    fontWeight="700"
                    fill="#ffffff"
                  >
                    {bin.totalQty > 99 ? "99+" : Math.round(bin.totalQty)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Rack labels */}
        {Array.from(new Set(sorted.map((p) => p.bin.rack))).filter(Boolean).map((rack) => {
          const racksOfThis = sorted.filter((p) => p.bin.rack === rack && p.bin.levelNo === 1 && p.bin.position === "01");
          if (racksOfThis.length === 0) return null;
          const r = racksOfThis[0]!;
          return (
            <text
              key={`rack-${rack}`}
              x={r.px + BIN_W / 2}
              y={r.py + 25}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill="rgba(255,255,255,0.6)"
              fontFamily="monospace"
            >
              KỆ {rack}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 flex items-center gap-3 rounded-xl bg-black/40 px-4 py-2 backdrop-blur-md">
        <LegendDot color="#34d399" label="Có hàng" />
        <LegendDot color="#fbbf24" label="Sắp hết" pulse />
        <LegendDot color="#e4e4e7" label="Trống" />
      </div>

      <style jsx>{`
        :global(.warehouse-bin-pulse) {
          animation: bin-pulse 2s ease-in-out infinite;
        }
        @keyframes bin-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        :global(.warehouse-bin-hover) {
          transform: translateY(-3px);
          transition: transform 0.15s ease-out;
        }
        :global(.warehouse-bin-selected) {
          transform: translateY(-5px) scale(1.05);
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </div>
  );
}

function LegendDot({ color, label, pulse }: { color: string; label: string; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn("inline-block h-2.5 w-2.5 rounded-sm", pulse && "animate-pulse")}
        style={{ backgroundColor: color }}
      />
      <span className="text-xs font-medium text-white">{label}</span>
    </div>
  );
}
