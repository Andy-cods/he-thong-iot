import { redirect } from "next/navigation";

// V1.7-beta — history open trong right drawer (không panel bottom vì timeline
// dài hợp drawer hơn — brainstorm §5).
export default function BomWorkspaceHistoryRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/bom/${params.id}/grid?drawer=history`);
}
