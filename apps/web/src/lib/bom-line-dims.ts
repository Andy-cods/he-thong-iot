/**
 * BOM V5 WP8 — Quy cách D×R×C của dòng BOM (cùng thứ tự ưu tiên như cột
 * "Quy cách" của lưới): metadata.size → item.dimensions → item.spec_json.dimensionText.
 * Hàm thuần, dùng cho snapshot phiếu giao.
 */
import { parseDims } from "@iot/shared";

export interface LineDims {
  l: number;
  w: number;
  h: number;
}

export function resolveLineDims(src: {
  metadataSize?: string | null;
  itemDimensions?: unknown;
  itemSpecJson?: string | null;
}): { text: string | null; dims: LineDims | null } {
  const size = src.metadataSize?.trim();
  if (size) return { text: size, dims: parseDims(size) };

  const d = src.itemDimensions as {
    length?: number | string;
    width?: number | string;
    height?: number | string;
  } | null;
  if (d && typeof d === "object") {
    const l = Number(d.length);
    const w = Number(d.width);
    const h = Number(d.height);
    if ([l, w, h].some((n) => Number.isFinite(n) && n > 0)) {
      const ok = (n: number) => (Number.isFinite(n) ? n : 0);
      return {
        text: `${ok(l)}×${ok(w)}×${ok(h)}`,
        dims: { l: ok(l), w: ok(w), h: ok(h) },
      };
    }
  }
  const raw = src.itemSpecJson?.trim();
  if (raw) {
    try {
      const p = JSON.parse(raw) as { dimensionText?: unknown };
      if (typeof p.dimensionText === "string" && p.dimensionText.trim()) {
        return { text: p.dimensionText, dims: parseDims(p.dimensionText) };
      }
    } catch {
      /* spec_json không phải JSON → bỏ qua */
    }
  }
  return { text: null, dims: null };
}
