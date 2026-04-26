import { redirect } from "next/navigation";

/**
 * V3 redesign — `/items` đã được gộp vào `/warehouse?tab=items`.
 * Trang gốc giữ lại logic ở `components/items/*` để `/warehouse` tái sử dụng.
 */
export default function ItemsPage() {
  redirect("/warehouse?tab=items");
}
