/**
 * Bước (stage) theo category dòng BOM — V5 WP0 (design 2.5). Code ổn định, lưu DB.
 */

export const BOM_CATEGORIES = ["GTAM", "OUTSOURCED", "COMMERCIAL", "OTHER"] as const;
export type BomCategory = (typeof BOM_CATEGORIES)[number];

export const STAGE_CODES = [
  "BLANK",
  "MACHINING",
  "SURFACE",
  "QC",
  "ASSEMBLY",
  "ORDER",
  "VENDOR",
  "RECEIVED",
  "PROPOSE",
  "PO",
  "STOCK",
] as const;
export type StageCode = (typeof STAGE_CODES)[number];

/** Danh sách bước có thứ tự. OTHER dùng chung bước của COMMERCIAL. */
export const STAGES_BY_CATEGORY: Record<BomCategory, readonly StageCode[]> = {
  GTAM: ["BLANK", "MACHINING", "SURFACE", "QC", "ASSEMBLY"],
  OUTSOURCED: ["ORDER", "VENDOR", "RECEIVED", "QC", "ASSEMBLY"],
  COMMERCIAL: ["PROPOSE", "PO", "STOCK", "QC", "ASSEMBLY"],
  OTHER: ["PROPOSE", "PO", "STOCK", "QC", "ASSEMBLY"],
};

export const STAGE_LABELS_BY_CATEGORY: Record<BomCategory, readonly string[]> = {
  GTAM: ["Chờ phôi", "Gia công", "Bề mặt·NTP", "QC", "Lắp ráp"],
  OUTSOURCED: ["Đặt hàng", "NCC gia công", "Nhận về", "QC", "Lắp ráp"],
  COMMERCIAL: ["Đề xuất", "Đặt PO", "Nhận kho", "QC", "Lắp ráp"],
  OTHER: ["Đề xuất", "Đặt PO", "Nhận kho", "QC", "Lắp ráp"],
};

export function stagesFor(category: BomCategory): readonly StageCode[] {
  return STAGES_BY_CATEGORY[category];
}

/** Vị trí bước trong category; -1 nếu không thuộc. */
export function stageIndex(category: BomCategory, stage: string): number {
  return (STAGES_BY_CATEGORY[category] as readonly string[]).indexOf(stage);
}

export function stageLabel(category: BomCategory, stage: string): string {
  const i = stageIndex(category, stage);
  return i < 0 ? stage : STAGE_LABELS_BY_CATEGORY[category][i]!;
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Map text category Excel → enum. Chấp nhận biến thể dấu/hoa thường; không nhận ra → OTHER. */
export function parseBomCategory(text: string | null | undefined): BomCategory {
  if (!text) return "OTHER";
  const t = fold(String(text));
  if ((BOM_CATEGORIES as readonly string[]).includes(String(text).trim().toUpperCase())) {
    return String(text).trim().toUpperCase() as BomCategory;
  }
  if (t.includes("gtam")) return "GTAM";
  if (t.includes("ngoai") || t.includes("outsourc")) return "OUTSOURCED";
  if (t.includes("thuong mai") || t.includes("commercial")) return "COMMERCIAL";
  return "OTHER";
}
