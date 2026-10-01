import { cookies } from "next/headers";
import type { Role } from "@iot/shared";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import {
  WAREHOUSE_TABS,
  WarehouseTabsNav,
  type WarehouseTab,
} from "@/components/warehouse/WarehouseTabsNav";
import { TodayInboxTab } from "@/components/warehouse/TodayInboxTab";
import { WarehouseLayoutTab } from "@/components/warehouse/WarehouseLayoutTab";
import { ItemsTab } from "@/components/warehouse/ItemsTab";
import { MovementTab } from "@/components/warehouse/MovementTab";
// Import helper thuần từ file KHÔNG có "use client" — import từ MovementTab
// (client component) sẽ nhận stub và ném TypeError lúc render server.
import { resolveMovementMode } from "@/components/warehouse/movement-mode";
import { DeliveryNotesTab } from "@/components/warehouse/DeliveryNotesTab";
import { GoodsIssuesTab } from "@/components/warehouse/GoodsIssuesTab";
import { ReportTab } from "@/components/warehouse/ReportTab";
import { StocktakeTab } from "@/components/warehouse/StocktakeTab";

/**
 * V4.3 Đợt 2 mục 6 — vai `qc` vào `/warehouse` (route-guard cho phép, xem
 * `lib/route-guard.ts`) chỉ có quyền RBAC trên entity `item` (Vật tư) và
 * `qcInspection` (mode "qc" trong Nhập/Xuất kho) — KHÔNG có `inventory`
 * (Việc cần làm hôm nay + Sơ đồ kho gọi `read:inventory` → 403),
 * `goodsIssue` (Phiếu xuất kho), `deliveryNote` (Phiếu giao hàng) hay quyền
 * cho Báo cáo kho. Ẩn 5 tab còn lại thay vì để qc bấm vào rồi ăn lỗi quyền.
 */
const QC_ONLY_VISIBLE_TABS: ReadonlyArray<WarehouseTab> = ["items", "movement"];

async function getRolesFromCookie(): Promise<Role[]> {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return [];
  const payload = await verifyAccessToken(token);
  return payload?.roles ?? [];
}

export const dynamic = "force-dynamic";

/**
 * V4.1 (Wave 5 Phase A) — `/warehouse` Quản lí kho unified.
 *
 * Server Component wrapper:
 *   1. Đọc `searchParams.tab` (default = 'layout') + `searchParams.mode` (chỉ
 *      áp dụng cho tab `movement`, "in" | "out").
 *   2. Render breadcrumb + tabs nav (server).
 *   3. Switch render đúng tab component (client component).
 *
 * Tabs:
 *   - `layout`    — Sơ đồ kho
 *   - `items`     — Danh mục vật tư (re-use logic /items cũ)
 *   - `movement`  — Nhập / Xuất kho (gộp `receiving` + `issue` cũ — Wave 5 Phase A)
 *   - `goods-issues` — Phiếu xuất kho PX (V4.1 Đợt 1b; `?id=` mở sẵn 1 phiếu)
 *   - `stocktake` — Kiểm kê kho (TASK-6VIEC Việc 4; `?id=` mở sẵn 1 phiên)
 *   - `report`    — Báo cáo kho
 *
 * Backward-compat: `?tab=receiving` → movement&mode=in, `?tab=issue`/`picking`
 * → movement&mode=out, `?tab=overview` → layout, `?tab=lot-serial` → items,
 * `?tab=report&stocktake=<id>` (thông báo gửi trước TASK-6VIEC Việc 4) →
 * `stocktake` (tab mới) giữ nguyên `<id>`.
 */

interface WarehousePageProps {
  searchParams: { tab?: string; mode?: string } & Record<string, string | string[] | undefined>;
}

function resolveTab(raw: string | undefined): WarehouseTab {
  // V4.3 mục 3 — không truyền ?tab= → mặc định "today" (Việc cần làm hôm nay),
  // thay "layout" (Sơ đồ kho) — link cũ `?tab=layout` vẫn chạy bình thường.
  if (!raw) return "today";
  // Backward compat: ?tab=overview → "layout" (Tổng quan đã thay bằng Sơ đồ kho)
  if (raw === "overview") return "layout";
  // V3.7.7 — picking tab renamed → issue; Wave 5 Phase A — issue/receiving gộp movement
  if (raw === "picking" || raw === "issue" || raw === "receiving") return "movement";
  // V3.7.8 — lot-serial gộp vào items (xem chi tiết qua drawer item)
  if (raw === "lot-serial") return "items";
  const found = WAREHOUSE_TABS.find((t) => t.key === raw);
  return found ? found.key : "today";
}

export default async function WarehousePage({ searchParams }: WarehousePageProps) {
  const roles = await getRolesFromCookie();
  const isQcOnly = roles.includes("qc") && !roles.includes("admin") && !roles.includes("warehouse");
  const visibleTabs = isQcOnly
    ? WAREHOUSE_TABS.filter((t) => QC_ONLY_VISIBLE_TABS.includes(t.key))
    : WAREHOUSE_TABS;

  let active = resolveTab(searchParams.tab);
  // TASK-6VIEC Việc 4 — link cũ `?tab=report&stocktake=<id>` (thông báo đã
  // gửi trước khi tách "Kiểm kê" thành tab riêng) phải vẫn mở đúng tab mới.
  if (active === "report" && typeof searchParams.stocktake === "string") {
    active = "stocktake";
  }
  // V4.3 Đợt 2 mục 6 — qc bookmark/gõ tay ?tab= một tab đã ẩn (VD "today",
  // "layout") → rơi về "movement" (tab mặc định của vai qc) thay vì render
  // component rồi ăn lỗi 403 từ API.
  if (isQcOnly && !visibleTabs.some((t) => t.key === active)) {
    active = "movement";
  }
  // Backward-compat: ?tab=issue/picking (không có mode) → mặc định mode=out.
  const legacyOutMode = searchParams.tab === "issue" || searchParams.tab === "picking";
  // qc không truyền ?mode= → mặc định "qc" (hàng chờ QC kết luận), tránh rơi
  // vào mode "in" mặc định chung (ReceivingMovementView cần quyền qc không có).
  const defaultMode = isQcOnly ? "qc" : legacyOutMode ? "out" : undefined;
  const mode = resolveMovementMode(searchParams.mode ?? defaultMode);
  // V4.4 D2-P0 — `?itemId=` deep-link (nút "Xem đầy đủ tại Lot/Serial →" ở tab
  // Kho trang chi tiết Vật tư, qua `/lot-serial?itemId=` redirect ở trên, hoặc
  // link thẳng `/warehouse?tab=items&itemId=`) → mở sẵn sheet chi tiết đúng
  // vật tư trong ItemsTab thay vì rơi vào danh sách KHÔNG lọc gì.
  const initialItemId =
    typeof searchParams.itemId === "string" ? searchParams.itemId : undefined;

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden">
      {/* V4.3 Đợt 2 mục 1 — tiêu đề Large Title BARE trên nền trang xám
          (không còn panel trắng viền dính vào tabs/nội dung bên dưới). */}
      <div className="px-4 pb-2 pt-5 md:px-6 md:pt-6">
        {/* V4.1 UI-09 (X6): bỏ breadcrumb thân trang — topbar đã hiện cùng đường dẫn (+ nhãn tab). */}
        {/* V4.4 A8 — "Quản lí" → "Quản lý" cho nhất quán chính tả toàn hệ
            thống (các trang khác dùng "Quản lý", VD "Quản trị hệ thống"). */}
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Quản lý kho
        </h1>
        <p className="mt-0.5 text-base text-zinc-500 dark:text-zinc-400">
          {/* V4.4 A7 — "bin" tiếng Anh → "ô/kệ". */}
          Trang gộp Vật tư · Nhập/Xuất kho · Sơ đồ vị trí ô kệ.
        </p>
      </div>

      <WarehouseTabsNav active={active} tabs={visibleTabs} />

      <div className="flex-1 md:min-h-0 md:overflow-auto">
        {active === "today" ? (
          <TodayInboxTab />
        ) : active === "layout" ? (
          <WarehouseLayoutTab />
        ) : active === "items" ? (
          <ItemsTab initialItemId={initialItemId} />
        ) : active === "movement" ? (
          <MovementTab mode={mode} />
        ) : active === "goods-issues" ? (
          <GoodsIssuesTab />
        ) : active === "delivery-notes" ? (
          <DeliveryNotesTab />
        ) : active === "stocktake" ? (
          <StocktakeTab />
        ) : (
          <ReportTab />
        )}
      </div>
    </div>
  );
}
