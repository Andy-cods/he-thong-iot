import { redirect } from "next/navigation";
import { hiddenRouteRedirect } from "@/lib/hidden-features";

/**
 * V4.1 D10 — Lắp ráp kiểu cũ đang TẠM ẨN cùng Đơn hàng bán. Workspace
 * `/assembly/[woId]` chuyển sang trang chi tiết lệnh SX (tab Tiến độ) của đúng
 * lệnh đó — link cũ không 404, không mất ngữ cảnh. Code trang giữ nguyên.
 */
export default function AssemblyWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { woId: string };
}) {
  const to = hiddenRouteRedirect(`/assembly/${params.woId}`);
  if (to) redirect(to);
  return <>{children}</>;
}
