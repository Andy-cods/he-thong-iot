import { redirect } from "next/navigation";

// V1.7-beta — sub-route permalink. Redirect sang grid với panel auto-open
// để giữ bookmark/deep link cũ không vỡ (brainstorm §2 Pattern B).
export default function BomWorkspaceOrdersRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/bom/${params.id}/grid?panel=orders&autoOpen=1`);
}
