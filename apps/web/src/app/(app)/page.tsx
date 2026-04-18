"use client";

import Link from "next/link";
import {
  AlertTriangle,
  FileSpreadsheet,
  Network,
  Package,
  PackageMinus,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { KpiCard } from "@/components/domain/KpiCard";
import { OrdersReadinessTable } from "@/components/domain/OrdersReadinessTable";
import { AlertsList } from "@/components/domain/AlertsList";
import { SystemHealthCard } from "@/components/domain/SystemHealthCard";
import {
  generateMockOrders,
  generateMockAlerts,
} from "@/lib/dashboard-mocks";
import { useSession } from "@/hooks/useSession";
import { useDashboardOverview } from "@/hooks/useDashboardOverview";

/**
 * V2 `/` Dashboard (design-spec §2.2) — compact KPI + readiness table.
 *
 * V1.1-beta: chuyển sang Client Component để tận dụng React Query cache
 * 60s cho `/api/dashboard/overview`. Middleware đã bảo vệ route nên không
 * cần verify cookie ở page. Nếu API fail (Redis/DB down) vẫn fallback mock.
 *
 * KPI thật:
 * - SKU hoạt động (activeItemsCount)
 * - BOM Templates (bomTemplatesCount)  — thay BomKpiCard cũ
 * - Nhà cung cấp (suppliersCount)      — thay "PO chờ nhận" mock
 *
 * KPI placeholder (còn mock, chờ V1.2):
 * - WO đang chạy (mock)
 * - Cảnh báo tồn kho (null → hiển thị "—" + badge V1.2)
 */
export default function DashboardPage() {
  const session = useSession();
  const username = session.data?.username ?? "Người dùng";

  const overview = useDashboardOverview();
  const data = overview.data;
  const loading = overview.isLoading;

  // Fallback mock nếu API lỗi (Redis/DB down) → giữ UX không vỡ.
  const orders = data?.recentOrdersMock ?? generateMockOrders();
  const alerts = data?.recentAlertsMock ?? generateMockAlerts();

  return (
    <div className="flex flex-col gap-5">
      {/* Greeting */}
      <section>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Xin chào, {username}
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Tổng quan xưởng · KPI thật (items/BOM/NCC) · Orders/Cảnh báo mock
        </p>
      </section>

      {/* KPI Row */}
      <section
        aria-label="Chỉ số quan trọng"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <KpiCard
          label="SKU hoạt động"
          value={data?.activeItemsCount ?? 0}
          status="info"
          icon={<Package className="h-3.5 w-3.5" aria-hidden="true" />}
          href="/items"
          loading={loading}
        />
        <KpiCard
          label="BOM Templates"
          value={data?.bomTemplatesCount ?? 0}
          status="info"
          icon={<Network className="h-3.5 w-3.5" aria-hidden="true" />}
          href="/bom"
          loading={loading}
          delta={{ value: 0, direction: "flat", label: "đang hoạt động" }}
        />
        <KpiCard
          label="Nhà cung cấp"
          value={data?.suppliersCount ?? 0}
          status="info"
          icon={<Truck className="h-3.5 w-3.5" aria-hidden="true" />}
          href="/suppliers"
          loading={loading}
        />
        <KpiCard
          label="WO đang chạy"
          value={5}
          status="neutral"
          icon={
            <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
          }
          delta={{ value: 0, direction: "flat", label: "mock · V1.3" }}
        />
        <KpiCard
          label="Cảnh báo tồn kho"
          value={data?.lowStockCount ?? "—"}
          status="neutral"
          icon={<PackageMinus className="h-3.5 w-3.5" aria-hidden="true" />}
          loading={loading}
          delta={{ value: 0, direction: "flat", label: "V1.2" }}
        />
      </section>

      {/* Content grid: table span-2 + Alerts/Health stack */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Đơn hàng sắp giao
            </h2>
            <Link
              href="/orders"
              className="text-xs text-blue-600 hover:underline"
              aria-disabled
            >
              Xem tất cả (V1.1) →
            </Link>
          </div>
          <OrdersReadinessTable orders={orders} />
        </div>

        <div className="flex flex-col gap-4">
          <AlertsList alerts={alerts} />
          <SystemHealthCard />
        </div>
      </section>

      {/* Quick links — compact 48px */}
      <section aria-label="Hành động nhanh">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Hành động nhanh
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <QuickLink
            href="/items/new"
            icon={<Package className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Tạo vật tư mới"
            description="Thêm SKU vào danh mục"
          />
          <QuickLink
            href="/bom/new"
            icon={<Network className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Tạo BOM mới"
            description="Template công thức sản xuất"
          />
          <QuickLink
            href="/bom/import"
            icon={
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            }
            title="Nhập BOM Excel"
            description="Upload multi-sheet .xlsx"
          />
          <QuickLink
            href="/items/import"
            icon={
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            }
            title="Nhập vật tư Excel"
            description="Upload hàng loạt từ file"
          />
          <QuickLink
            href="/items"
            icon={<Package className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Xem danh mục"
            description="Tìm kiếm và quản lý SKU"
          />
        </div>
      </section>

      {/* Mock disclaimer */}
      <p className="flex items-center gap-1.5 text-xs text-zinc-400">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Orders/Alerts/WO/Low-stock vẫn mock — sẽ có dữ liệu thật ở V1.1–V1.3.
      </p>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-12 items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 transition-colors duration-150 hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-zinc-900">{title}</p>
        <p className="truncate text-xs text-zinc-500">{description}</p>
      </div>
    </Link>
  );
}
