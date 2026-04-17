import Link from "next/link";
import { cookies } from "next/headers";
import {
  AlertTriangle,
  FileSpreadsheet,
  Package,
  PackageMinus,
  Plus,
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
 * Direction B — `/` Dashboard (design-spec §2.2).
 *
 * RSC page:
 * - Greeting với username từ JWT cookie (layout đã verify nên chắc chắn có).
 * - 4 KpiCard (mock V1.0 — TODO V1.1 fetch `/api/dashboard/overview`).
 * - Grid: OrdersReadinessTable (col-span-2) + AlertsList + SystemHealthCard.
 * - Quick links section.
 *
 * Middleware + layout (app) đã auth check. Page này KHÔNG tự redirect —
 * nếu không có payload (edge case race condition), fallback hiển thị "Người
 * dùng".
 */
export default async function DashboardPage() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  const payload = token ? await verifyAccessToken(token) : null;
  const username = payload?.usr ?? "Người dùng";

  // Mock data V1. TODO V1.1: replace with `/api/dashboard/overview`.
  const orders = generateMockOrders();
  const alerts = generateMockAlerts();

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting */}
      <section>
        <h1 className="font-heading text-2xl font-bold text-slate-900 xl:text-3xl">
          Xin chào, {username}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Tổng quan hoạt động xưởng hôm nay · dữ liệu mock V1
        </p>
      </section>

      {/* KPI Row */}
      <section
        aria-label="Chỉ số quan trọng"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          label="SKU đang hoạt động"
          value={124}
          status="info"
          icon={<Package className="h-5 w-5" aria-hidden="true" />}
          href="/items"
          delta={{ value: 3, direction: "up", label: "vs tuần trước" }}
        />
        <KpiCard
          label="PO chờ nhận"
          value={8}
          status="warning"
          icon={<Truck className="h-5 w-5" aria-hidden="true" />}
          delta={{ value: 2, direction: "up", label: "trong 7 ngày" }}
        />
        <KpiCard
          label="WO đang chạy"
          value={5}
          status="success"
          icon={<ShoppingCart className="h-5 w-5" aria-hidden="true" />}
          delta={{ value: 0, direction: "flat" }}
        />
        <KpiCard
          label="Cảnh báo tồn kho"
          value={7}
          status="danger"
          icon={<PackageMinus className="h-5 w-5" aria-hidden="true" />}
          href="/items?filter=low-stock"
          delta={{ value: 2, direction: "down", label: "vs hôm qua" }}
        />
      </section>

      {/* Content grid */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Đơn hàng sắp giao
            </h2>
            <Link
              href="/orders"
              className="text-sm font-medium text-info-strong hover:underline"
              aria-disabled
            >
              Xem tất cả (V1.1)
            </Link>
          </div>
          <OrdersReadinessTable orders={orders} />
        </div>

        <div className="flex flex-col gap-4">
          <AlertsList alerts={alerts} />
          <SystemHealthCard />
        </div>
      </section>

      {/* Quick links */}
      <section aria-label="Hành động nhanh">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Hành động nhanh
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickLink
            href="/items/new"
            icon={Plus}
            title="Tạo vật tư mới"
            description="Thêm SKU vào danh mục"
          />
          <QuickLink
            href="/items/import"
            icon={FileSpreadsheet}
            title="Nhập Excel"
            description="Upload hàng loạt từ file"
          />
          <QuickLink
            href="/items"
            icon={Package}
            title="Xem danh mục"
            description="Tìm kiếm và quản lý SKU"
          />
        </div>
      </section>

      {/* Mock disclaimer */}
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Dữ liệu KPI/đơn hàng/cảnh báo đang là mock V1. Module Orders sẽ cung cấp
        dữ liệu thật ở V1.1.
      </p>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4 transition-colors hover:border-cta hover:shadow-sm focus:outline-none focus-visible:shadow-focus"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-slate-700 transition-colors group-hover:bg-cta/10 group-hover:text-cta">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="truncate text-xs text-slate-500">{description}</p>
      </div>
    </Link>
  );
}
