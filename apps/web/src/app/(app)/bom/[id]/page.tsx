import { redirect } from "next/navigation";

/**
 * V1.7 — BOM workspace default entry redirect sang Grid Editor.
 *
 * User feedback: "design để bảng grid như này là mặc định, redesign lại để
 * nhìn sao cho nó đẹp và trông chuyên nghiệp hơn".
 *
 * Giữ đường truy cập Tree view qua `/bom/[id]/tree` (ContextualSidebar
 * item "Cây linh kiện").
 */
// Next 14.2 dùng params sync (không Promise như Next 15).
export default function BomWorkspaceRoot({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/bom/${params.id}/grid`);
}
