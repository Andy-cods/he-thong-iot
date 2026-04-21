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
export default async function BomWorkspaceRoot({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/bom/${id}/grid`);
}
