import { redirect } from "next/navigation";

/**
 * V3 redesign — `/orders` (list) đã bị gỡ khỏi sidebar; logic đơn hàng được
 * gộp vào BOM detail (xem `/bom/[id]`). Detail page `/orders/[code]` GIỮ
 * NGUYÊN cho BOM detail tái sử dụng.
 */
export default function OrdersListPage() {
  redirect("/bom");
}
