/**
 * Server-safe mock generators cho Dashboard (RSC import OK).
 *
 * Tách khỏi `components/domain/{OrdersReadinessTable,AlertsList}.tsx` (client-only)
 * vì Next.js 14 không serialize plain functions qua RSC→Client boundary → runtime
 * "generateMockOrders is not a function" khi build minify.
 *
 * TODO V1.1: thay toàn bộ bằng fetch `/api/dashboard/overview` server-side.
 */
import type { OrderReadinessRow } from "@/components/domain/OrdersReadinessTable";
import type { DashboardAlert } from "@/components/domain/AlertsList";

export function generateMockOrders(): OrderReadinessRow[] {
  const today = new Date();
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };

  return [
    {
      id: "1",
      orderCode: "SO-103",
      customerName: "Công ty CNC Sài Gòn",
      productName: "Jig-CNC-200",
      deadline: addDays(2),
      readinessPercent: 78,
      shortageSkus: 4,
      status: "partial",
    },
    {
      id: "2",
      orderCode: "SO-102",
      customerName: "Xưởng MM Biên Hoà",
      productName: "Gá-kẹp-X",
      deadline: addDays(4),
      readinessPercent: 95,
      shortageSkus: 1,
      status: "ready",
    },
    {
      id: "3",
      orderCode: "SO-101",
      customerName: "Nhôm Đức Tâm",
      productName: "Khung-Fix-A",
      deadline: addDays(7),
      readinessPercent: 40,
      shortageSkus: 9,
      status: "shortage",
    },
    {
      id: "4",
      orderCode: "SO-100",
      customerName: "Cơ khí Việt Tiến",
      productName: "Trục-trung",
      deadline: addDays(-1),
      readinessPercent: 55,
      shortageSkus: 3,
      status: "critical",
    },
    {
      id: "5",
      orderCode: "SO-099",
      customerName: "Kim Long Mould",
      productName: "Khuôn-nhựa-B",
      deadline: addDays(10),
      readinessPercent: 100,
      shortageSkus: 0,
      status: "ready",
    },
  ];
}

export function getMockOrderByCode(code: string): OrderReadinessRow | null {
  const all = generateMockOrders();
  return all.find((o) => o.orderCode === code) ?? null;
}

export function generateMockAlerts(): DashboardAlert[] {
  return [
    {
      id: "a1",
      severity: "danger",
      title: "SO-100 đã quá hạn 1 ngày",
      description: "Cơ khí Việt Tiến · thiếu 3 SKU",
      kind: "overdue",
    },
    {
      id: "a2",
      severity: "warning",
      title: "SO-103 thiếu vật tư > 20%",
      description: "4 SKU chưa đủ · Jig-CNC-200",
      kind: "shortage",
    },
    {
      id: "a3",
      severity: "warning",
      title: "7 SKU chạm tồn kho tối thiểu",
      description: "Cần đặt mua bổ sung trong tuần này",
      href: "/items?filter=low-stock",
      kind: "stock-min",
    },
  ];
}
