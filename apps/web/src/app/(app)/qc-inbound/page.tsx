import { redirect } from "next/navigation";

/**
 * V4.3 mục 4.3 — gộp màn: `/qc-inbound` trùng chức năng với tab "Chờ QC"
 * trong Kho › Nhập/Xuất kho (`QcPendingView` dùng chung). Giữ route này CHỈ để
 * không 404 với link/bookmark cũ — chuyển thẳng sang
 * `/warehouse?tab=movement&mode=qc`. Nav role `qc` đã trỏ thẳng chỗ mới
 * (`lib/nav-items.ts`); route-guard `/warehouse` đã mở thêm role `qc`.
 */
export default function QcInboundRedirectPage() {
  redirect("/warehouse?tab=movement&mode=qc");
}
