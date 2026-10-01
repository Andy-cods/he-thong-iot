import { redirect } from "next/navigation";

/**
 * V3 redesign — `/lot-serial` đã được gộp vào `/warehouse?tab=lot-serial`.
 * Detail page `/lot-serial/[id]` giữ nguyên cho deep-link.
 *
 * V4.4 D2-P0 — redirect TRƯỚC ĐÂY bỏ mất toàn bộ query string (VD `?itemId=`
 * từ nút "Xem đầy đủ tại Lot/Serial →" ở tab Kho trang chi tiết Vật tư) →
 * user bị đá ra danh sách KHÔNG lọc gì thay vì đúng vật tư đang xem. Giữ lại
 * `itemId` khi chuyển tiếp (xem thêm `app/(app)/warehouse/page.tsx`).
 */
interface LotSerialListPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default function LotSerialListPage({
  searchParams,
}: LotSerialListPageProps) {
  const itemId =
    typeof searchParams.itemId === "string" ? searchParams.itemId : undefined;
  redirect(
    itemId
      ? `/warehouse?tab=lot-serial&itemId=${encodeURIComponent(itemId)}`
      : "/warehouse?tab=lot-serial",
  );
}
