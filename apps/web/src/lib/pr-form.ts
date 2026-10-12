/**
 * Tiện ích dùng chung cho 2 form Đề xuất vật tư (DNVT + MRF): format số kiểu VN,
 * validate dòng vật tư, bộ phận mặc định.
 */

/** Bỏ đuôi thập phân thừa của chuỗi số từ DB: "2.500000" → "2.5", "1500000.00" → "1500000". */
export function normalizeNumStr(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  return s.includes(".") ? s.replace(/\.?0+$/, "") || "0" : s;
}

/** Chuỗi canonical ("1500000.5") → hiển thị VN ("1.500.000,5"). */
export function formatVnNumberText(canonical: string): string {
  if (!canonical) return "";
  const [int = "", dec] = canonical.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec === undefined ? grouped : `${grouped},${dec}`;
}

/** Text người dùng gõ ("1.500.000,5") → canonical ("1500000.5"); bỏ ký tự lạ, tối đa `maxDecimals` số lẻ. */
export function parseVnNumberText(text: string, maxDecimals: number): string {
  const cleaned = text.replace(/[^\d,]/g, "");
  const idx = cleaned.indexOf(",");
  if (idx === -1) return cleaned.replace(/^0+(?=\d)/, "");
  const int = cleaned.slice(0, idx).replace(/^0+(?=\d)/, "") || "0";
  const dec = cleaned.slice(idx + 1).replace(/,/g, "").slice(0, maxDecimals);
  return maxDecimals === 0 ? int : `${int}.${dec}`;
}

export interface PrLineLike {
  item: unknown | null;
  specification: string;
  qty: string;
  neededBy: string;
  deliveryDate?: string;
  notes: string;
  referenceCode: string;
  estimatedUnitPrice?: string;
}

/** Dòng còn nguyên trạng ban đầu (chưa nhập gì) → bỏ qua, không báo lỗi. */
export function isPristineLine(l: PrLineLike): boolean {
  return (
    !l.item &&
    !l.specification.trim() &&
    !l.notes.trim() &&
    !l.referenceCode.trim() &&
    !l.neededBy &&
    !(l.deliveryDate ?? "") &&
    !(l.estimatedUnitPrice ?? "") &&
    (l.qty === "" || l.qty === "1")
  );
}

export interface LineError {
  localId: string;
  /** Số thứ tự dòng (1-based) trong form. */
  row: number;
  message: string;
}

/** Trả danh sách lỗi theo dòng (tiếng Việt, nêu rõ "Dòng X"). `today` dạng yyyy-MM-dd. */
export function validatePrLines<T extends PrLineLike & { localId: string }>(
  lines: T[],
  today: string,
): LineError[] {
  const errors: LineError[] = [];
  lines.forEach((l, i) => {
    if (isPristineLine(l)) return;
    const row = i + 1;
    const push = (message: string) => errors.push({ localId: l.localId, row, message });
    if (!l.item) {
      push(`Dòng ${row} chưa chọn vật tư`);
      return;
    }
    const q = Number(l.qty);
    if (!(q > 0)) {
      push(`Dòng ${row}: số lượng phải lớn hơn 0`);
      return;
    }
    if (l.neededBy && l.neededBy < today) {
      push(`Dòng ${row}: ngày cần không được ở quá khứ`);
      return;
    }
    if (l.deliveryDate && l.deliveryDate < today) {
      push(`Dòng ${row}: ngày giao hàng không được ở quá khứ`);
    }
  });
  return errors;
}

/**
 * A16 — khi bấm Gửi mà không có dòng hợp lệ nào: tô đỏ đúng dòng thiếu
 * (dòng chưa chọn vật tư / SL không dương), kể cả dòng còn nguyên trạng.
 */
export function missingLineErrors<T extends PrLineLike & { localId: string }>(
  lines: T[],
): LineError[] {
  const errors: LineError[] = [];
  lines.forEach((l, i) => {
    const row = i + 1;
    if (!l.item) errors.push({ localId: l.localId, row, message: `Dòng ${row} chưa chọn vật tư` });
    else if (!(Number(l.qty) > 0))
      errors.push({ localId: l.localId, row, message: `Dòng ${row}: số lượng phải lớn hơn 0` });
  });
  return errors;
}

/**
 * A19 — các dòng trùng vật tư (cùng item.id). Map localId -> số dòng (1-based)
 * của dòng đầu đã dùng vật tư đó (chỉ chứa dòng thứ 2 trở đi). Chỉ cảnh báo.
 */
export function duplicateItemLines<T extends { localId: string; item: unknown | null }>(
  lines: T[],
): Map<string, number> {
  const first = new Map<string, number>();
  const dup = new Map<string, number>();
  lines.forEach((l, i) => {
    const id = (l.item as { id?: string } | null)?.id;
    if (!id) return;
    const seen = first.get(id);
    if (seen === undefined) first.set(id, i + 1);
    else dup.set(l.localId, seen);
  });
  return dup;
}

/** Cuộn tới phần tử đầu tiên khớp selector và focus ô nhập đầu tiên bên trong. */
export function scrollToFirst(selector: string): void {
  if (typeof document === "undefined") return;
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    const focusable = el.matches("input,textarea,select,button")
      ? el
      : el.querySelector<HTMLElement>("input,textarea,select,button");
    focusable?.focus({ preventScroll: true });
  });
}

/** Bộ phận đề xuất mặc định (khi user không có role ứng với bộ phận nào) — dùng chung DNVT + MRF. */
export const DEFAULT_PROPOSING_DEPARTMENT = "Bộ phận Lắp ráp";

export function proposingDepartmentForRoles(roles: string[]): string | null {
  if (roles.includes("operator")) return "Bộ phận Lắp ráp";
  if (roles.includes("planner")) return "Bộ phận Thiết kế";
  if (roles.includes("warehouse")) return "Bộ phận Kho";
  if (roles.includes("purchaser")) return "Bộ phận Thu mua";
  if (roles.includes("qc")) return "Tổ QC/KCS";
  if (roles.includes("accountant")) return "Bộ phận Kế toán";
  return null;
}
