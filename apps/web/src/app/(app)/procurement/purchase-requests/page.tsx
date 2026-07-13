import { Suspense } from "react";
import { PRTab } from "@/components/engineering/PRTab";

export const dynamic = "force-dynamic";

/**
 * V3.9 — `/procurement/purchase-requests` là trang DANH SÁCH độc lập cho menu
 * "Đề xuất vật tư" (mọi role trừ display). Trước đây redirect về
 * `/engineering?tab=pr` — nhưng qc/accountant KHÔNG có hub Thiết kế, và
 * pathname có query khiến sidebar không highlight active. Render thẳng PRTab
 * (component tự đứng độc lập: header + filter + list + nút "Tạo đề xuất vật tư").
 */
export default function PurchaseRequestsListPage() {
  return (
    <Suspense fallback={null}>
      <PRTab />
    </Suspense>
  );
}
