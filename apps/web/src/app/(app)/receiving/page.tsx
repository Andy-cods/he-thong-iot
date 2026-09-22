import { redirect } from "next/navigation";

/**
 * Wave 5 Phase A — `/receiving` đã được gộp vào `/warehouse?tab=movement&mode=in`.
 * Detail page `/receiving/[poId]` (redirect vào wizard — Phase B) và
 * `/receiving/[poId]/wizard` giữ nguyên cho thao tác nhận hàng thực tế
 * (nhập tay/máy quét HID).
 */
export default function ReceivingHubPage() {
  redirect("/warehouse?tab=movement&mode=in");
}
