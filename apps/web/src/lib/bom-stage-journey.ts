/**
 * BOM V5 WP6 — hàm thuần hiển thị "hành trình" của 1 dòng BOM (không IO, không React).
 * Dùng chung cho server (tính SL cần) và UI (thanh 5 bước, dialog chuyển bước).
 */
import {
  STAGE_LABELS_BY_CATEGORY,
  stagesFor,
  type BomCategory,
} from "@iot/shared";
import { QTY_EPS, r4 } from "@/lib/pr-ledger";
import type { StageBuckets } from "@/lib/bom-stage-ledger";

/**
 * SL cần của dòng — ĐÚNG công thức cột "SL" của lưới BomGridPro:
 * metadata.totalQty (raw Excel, > 0) → qty_per_parent × target_qty của template.
 */
export function lineRequiredQty(
  metadata: unknown,
  qtyPerParent: unknown,
  targetQty: unknown,
): number {
  const md = (metadata ?? null) as { totalQty?: string | number } | null;
  const fromExcel = md?.totalQty != null ? Number(md.totalQty) : NaN;
  if (Number.isFinite(fromExcel) && fromExcel > 0) return r4(fromExcel);
  const q = (Number(qtyPerParent) || 0) * (Number(targetQty) || 0);
  return r4(q);
}

export interface JourneyStage {
  code: string;
  label: string;
  /** SL đang nằm ở bước này. */
  qty: number;
  /** SL đã tới bước này hoặc xa hơn (Σ bucket từ bước này trở đi). */
  reached: number;
  /** 0..100 — tỉ lệ reached/required. */
  pct: number;
}

export interface JourneyView {
  category: BomCategory;
  required: number;
  stages: JourneyStage[];
  /** Đã giao lắp ráp đủ SL cần. */
  full: boolean;
  /** SL nằm ở ≥ 2 bước (từng phần). */
  split: boolean;
  /** Các bước còn hàng, từ xa nhất → gần nhất (bỏ bước cuối khi chưa đủ chỉ nếu qty=0). */
  parts: Array<{ code: string; label: string; qty: number }>;
}

export function buildJourney(
  category: BomCategory,
  required: number,
  buckets: StageBuckets,
): JourneyView {
  const codes = stagesFor(category);
  const labels = STAGE_LABELS_BY_CATEGORY[category];
  const qtys = codes.map((c) => r4(buckets[c] ?? 0));
  const stages: JourneyStage[] = codes.map((code, i) => {
    let reached = 0;
    for (let j = i; j < codes.length; j++) reached += qtys[j]!;
    reached = r4(reached);
    const pct =
      required > 0 ? Math.max(0, Math.min(100, Math.round((reached / required) * 100))) : 0;
    return { code, label: labels[i]!, qty: qtys[i]!, reached, pct };
  });
  const last = stages[stages.length - 1]!;
  const full = required > 0 && last.qty >= required - QTY_EPS;
  const split = stages.filter((s) => s.qty > QTY_EPS).length >= 2;
  const parts = stages
    .filter((s) => s.qty > QTY_EPS)
    .map((s) => ({ code: s.code, label: s.label, qty: s.qty }))
    .reverse();
  return { category, required, stages, full, split, parts };
}

export type DefaultMove =
  | { ok: true; from: string; to: string; qty: number }
  | { ok: false; reason: string };

/**
 * Mặc định cho dialog chuyển bước: nguồn = bước xa nhất còn hàng và chưa ở cuối,
 * đích = bước kế tiếp, SL = toàn bộ SL đang có ở nguồn.
 */
export function defaultMove(category: BomCategory, buckets: StageBuckets): DefaultMove {
  const codes = stagesFor(category);
  for (let i = codes.length - 2; i >= 0; i--) {
    const q = r4(buckets[codes[i]!] ?? 0);
    if (q > QTY_EPS) return { ok: true, from: codes[i]!, to: codes[i + 1]!, qty: q };
  }
  const lastQty = r4(buckets[codes[codes.length - 1]!] ?? 0);
  return {
    ok: false,
    reason: lastQty > QTY_EPS ? "Đã giao lắp ráp hết, không còn hàng để chuyển" : "Chưa có hàng ở bước nào",
  };
}

/** Thông báo lỗi tiếng Việt cho các lý do canMove / sổ bước. */
export const STAGE_ERROR_MESSAGES: Record<string, string> = {
  BAD_QTY: "Số lượng phải lớn hơn 0.",
  BAD_STAGE: "Bước không thuộc loại hàng của dòng này.",
  SAME_STAGE: "Bước nguồn và bước đích phải khác nhau.",
  BACKWARD: "Không được chuyển lùi bước — dùng nút Đảo để sửa sai.",
  EXCEEDS_BUCKET: "Số lượng vượt quá số đang có ở bước nguồn.",
  NOT_FOUND: "Không tìm thấy dòng hoặc bút toán.",
  ALREADY_REVERSED: "Bút toán này đã được đảo rồi.",
  CANNOT_REVERSE: "Không thể đảo bút toán này.",
};

export function stageErrorMessage(code: string): string {
  return STAGE_ERROR_MESSAGES[code] ?? "Không chuyển được bước.";
}
