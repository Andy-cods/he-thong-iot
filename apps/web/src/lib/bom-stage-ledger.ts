/**
 * Sổ bước BOM (V5 WP0) — hàm thuần, không IO (kiểu pr-ledger.ts).
 * bucket(s) = Σ vào s − Σ ra s; dòng mới: toàn bộ SL cần nằm ở bước 0.
 * Quyết định chốt: KHÔNG cho tổng vượt SL cần (không có cờ cho phép).
 */
import { stagesFor, stageIndex, type BomCategory } from "@iot/shared";
import { QTY_EPS, r4 } from "@/lib/pr-ledger";

export interface StageMove {
  from: string;
  to: string;
  qty: number;
}

export type StageBuckets = Record<string, number>;

/** requiredQty = qty_per_parent × số bộ. Move có bước lạ bị bỏ qua. */
export function buildStageBuckets(
  category: BomCategory,
  requiredQty: number,
  moves: readonly StageMove[],
): StageBuckets {
  const stages = stagesFor(category);
  const b: StageBuckets = {};
  for (const s of stages) b[s] = 0;
  b[stages[0]!] = Number.isFinite(requiredQty) && requiredQty > 0 ? requiredQty : 0;
  for (const m of moves) {
    if (!(m.from in b) || !(m.to in b) || !Number.isFinite(m.qty)) continue;
    b[m.from] = b[m.from]! - m.qty;
    b[m.to] = b[m.to]! + m.qty;
  }
  for (const s of stages) b[s] = r4(b[s]!);
  return b;
}

export type CanMoveResult =
  | { ok: true }
  | { ok: false; reason: "BAD_QTY" | "BAD_STAGE" | "SAME_STAGE" | "BACKWARD" | "EXCEEDS_BUCKET" };

/**
 * Cho phép chuyển qty từ `from` sang `to`:
 * - qty > 0; from/to thuộc category; from ≠ to
 * - tiến (to > from); lùi chỉ khi isReversal=true (bút toán đảo)
 * - qty ≤ bucket(from) + EPS (không vượt → tổng không bao giờ vượt SL cần)
 */
export function canMove(
  category: BomCategory,
  buckets: StageBuckets,
  from: string,
  to: string,
  qty: number,
  opts: { isReversal?: boolean } = {},
): CanMoveResult {
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: "BAD_QTY" };
  const fi = stageIndex(category, from);
  const ti = stageIndex(category, to);
  if (fi < 0 || ti < 0) return { ok: false, reason: "BAD_STAGE" };
  if (fi === ti) return { ok: false, reason: "SAME_STAGE" };
  if (ti < fi && !opts.isReversal) return { ok: false, reason: "BACKWARD" };
  if (qty > (buckets[from] ?? 0) + QTY_EPS) return { ok: false, reason: "EXCEEDS_BUCKET" };
  return { ok: true };
}
