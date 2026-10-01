/**
 * TASK-6VIEC Việc 5 — "Cảnh báo khi sửa BOM đang có Lệnh SX dùng tới".
 *
 * Hàm THUẦN (không gọi DB/API) build câu cảnh báo tiếng Việt từ kết quả
 * `GET /api/bom/templates/[id]/lines/[lid]/wo-impact` (xem
 * `useBomLineWoImpact` trong `hooks/useBom.ts`). Dùng chung cho
 * `BomLineSheet.tsx` (sửa dòng) + `BomGridPro.tsx` (xoá dòng) — cả 2 chỉ
 * CẢNH BÁO + xin xác nhận, KHÔNG chặn hành động.
 */

export interface BomEditWoWarningImpact {
  /** Tổng số lệnh SX chưa hoàn thành bị ảnh hưởng. */
  count: number;
  /** Danh sách lệnh (có thể bị cắt bớt — xem `getActiveWosForBomEdit`). */
  wos: ReadonlyArray<{ woNo: string }>;
}

/** Tối đa liệt kê bao nhiêu mã lệnh SX trong câu cảnh báo trước khi gộp "và N lệnh khác". */
const MAX_WO_NAMES_SHOWN = 5;

/**
 * Trả câu cảnh báo, hoặc `null` nếu không có lệnh SX nào bị ảnh hưởng (không
 * cần hỏi xác nhận — hành vi hiện tại giữ nguyên).
 */
export function buildBomEditWoWarning(
  impact: BomEditWoWarningImpact,
): string | null {
  if (!impact || impact.count <= 0) return null;

  const shown = impact.wos.slice(0, MAX_WO_NAMES_SHOWN).map((w) => w.woNo);
  const extra = impact.count - shown.length;
  const list =
    shown.length === 0
      ? `${impact.count} lệnh`
      : extra > 0
        ? `${shown.join(", ")} và ${extra} lệnh khác`
        : shown.join(", ");

  return `Đang có ${impact.count} lệnh SX dùng BOM này: ${list}. Vẫn tiếp tục?`;
}
