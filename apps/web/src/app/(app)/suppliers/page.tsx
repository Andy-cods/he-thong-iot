import { redirect } from "next/navigation";

/**
 * V3 (TASK-20260427-025) — `/suppliers` đã gộp vào `/sales?tab=suppliers`.
 * Detail page `/suppliers/[id]` giữ nguyên.
 *
 * V4.4 (N6) — chuyển tiếp NGUYÊN VẸN mọi query param khác (VD `?new=true` từ
 * route cũ `/suppliers/new` để tự mở Sheet tạo NCC) thay vì bỏ hết — trước
 * đây redirect cứng không giữ param nào, âm thầm làm mất bất kỳ deep-link
 * nào thêm vào `/suppliers?...`.
 */
export default function SuppliersListRedirect({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else qs.append(key, value);
  }
  qs.set("tab", "suppliers");
  redirect(`/sales?${qs.toString()}`);
}
