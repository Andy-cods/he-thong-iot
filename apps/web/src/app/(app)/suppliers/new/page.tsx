"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * V4.4 (N6) — route cũ giữ lại CHỈ để không vỡ bookmark/link cũ trỏ thẳng
 * `/suppliers/new`. Form tạo NCC giờ là Sheet trên trang danh sách (xem
 * `SuppliersTab.tsx` + `SupplierFormSheet.tsx`) thay vì điều hướng full-page
 * (vi phạm N6 — Supplier là 1 trong các thực thể nêu đích danh nên dùng
 * Sheet). Redirect sang `/suppliers?new=true` để `SuppliersTab` tự mở Sheet
 * (nuqs `parseAsBoolean` chỉ nhận "true"/"false", KHÔNG nhận "1"/"0").
 */
export default function NewSupplierPageRedirect() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace("/suppliers?new=true");
  }, [router]);
  return null;
}
