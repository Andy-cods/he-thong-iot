import { parseBomCategory, type BomCategory } from "@iot/shared";
import type { BomTreeNodeRaw } from "@/hooks/useBom";

/**
 * BOM V5 / WP5 — suy giá trị hiển thị của 1 dòng BOM với fallback cho BOM cũ
 * (các cột V5 NULL). Hàm thuần, không phụ thuộc React.
 */

export const CATEGORY_ORDER: readonly BomCategory[] = [
  "GTAM",
  "OUTSOURCED",
  "COMMERCIAL",
  "OTHER",
];

export const CATEGORY_GROUP_LABEL: Record<BomCategory, string> = {
  GTAM: "GTAM — gia công",
  OUTSOURCED: "Gia công đặt ngoài",
  COMMERCIAL: "Thương mại",
  OTHER: "Khác",
};

/** category cột V5 → metadata.category (BOM cũ) → OTHER. */
export function lineCategory(node: BomTreeNodeRaw): BomCategory {
  if (node.category) return parseBomCategory(node.category);
  const meta = node.metadata as { category?: unknown } | null;
  if (meta && typeof meta.category === "string") {
    return parseBomCategory(meta.category);
  }
  return "OTHER";
}

/** ID hiển thị: positionCode (BL1..) → metadata.seq (ID Number cũ). */
export function lineIdText(node: BomTreeNodeRaw): string | null {
  const meta = node.metadata as { seq?: unknown } | null;
  return (
    node.positionCode ||
    (meta && meta.seq != null && String(meta.seq) !== "" ? String(meta.seq) : null)
  );
}

/** Tên chi tiết: file3dName → tên item → SKU. */
export function lineNameText(node: BomTreeNodeRaw): string | null {
  return node.file3dName || node.componentName || node.componentSku || null;
}

/** URL ảnh thumb: kho BOM → item.imageUrl → null. */
export function lineImageSrc(
  node: BomTreeNodeRaw,
  size: "thumb" | "full" = "thumb",
): string | null {
  if (node.imageAssetId) {
    return `/api/bom/assets/${node.imageAssetId}?size=${size}`;
  }
  return node.itemImageUrl || null;
}

/** Danh sách PIC: picNames[] → assignedToFullName/assignedToName. */
export function linePics(node: BomTreeNodeRaw): string[] {
  const fromArr = (node.picNames ?? []).map((s) => s.trim()).filter(Boolean);
  if (fromArr.length > 0) return fromArr;
  const single = (node.assignedToFullName ?? node.assignedToName ?? "")
    .split(" — ")[0]!
    .trim();
  return single ? [single] : [];
}

/** Hệ số: cột coef (V5) → qtyPerParent. */
export function lineCoef(node: BomTreeNodeRaw): number {
  const c = node.coef != null ? Number(node.coef) : NaN;
  if (Number.isFinite(c) && c > 0) return c;
  return Number(node.qtyPerParent) || 0;
}

/** Chữ cái đầu cho avatar PIC (tên Việt: lấy từ cuối). */
export function picInitial(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  return (last[0] ?? "?").toUpperCase();
}

/** Quy cách D×R×C: metadata.size → item.dimensions → spec_json.dimensionText. */
export function lineDimsText(node: BomTreeNodeRaw): string | null {
  const md = node.metadata as { size?: string } | null;
  if (md?.size && md.size.trim()) return md.size;
  const dim = node.itemDimensions as {
    length?: number | string;
    width?: number | string;
    height?: number | string;
    unit?: string;
  } | null;
  if (dim) {
    const parts = [dim.length, dim.width, dim.height]
      .map((v) => (v === 0 || v === "0" ? null : v))
      .filter((v): v is number | string => v != null && v !== "");
    if (parts.length > 0) {
      return `${parts.join("×")}${dim.unit ? ` ${dim.unit}` : ""}`;
    }
  }
  const rawSpec = node.itemSpecJson;
  if (rawSpec && rawSpec.trim()) {
    try {
      const parsed = JSON.parse(rawSpec) as { dimensionText?: unknown };
      if (typeof parsed.dimensionText === "string" && parsed.dimensionText.trim()) {
        return parsed.dimensionText;
      }
    } catch {
      return rawSpec;
    }
  }
  return null;
}
