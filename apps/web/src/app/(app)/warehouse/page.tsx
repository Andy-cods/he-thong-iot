import { Breadcrumb } from "@/components/ui/breadcrumb";
import {
  WAREHOUSE_TABS,
  WarehouseTabsNav,
  type WarehouseTab,
} from "@/components/warehouse/WarehouseTabsNav";
import { WarehouseLayoutTab } from "@/components/warehouse/WarehouseLayoutTab";
import { ItemsTab } from "@/components/warehouse/ItemsTab";
import { MovementTab } from "@/components/warehouse/MovementTab";
// Import helper thuần từ file KHÔNG có "use client" — import từ MovementTab
// (client component) sẽ nhận stub và ném TypeError lúc render server.
import { resolveMovementMode } from "@/components/warehouse/movement-mode";
import { DeliveryNotesTab } from "@/components/warehouse/DeliveryNotesTab";
import { GoodsIssuesTab } from "@/components/warehouse/GoodsIssuesTab";
import { ReportTab } from "@/components/warehouse/ReportTab";

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
 *   - `report`    — Báo cáo kho
 *
 * Backward-compat: `?tab=receiving` → movement&mode=in, `?tab=issue`/`picking`
 * → movement&mode=out, `?tab=overview` → layout, `?tab=lot-serial` → items.
 */

interface WarehousePageProps {
  searchParams: { tab?: string; mode?: string } & Record<string, string | string[] | undefined>;
}

function resolveTab(raw: string | undefined): WarehouseTab {
  // Backward compat: ?tab=overview → "layout" (Tổng quan đã thay bằng Sơ đồ kho)
  if (raw === "overview") return "layout";
  // V3.7.7 — picking tab renamed → issue; Wave 5 Phase A — issue/receiving gộp movement
  if (raw === "picking" || raw === "issue" || raw === "receiving") return "movement";
  // V3.7.8 — lot-serial gộp vào items (xem chi tiết qua drawer item)
  if (raw === "lot-serial") return "items";
  const found = WAREHOUSE_TABS.find((t) => t.key === raw);
  return found ? found.key : "layout";
}

export default function WarehousePage({ searchParams }: WarehousePageProps) {
  const active = resolveTab(searchParams.tab);
  // Backward-compat: ?tab=issue/picking (không có mode) → mặc định mode=out.
  const legacyOutMode = searchParams.tab === "issue" || searchParams.tab === "picking";
  const mode = resolveMovementMode(searchParams.mode ?? (legacyOutMode ? "out" : undefined));
  const tabLabel =
    WAREHOUSE_TABS.find((t) => t.key === active)?.label ?? "Sơ đồ kho";

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden">
      <div className="border-b border-zinc-200 bg-white px-4 pb-3 pt-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <Breadcrumb
          items={[
            { label: "Tổng quan", href: "/" },
            { label: "Kho", href: "/warehouse" },
            { label: tabLabel },
          ]}
        />
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Quản lí kho
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Trang gộp Vật tư · Nhập/Xuất kho · Sơ đồ vị trí kệ/bin.
        </p>
      </div>

      <WarehouseTabsNav active={active} />

      <div className="flex-1 md:min-h-0 md:overflow-auto">
        {active === "layout" ? (
          <WarehouseLayoutTab />
        ) : active === "items" ? (
          <ItemsTab />
        ) : active === "movement" ? (
          <MovementTab mode={mode} />
        ) : active === "goods-issues" ? (
          <GoodsIssuesTab />
        ) : active === "delivery-notes" ? (
          <DeliveryNotesTab />
        ) : (
          <ReportTab />
        )}
      </div>
    </div>
  );
}
