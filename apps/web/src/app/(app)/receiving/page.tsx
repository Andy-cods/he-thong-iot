import { redirect } from "next/navigation";

/**
 * V3 redesign — `/receiving` đã được gộp vào `/warehouse?tab=receiving`.
 * Detail page `/receiving/[poId]` (form đơn giản) và `/receiving/[poId]/wizard`
 * giữ nguyên cho thao tác nhận hàng thực tế (nhập tay/máy quét HID).
 */
export default function ReceivingHubPage() {
  redirect("/warehouse?tab=receiving");
}
