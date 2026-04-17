import Link from "next/link";
import { cookies } from "next/headers";
import {
  AlertTriangle,
  FileSpreadsheet,
  Package,
  PackageMinus,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import { KpiCard } from "@/components/domain/KpiCard";
import {
  OrdersReadinessTable,
  generateMockOrders,
} from "@/components/domain/OrdersReadinessTable";
import {
  AlertsList,
  generateMockAlerts,
} from "@/components/domain/AlertsList";
import { SystemHealthCard } from "@/components/domain/SystemHealthCard";

export const dynamic = "force-dynamic";

/**
 * V2 `/` Dashboard (design-spec §2.2) — compact KPI + readiness table.
 *
 * Delta V1: greeting 30→20px, KPI row gap-4→3, content grid 2-col lg (table
 * span-2 + Alerts/Health stack), quick links cards 48px height. Icon prop
 * truyền JSX element qua RSC→Client boundary (fix bug "N is not a function" V1).
 *
 * Mock V1 — TODO V1.1 thay generator bằng fetch `/api/dashboard/overview`.
 */
export default async function DashboardPage() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  const payload = token ? await verifyAccessToken(token) : null;
  const username = payload?.usr ?? "Người dùng";

  const orders = generateMockOrders();
  const alerts = generateMockAlerts();

  return (
    <div className="flex flex-col gap-5">
      {/* Greeting */}
      <section>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Xin chào, {username}
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Tổng quan xưởng · mock V1
        </p>
      </section>

      {/* KPI Row */}
      <section
        aria-label="Chỉ số quan trọng"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          label="SKU hoạt động"
          value={124}
          status="info"
          icon={<Package className="h-3.5 w-3.5" aria-hidden="true" />}
          href="/items"
          delta={{ value: 3, direction: "up", label: "vs tuần trước" }}
        />
        <KpiCard
          label="PO chờ nhận"
          value={8}
          status="warning"
          icon={<Truck className="h-3.5 w-3.5" aria-hidden="true" />}
          delta={{ value: 2, direction: "up", label: "trong 7 ngày" }}
        />
        <KpiCard
          label="WO đang chạy"
          value={5}
          status="success"
          icon={
            <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
          }
          delta={{ value: 0, direction: "flat" }}
        />
        <KpiCard
          label="Cảnh báo tồn kho"
          value={7}
          status="danger"
          icon={<PackageMinus className="h-3.5 w-3.5" aria-hidden="true" />}
          href="/items?filter=low-stock"
          delta={{ value: 2, direction: "down", label: "vs hôm qua" }}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickLink
            href="/items/new"
            icon={<Package className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Tạo vật tư mới"
            description="Thêm SKU vào danh mục"
          />
          <QuickLink
            href="/items/import"
            icon={
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            }
            title="Nhập Excel"
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
        Dữ liệu KPI/đơn hàng/cảnh báo đang là mock V1 · module Orders sẽ cung
        cấp dữ liệu thật ở V1.1.
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
