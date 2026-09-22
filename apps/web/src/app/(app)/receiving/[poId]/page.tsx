import { redirect } from "next/navigation";

/**
 * Wave 5 Phase B — "Form đơn giản" (single-page) đã bị GỠ theo quyết định
 * hợp nhất 3 lối vào PO còn 1 (xem `plans/v4-finance/wave-5-warehouse-redesign.md`
 * §4.3). Route giữ lại (không xoá) để không 404 link/bookmark cũ — redirect
 * thẳng vào Wizard, là lối vào chính duy nhất cho desktop.
 */
export default function ReceivingDetailRedirectPage({
  params,
}: {
  params: { poId: string };
}) {
  redirect(`/receiving/${params.poId}/wizard`);
}
