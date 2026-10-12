/** Định dạng số lượng kiểu VN (tối đa 4 số lẻ) cho hộp thoại Kho kiểm tồn / cột Tồn kho. */
export function fmtNumVN(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
}
