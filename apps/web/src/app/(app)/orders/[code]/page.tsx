import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Package, User } from "lucide-react";
import { getMockOrderByCode } from "@/lib/dashboard-mocks";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { formatDate, formatDaysLeft } from "@/lib/format";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { code: string } }) {
  return { title: `Đơn hàng ${params.code} — Xưởng IoT` };
}

/**
 * V1.1-alpha stub — chi tiết đơn hàng.
 *
 * Module Orders chưa có backend thật ở V1.1-alpha, page chỉ hiển thị dữ liệu
 * từ `generateMockOrders` (dùng chung với Dashboard). V1.2 sẽ thay bằng fetch
 * `/api/orders/{code}` thật.
 */
export default function OrderDetailPage({
  params,
}: {
  params: { code: string };
}) {
  const order = getMockOrderByCode(params.code);
  if (!order) notFound();

  const daysLeft = formatDaysLeft(order.deadline);

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
        <Link href="/" className="hover:text-zinc-900 hover:underline">
          Tổng quan
        </Link>
        {" / "}
        <span className="text-zinc-900">Đơn hàng {order.orderCode}</span>
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
            <Package className="h-5 w-5 text-zinc-500" aria-hidden="true" />
            Đơn hàng{" "}
            <span className="font-mono text-zinc-700">{order.orderCode}</span>
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Mock V1.1-alpha — module Orders đầy đủ sẽ có ở V1.2.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} />
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Về Dashboard
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          icon={<User className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Khách hàng"
          value={order.customerName}
        />
        <InfoCard
          icon={<Package className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Sản phẩm"
          value={order.productName}
        />
        <InfoCard
          icon={<Calendar className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Deadline"
          value={`${formatDate(order.deadline, "dd/MM/yyyy")} · ${daysLeft.label}`}
        />
        <InfoCard
          icon={<Package className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Sẵn sàng"
          value={`${order.readinessPercent}%`}
        />
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="text-md font-semibold text-zinc-900">Thiếu vật tư</h2>
        <p className="mt-1 text-xs text-zinc-500">
          {order.shortageSkus > 0
            ? `${order.shortageSkus} SKU chưa đủ tồn kho cho đơn hàng này.`
            : "Đủ vật tư — không có SKU nào thiếu."}
        </p>
        {order.shortageSkus > 0 && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Module Orders V1.2 sẽ hiển thị danh sách SKU thiếu + đề xuất đặt mua
            / chuyển vật tư từ kho khác.
          </div>
        )}
      </section>

      <section className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <h2 className="font-semibold">V1.2 roadmap</h2>
        <ul className="mt-2 ml-5 list-disc space-y-1 text-xs text-blue-800">
          <li>Fetch data thật từ /api/orders/{params.code}</li>
          <li>BOM explosion → MRP shortage calc</li>
          <li>Link đến Work Order + PO</li>
          <li>Timeline trạng thái + audit log</li>
        </ul>
      </section>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
