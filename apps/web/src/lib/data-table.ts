/**
 * V4.1 UI-11..14 (Đợt 6C, X4) — lõi THUẦN của chuẩn bảng `components/ui/data-table`.
 * Tách riêng để test bằng vitest (không React).
 */

/** Loại cột quyết định canh lề + kiểu chữ. */
export type ColumnKind = "text" | "code" | "number" | "money" | "date" | "status" | "actions";

/**
 * Vai trò cột ở dạng THẺ trên điện thoại (< md):
 *  - primary   → dòng 1 bên trái (mã/tên)
 *  - status    → dòng 1 bên phải (pill trạng thái)
 *  - secondary → lưới nhãn : giá trị bên dưới
 *  - actions   → góc phải thẻ (menu ⋯)
 *  - hide      → không hiện trên điện thoại
 */
export type MobileRole = "primary" | "status" | "secondary" | "actions" | "hide";

export interface ColumnLayoutInput {
  id: string;
  kind?: ColumnKind;
  mobile?: MobileRole;
}

/** Số / tiền canh phải + tabular-nums; hành động canh phải; còn lại canh trái. */
export function alignForKind(kind: ColumnKind | undefined): "left" | "right" | "center" {
  switch (kind) {
    case "number":
    case "money":
    case "actions":
      return "right";
    default:
      return "left";
  }
}

/** Lớp chữ cho ô theo loại cột (số dùng tabular-nums để các chữ số thẳng cột). */
export function cellClassForKind(kind: ColumnKind | undefined): string {
  switch (kind) {
    case "number":
    case "money":
      return "text-right tabular-nums whitespace-nowrap";
    case "date":
      return "tabular-nums whitespace-nowrap";
    case "code":
      return "font-mono whitespace-nowrap";
    case "status":
      return "whitespace-nowrap";
    case "actions":
      return "text-right whitespace-nowrap";
    default:
      return "";
  }
}

/** Vai trò mặc định trên điện thoại khi cột không khai báo `mobile`. */
export function defaultMobileRole(kind: ColumnKind | undefined): MobileRole {
  if (kind === "actions") return "actions";
  if (kind === "status") return "status";
  return "secondary";
}

export interface MobileLayout<C> {
  primary: C[];
  status: C[];
  secondary: C[];
  actions: C[];
}

/**
 * Chia cột theo vai trò thẻ điện thoại. Nếu không cột nào là `primary`,
 * cột hiển thị đầu tiên (không phải status/actions) được đẩy lên làm primary
 * để thẻ luôn có tiêu đề.
 */
export function splitMobileColumns<C extends ColumnLayoutInput>(columns: readonly C[]): MobileLayout<C> {
  const out: MobileLayout<C> = { primary: [], status: [], secondary: [], actions: [] };
  for (const c of columns) {
    const role = c.mobile ?? defaultMobileRole(c.kind);
    if (role === "hide") continue;
    out[role].push(c);
  }
  if (out.primary.length === 0 && out.secondary.length > 0) {
    out.primary.push(out.secondary.shift() as C);
  }
  return out;
}

/** Tổng một cột số (bỏ qua null/NaN; chấp nhận chuỗi số từ API numeric). */
export function sumColumn<T>(rows: readonly T[], pick: (row: T) => number | string | null | undefined): number {
  let total = 0;
  for (const r of rows) {
    const v = pick(r);
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n)) total += n;
  }
  return total;
}

/**
 * Click vào hàng có mở chi tiết không? Bỏ qua khi người dùng bấm vào phần tử
 * tương tác bên trong (link, nút, ô nhập, menu) để không "mở nhầm".
 */
export function isInteractiveTarget(target: { closest?: (sel: string) => unknown } | null): boolean {
  if (!target || typeof target.closest !== "function") return false;
  return Boolean(
    target.closest(
      "a,button,input,select,textarea,label,[role='menuitem'],[role='checkbox'],[data-row-click='ignore']",
    ),
  );
}
