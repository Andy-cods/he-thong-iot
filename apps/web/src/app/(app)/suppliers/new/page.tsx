"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * V4.4 (N6) — route cũ giữ lại CHỈ để không vỡ bookmark/link cũ trỏ thẳng
 * `/suppliers/new`. Form tạo NCC giờ là Sheet trên trang danh sách (xem
 * `SuppliersTab.tsx` + `SupplierFormSheet.tsx`) thay vì điều hướng full-page
 * (vi phạm N6 — Supplier là 1 trong các thực thể nêu đích danh nên dùng
 * Sheet). Redirect THẲNG sang `/sales?tab=suppliers&new=true` (không qua
 * `/suppliers` — route đó tự redirect `/sales?tab=suppliers` và LÀM MẤT mọi
 * query param khác, xem `app/(app)/suppliers/page.tsx`) để `SuppliersTab` tự
 * mở Sheet. nuqs `parseAsBoolean` chỉ nhận "true"/"false", KHÔNG nhận "1"/"0".
 */
export default function NewSupplierPageRedirect() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace("/sales?tab=suppliers&new=true");
  }, [router]);
  return null;
}
