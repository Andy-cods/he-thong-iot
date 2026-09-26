/**
 * V4.1 AD-18 — trang chuyển hướng (route cũ → form mới) phải GIỮ query string,
 * nếu không dữ liệu điền sẵn (vd "Tạo lệnh SX" từ dòng BOM gửi ?note=…) bị mất.
 */
export type PageSearchParams = Record<string, string | string[] | undefined>;

export function withQuery(path: string, searchParams?: PageSearchParams): string {
  if (!searchParams) return path;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else q.append(k, v);
  }
  const qs = q.toString();
  if (!qs) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${qs}`;
}
