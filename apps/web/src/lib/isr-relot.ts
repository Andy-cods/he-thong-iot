/**
 * V4.4 (Việc 2) — "Chọn lại lô" khi duyệt Yêu cầu xuất kho (ISR) mà lô đã
 * khoá lúc tạo nay không còn đủ (người khác đã xuất bớt trong lúc chờ duyệt).
 *
 * THUẦN (không đụng DB) → test vitest riêng. Dùng ở API
 * `warehouse/issue-request/[id]/approve` khi Kho gửi kèm `picks` mới (từ gợi
 * ý FIFO `/api/warehouse/fifo-pick`) thay cho `picksJson` đã lưu lúc tạo.
 *
 * Nguyên tắc AN TOÀN: override CHỈ được đổi LÔ/BIN hoặc GIẢM số lượng, KHÔNG
 * được thêm mã hàng mới hay vượt số lượng đã xin ban đầu (tránh biến ISR
 * thành đường "xuất thêm" tuỳ ý ngoài phê duyệt gốc).
 */

export interface IsrPick {
  lotSerialId: string;
  lotCode?: string | null;
  binId: string;
  binCode?: string | null;
  qty: number;
}

export interface IsrPickLine {
  itemId: string;
  sku?: string | null;
  picks: IsrPick[];
}

const EPS = 1e-6;

export function sumPicksByItem(lines: IsrPickLine[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) {
    const sum = l.picks.reduce((s, p) => s + (Number(p.qty) || 0), 0);
    m.set(l.itemId, (m.get(l.itemId) ?? 0) + sum);
  }
  return m;
}

export interface IsrOverrideError {
  code: "UNKNOWN_ITEM" | "OVER_ORIGINAL_QTY" | "INVALID_QTY" | "EMPTY";
  message: string;
}

export type ValidateIsrOverrideResult =
  | {
      ok: true;
      /** true nếu tổng SL sau override < tổng SL gốc (cần lý do xuất 1 phần). */
      isPartial: boolean;
      totalOriginal: number;
      totalOverride: number;
    }
  | { ok: false; error: IsrOverrideError };

/**
 * Kiểm override picks khi duyệt lại ISR (chọn lô mới / xuất 1 phần):
 *  - mọi itemId trong override phải thuộc ISR gốc (không thêm mã hàng mới);
 *  - mọi qty > 0;
 *  - tổng SL override theo từng item KHÔNG được vượt tổng SL đã xin ban đầu
 *    của item đó (chỉ được giảm hoặc giữ nguyên, không được xin thêm).
 */
export function validateIsrOverridePicks(
  original: IsrPickLine[],
  override: IsrPickLine[],
): ValidateIsrOverrideResult {
  if (override.length === 0) {
    return { ok: false, error: { code: "EMPTY", message: "Chưa chọn lô nào để xuất." } };
  }
  const originalByItem = sumPicksByItem(original);
  const overrideByItem = sumPicksByItem(override);

  for (const line of override) {
    if (!originalByItem.has(line.itemId)) {
      return {
        ok: false,
        error: {
          code: "UNKNOWN_ITEM",
          message: `Mã hàng ${line.sku ?? line.itemId.slice(0, 8)} không thuộc yêu cầu gốc.`,
        },
      };
    }
    for (const p of line.picks) {
      if (!Number.isFinite(p.qty) || p.qty <= 0) {
        return { ok: false, error: { code: "INVALID_QTY", message: "Số lượng xuất phải lớn hơn 0." } };
      }
    }
  }

  for (const [itemId, overrideQty] of overrideByItem) {
    const originalQty = originalByItem.get(itemId) ?? 0;
    if (overrideQty > originalQty + EPS) {
      return {
        ok: false,
        error: {
          code: "OVER_ORIGINAL_QTY",
          message: `Không được xuất vượt số lượng đã xin ban đầu (${originalQty}).`,
        },
      };
    }
  }

  const totalOriginal = [...originalByItem.values()].reduce((s, v) => s + v, 0);
  const totalOverride = [...overrideByItem.values()].reduce((s, v) => s + v, 0);

  return {
    ok: true,
    isPartial: totalOverride + EPS < totalOriginal,
    totalOriginal,
    totalOverride,
  };
}
