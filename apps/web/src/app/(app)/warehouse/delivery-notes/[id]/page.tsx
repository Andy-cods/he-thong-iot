import { redirect } from "next/navigation";

/**
 * Link cũ trong thông báo BBGH (`/warehouse/delivery-notes/{id}`) — trước đây
 * trỏ tới trang không tồn tại (404). Giữ route để thông báo đã gửi vẫn mở được.
 */
export default function DeliveryNoteLegacyRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/warehouse?tab=delivery-notes&dn=${encodeURIComponent(params.id)}`);
}
