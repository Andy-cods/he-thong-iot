import { redirect } from "next/navigation";

// V1.7-beta — sub-route permalink redirect (xem orders/page.tsx).
export default function BomWorkspaceEcoRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/bom/${params.id}/grid?panel=eco&autoOpen=1`);
}
