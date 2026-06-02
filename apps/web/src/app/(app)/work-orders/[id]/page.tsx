"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardList,
  Factory,
  History as HistoryIcon,
  Loader2,
  Printer,
  Wrench,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressReportForm } from "@/components/work-orders/ProgressReportForm";
import { ProgressTimeline } from "@/components/work-orders/ProgressTimeline";
import { WorkOrderActions } from "@/components/work-orders/WorkOrderActions";
import { useSession } from "@/hooks/useSession";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useWorkOrderDetail,
  type WorkOrderStatus,
} from "@/hooks/useWorkOrders";

/**
 * V3.7.74 — Work Order detail page rewrite hoàn toàn:
 * - Section "Phiếu" (default): mirror form `/work-orders/new-lsx` read-only,
 *   render đúng 6 phần (Header info / I. Sản phẩm / II. Vật liệu / III. Routing /
 *   V. Tài liệu / VI. Dao cụ / VII. Phê duyệt) — A4 landscape printable.
 * - Section "Tiến độ": ProgressReportForm + Lines table + ProgressTimeline.
 * - Section "Lịch sử": audit log merged.
 *
 * Bỏ stepper 6-tab Tổng quan/Vật liệu/Quy trình/Tiến độ/Kiểm tra/Lịch sử cũ
 * (theo yêu cầu user — không match form Excel LSX GTAM).
 */

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  DRAFT: "Chờ Gia công duyệt",
  QUEUED: "Hàng đợi",
  RELEASED: "Đã phát hành",
  IN_PROGRESS: "Đang sản xuất",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

const STATUS_PILL: Record<WorkOrderStatus, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  QUEUED: "bg-amber-50 text-amber-700 ring-amber-200",
  RELEASED: "bg-sky-50 text-sky-700 ring-sky-200",
  IN_PROGRESS: "bg-orange-50 text-orange-700 ring-orange-200",
  PAUSED: "bg-amber-50 text-amber-700 ring-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CANCELLED: "bg-red-50 text-red-700 ring-red-200",
};

const ORDER_TYPE_LABEL: Record<string, string> = {
  NEW: "Sản xuất mới",
  REPAIR: "Sửa chữa",
  TRIAL: "Sản xuất thử",
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Thấp",
  NORMAL: "Bình thường",
  HIGH: "Cao",
  URGENT: "Khẩn",
};

const TOOL_STATUS_LABEL: Record<string, string> = {
  OK: "OK",
  WORN: "Mòn",
  DAMAGED: "Hỏng",
  MISSING: "Thiếu",
};

type TabKey = "ticket" | "progress" | "history";
const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
  { key: "ticket", label: "Phiếu LSX", icon: ClipboardList },
  { key: "progress", label: "Tiến độ", icon: Factory },
  { key: "history", label: "Lịch sử", icon: HistoryIcon },
];

interface AuditRow {
  id: string;
  action: string;
  actor: string | null;
  actorDisplay: string | null;
  occurredAt: string;
  notes: string | null;
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return formatDate(d, "dd/MM/yyyy");
}
function fmtNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("vi-VN");
}

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const id = params.id;

  const rawTab = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = TABS.some((t) => t.key === rawTab) ? rawTab! : "ticket";
  const setTab = React.useCallback(
    (k: TabKey) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", k);
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const query = useWorkOrderDetail(id);
  const wo = query.data?.data;

  const auditQuery = useQuery<{ data: AuditRow[] }>({
    queryKey: ["work-orders", "audit", id],
    queryFn: async () => {
      const p = new URLSearchParams({
        entity: "work_order",
        objectId: id,
        pageSize: "50",
      });
      const res = await fetch(`/api/admin/audit?${p.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!id && tab === "history",
    staleTime: 30_000,
  });

  const roles = session.data?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const canApprove = isAdmin || roles.includes("operator");
  const canOperate = isAdmin || roles.includes("planner") || roles.includes("operator");
  const canComplete = isAdmin || roles.includes("planner");

  if (query.isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6 dark:bg-zinc-950">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-80 w-full rounded-2xl" />
      </div>
    );
  }
  if (!wo) {
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950/40">
        <p className="text-sm font-semibold text-red-700 dark:text-red-300">
          Không tìm thấy lệnh sản xuất
        </p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/work-orders">Về danh sách</Link>
        </Button>
      </div>
    );
  }

  const status = wo.status as WorkOrderStatus;
  const orderTypeLabel = ORDER_TYPE_LABEL[wo.orderType ?? "NEW"] ?? "—";
  const priorityLabel = PRIORITY_LABEL[wo.priority] ?? wo.priority;
  const productSpec = wo.productSpecification ?? {};
  const routing = wo.routingPlan ?? [];
  const materials = wo.materialRequirements ?? [];
  const tools = wo.toolsRequired ?? [];
  const totalRoutingMin = routing.reduce(
    (s, r) => s + Number(r.duration_min ?? r.cycle_min ?? 0),
    0,
  );
  const todayStr = fmtDate(wo.createdAt);
  const createdByName =
    (wo.createdBy === session.data?.id ? session.data?.fullName : null) ??
    session.data?.fullName ??
    "—"; // V3.8 — sẽ enrich từ user_account khi backend trả thêm field

  const handlePrint = () => window.print();

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-100 dark:bg-zinc-950 print:bg-white">
      {/* ===== Toolbar (no print) ===== */}
      <header className="border-b border-zinc-200 bg-white px-6 py-3 print:hidden dark:border-zinc-800 dark:bg-zinc-900">
        <Link
          href="/work-orders"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Lệnh sản xuất
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {wo.woNo}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                STATUS_PILL[status],
              )}
            >
              <Circle className="h-1.5 w-1.5 fill-current" aria-hidden />
              {STATUS_LABEL[status]}
            </span>
            <span className="hidden text-xs text-zinc-400 sm:inline dark:text-zinc-500">
              · {orderTypeLabel} · {priorityLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" />
              In phiếu
            </Button>
            <WorkOrderActions
              woId={wo.id}
              woNo={wo.woNo}
              status={status}
              versionLock={wo.versionLock}
              canOperate={canOperate}
              canComplete={canComplete}
              canCancel={isAdmin}
              canApprove={canApprove}
              canDelete={isAdmin}
              size="sm"
            />
          </div>
        </div>

        {/* Tab nav */}
        <nav
          aria-label="Section"
          className="mt-3 flex items-center gap-1 border-b border-zinc-200 -mb-3 dark:border-zinc-800"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-t-full after:transition-all",
                  active
                    ? "text-indigo-700 after:bg-indigo-600 dark:text-indigo-300 dark:after:bg-indigo-400"
                    : "text-zinc-500 hover:text-zinc-900 after:bg-transparent dark:text-zinc-400 dark:hover:text-zinc-100",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* ===== TAB 1: Phiếu LSX (form layout read-only) ===== */}
      {tab === "ticket" && (
        <div className="mx-auto w-full max-w-[1200px] p-6 print:p-0 print:max-w-none">
          <article className="border border-zinc-300 bg-white shadow-sm print:border print:border-zinc-900 print:shadow-none dark:border-zinc-700 dark:bg-zinc-900 print:dark:border-zinc-900 print:dark:bg-white print:dark:text-zinc-900">
            {/* Title bar */}
            <div className="flex items-center gap-4 border-b-2 border-zinc-900 px-6 py-4 print:py-2 print:dark:border-zinc-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/img/logo-gtam.png"
                alt="GTAM"
                width={64}
                height={70}
                className="h-16 w-auto shrink-0 object-contain"
              />
              <div className="flex-1 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-200 print:dark:text-zinc-700">
                  CÔNG TY CỔ PHẦN SẢN XUẤT TỰ ĐỘNG HÓA CÔNG NGHỆ TOÀN CẦU (GTAM)
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-wide text-zinc-900 dark:text-zinc-50 print:dark:text-zinc-900">
                  LỆNH SẢN XUẤT
                </h2>
                <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
                  Mẫu No: GTAM/PRD-LSX · Phiên bản 1.0 ·{" "}
                  <span className="font-mono text-zinc-700 dark:text-zinc-300 print:dark:text-zinc-700">
                    {wo.woNo}
                  </span>
                </p>
              </div>
              <div className="w-16 shrink-0" aria-hidden />
            </div>

            {/* Header info — 6 fields read-only, 3 cols */}
            <section className="grid grid-cols-1 gap-3 border-b border-zinc-200 px-6 py-4 md:grid-cols-3 print:dark:border-zinc-300">
              <ROField label="Loại lệnh" value={orderTypeLabel} />
              <ROField label="Bộ phận lập" value={wo.creatorDepartment ?? "—"} />
              <ROField label="Ưu tiên" value={priorityLabel} />
              <ROField label="Người lập" value={createdByName} />
              <ROField label="Ngày bắt đầu" value={fmtDate(wo.plannedStart)} />
              <ROField label="Ngày kết thúc" value={fmtDate(wo.plannedEnd)} />
            </section>

            {/* I. Thông tin sản phẩm */}
            <section className="border-b border-zinc-200 px-6 py-4 print:dark:border-zinc-300">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100 print:dark:text-zinc-800">
                I. Thông tin sản phẩm
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <ROField
                  label="Sản phẩm cần sản xuất"
                  wide
                  value={
                    <span className="flex items-baseline gap-2">
                      {wo.productItemSku ? (
                        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
                          {wo.productItemSku}
                        </span>
                      ) : null}
                      <span className="font-medium">
                        {wo.productItemName ?? "—"}
                      </span>
                    </span>
                  }
                />
                <ROField
                  label="Số lượng (SL)"
                  value={
                    <span>
                      <span className="font-mono font-semibold">
                        {fmtNum(wo.plannedQty)}
                      </span>
                      <span className="ml-1 text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
                        {wo.productItemUom ?? ""}
                      </span>
                    </span>
                  }
                />
                <ROField
                  label="Kích thước"
                  value={productSpec.dimensions ?? "—"}
                />
                <ROField
                  label="Yêu cầu kỹ thuật"
                  wide
                  value={
                    <span className="whitespace-pre-line">
                      {productSpec.technicalRequirements ?? "—"}
                    </span>
                  }
                />
              </div>
            </section>

            {/* II. Nguyên vật liệu */}
            <section className="border-b border-zinc-200 px-6 py-4 print:dark:border-zinc-300">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100 print:dark:text-zinc-800">
                II. Nguyên vật liệu (BOM)
              </h3>
              <div className="overflow-x-auto rounded-md border border-zinc-200 print:overflow-visible dark:border-zinc-700">
                <table className="w-full text-[11px]">
                  <thead className="bg-zinc-100 dark:bg-zinc-800 print:dark:bg-zinc-100">
                    <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300 print:dark:text-zinc-600">
                      <th className="border-r border-zinc-200 px-2 py-1.5 w-8 dark:border-zinc-700">#</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-left min-w-[200px] dark:border-zinc-700">Mã VT · Tên</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-right w-24 dark:border-zinc-700">Định mức</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-left w-16 dark:border-zinc-700">ĐVT</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-right w-24 dark:border-zinc-700">SL cấp</th>
                      <th className="px-2 py-1.5 text-left w-28">Kho cấp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-2 py-3 text-center italic text-zinc-400 dark:text-zinc-500">
                          Không có vật liệu
                        </td>
                      </tr>
                    ) : (
                      materials.map((m, i) => (
                        <tr key={i} className="border-t border-zinc-100 align-top dark:border-zinc-800 print:dark:border-zinc-200">
                          <Td>
                            <span className="block text-center font-mono text-[10px] text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
                              {i + 1}
                            </span>
                          </Td>
                          <Td>
                            {m.sku ? (
                              <span className="block font-mono text-[10px] text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
                                {m.sku}
                              </span>
                            ) : null}
                            <span className="block break-words">{m.name}</span>
                          </Td>
                          <Td align="right">
                            <span className="font-mono">{fmtNum(m.qty)}</span>
                          </Td>
                          <Td>{m.uom ?? "—"}</Td>
                          <Td align="right">
                            <span className="font-mono text-emerald-700 dark:text-emerald-400 print:dark:text-emerald-700">
                              {fmtNum(m.allocated_qty)}
                            </span>
                          </Td>
                          <Td>
                            <span className="font-mono text-[10px]">
                              {m.warehouse_code ?? "—"}
                            </span>
                          </Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* III. Routing */}
            <section className="border-b border-zinc-200 px-6 py-4 print:dark:border-zinc-300">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100 print:dark:text-zinc-800">
                III. Công đoạn sản xuất (Routing)
              </h3>
              <div className="overflow-x-auto rounded-md border border-zinc-200 print:overflow-visible dark:border-zinc-700">
                <table className="w-full text-[11px]">
                  <thead className="bg-zinc-100 dark:bg-zinc-800 print:dark:bg-zinc-100">
                    <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300 print:dark:text-zinc-600">
                      <th className="border-r border-zinc-200 px-2 py-1.5 w-8 dark:border-zinc-700">#</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-left min-w-[140px] dark:border-zinc-700">Tên công đoạn</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-left min-w-[140px] dark:border-zinc-700">Thiết bị</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-left min-w-[120px] dark:border-zinc-700">Người phụ trách</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-right w-20 dark:border-zinc-700">Phút</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-center w-14 dark:border-zinc-700">QC</th>
                      <th className="px-2 py-1.5 text-left min-w-[120px]">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routing.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-2 py-3 text-center italic text-zinc-400 dark:text-zinc-500">
                          Không có công đoạn
                        </td>
                      </tr>
                    ) : (
                      routing.map((r, i) => (
                        <tr key={i} className="border-t border-zinc-100 align-top dark:border-zinc-800 print:dark:border-zinc-200">
                          <Td>
                            <span className="block text-center font-mono text-[10px] text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
                              {r.step_no}
                            </span>
                          </Td>
                          <Td>
                            <span className="block break-words font-medium">{r.name}</span>
                          </Td>
                          <Td>{r.equipment ?? r.machine ?? "—"}</Td>
                          <Td>{r.assigned_operator ?? "—"}</Td>
                          <Td align="right">
                            <span className="font-mono">
                              {fmtNum(r.duration_min ?? r.cycle_min ?? null)}
                            </span>
                          </Td>
                          <Td align="center">
                            {r.qc_required ? (
                              <CheckCircle2
                                className="mx-auto h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                                aria-hidden
                              />
                            ) : (
                              <span className="text-zinc-300 dark:text-zinc-600">—</span>
                            )}
                          </Td>
                          <Td>{r.notes ?? "—"}</Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {routing.length > 0 && (
                    <tfoot className="bg-zinc-50 dark:bg-zinc-800 print:dark:bg-zinc-100">
                      <tr className="border-t-2 border-zinc-300 font-semibold dark:border-zinc-700 print:dark:border-zinc-300">
                        <td colSpan={4} className="px-2 py-2 text-right text-[11px]">
                          Tổng thời gian:
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-[12px] text-emerald-700 tabular-nums dark:text-emerald-400 print:dark:text-emerald-700">
                          {totalRoutingMin.toLocaleString("vi-VN")} phút
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>

            {/* V. Tài liệu */}
            <section className="border-b border-zinc-200 px-6 py-4 print:dark:border-zinc-300">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100 print:dark:text-zinc-800">
                V. Tài liệu đính kèm
              </h3>
              <div className="text-[11px]">
                <span className="text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">URL bản vẽ kỹ thuật: </span>
                {wo.technicalDrawingUrl ? (
                  <a
                    href={wo.technicalDrawingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-blue-600 underline-offset-2 hover:underline dark:text-blue-300 print:dark:text-blue-600"
                  >
                    {wo.technicalDrawingUrl}
                  </a>
                ) : (
                  <span className="italic text-zinc-400 dark:text-zinc-500">— (chưa có)</span>
                )}
              </div>
            </section>

            {/* VI. Tools */}
            <section className="border-b border-zinc-200 px-6 py-4 print:dark:border-zinc-300">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100 print:dark:text-zinc-800">
                VI. Công cụ dụng cụ / Dao cụ
              </h3>
              <div className="overflow-x-auto rounded-md border border-zinc-200 print:overflow-visible dark:border-zinc-700">
                <table className="w-full text-[11px]">
                  <thead className="bg-zinc-100 dark:bg-zinc-800 print:dark:bg-zinc-100">
                    <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300 print:dark:text-zinc-600">
                      <th className="border-r border-zinc-200 px-2 py-1.5 w-8 dark:border-zinc-700">#</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-left min-w-[140px] dark:border-zinc-700">Tên dao/CCDC</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-left min-w-[120px] dark:border-zinc-700">Mã hiệu</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-left min-w-[140px] dark:border-zinc-700">Máy sử dụng</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-right w-16 dark:border-zinc-700">SL</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-left w-14 dark:border-zinc-700">ĐVT</th>
                      <th className="border-r border-zinc-200 px-2 py-1.5 text-left w-28 dark:border-zinc-700">Tình trạng</th>
                      <th className="px-2 py-1.5 text-left min-w-[120px]">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-2 py-3 text-center italic text-zinc-400 dark:text-zinc-500">
                          Không có dao cụ
                        </td>
                      </tr>
                    ) : (
                      tools.map((t, i) => (
                        <tr key={i} className="border-t border-zinc-100 align-top dark:border-zinc-800 print:dark:border-zinc-200">
                          <Td>
                            <span className="block text-center font-mono text-[10px] text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
                              {i + 1}
                            </span>
                          </Td>
                          <Td>
                            <span className="block break-words font-medium">{t.name}</span>
                          </Td>
                          <Td>
                            <span className="font-mono text-[10px]">{t.code ?? "—"}</span>
                          </Td>
                          <Td>{t.machine ?? "—"}</Td>
                          <Td align="right">
                            <span className="font-mono">{fmtNum(t.qty)}</span>
                          </Td>
                          <Td>{t.uom ?? "—"}</Td>
                          <Td>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                t.status === "OK"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  : t.status === "WORN"
                                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                    : t.status === "DAMAGED" || t.status === "MISSING"
                                      ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
                              )}
                            >
                              {TOOL_STATUS_LABEL[t.status ?? "OK"] ?? t.status ?? "—"}
                            </span>
                          </Td>
                          <Td>{t.notes ?? "—"}</Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Notes */}
            {wo.notes ? (
              <section className="border-b border-zinc-200 px-6 py-4 print:dark:border-zinc-300">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
                  Ghi chú chung
                </p>
                <p className="mt-1 whitespace-pre-line text-[12px] text-zinc-700 dark:text-zinc-200 print:dark:text-zinc-700">
                  {wo.notes}
                </p>
              </section>
            ) : null}

            {/* VII. Phê duyệt — 4 ô chữ ký */}
            <section className="px-6 py-4 print:py-3">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100 print:dark:text-zinc-800">
                VII. Phê duyệt
              </h3>
              <table className="w-full text-[11px]">
                <thead className="bg-zinc-50 dark:bg-zinc-800 print:dark:bg-zinc-50">
                  <tr className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
                    <th className="border border-zinc-200 px-2 py-1 text-left dark:border-zinc-700 print:dark:border-zinc-200">
                      Người lập
                    </th>
                    <th className="border border-zinc-200 px-2 py-1 text-left dark:border-zinc-700 print:dark:border-zinc-200">
                      Kế toán
                    </th>
                    <th className="border border-zinc-200 px-2 py-1 text-left dark:border-zinc-700 print:dark:border-zinc-200">
                      Quản lý sản xuất
                    </th>
                    <th className="border border-zinc-200 px-2 py-1 text-left dark:border-zinc-700 print:dark:border-zinc-200">
                      Giám đốc
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-zinc-200 px-2 py-6 align-top dark:border-zinc-700 print:dark:border-zinc-200">
                      <span className="block text-[10px] font-semibold text-zinc-700 dark:text-zinc-200 print:dark:text-zinc-700">
                        {createdByName}
                      </span>
                      <span className="block text-[9px] text-zinc-400 dark:text-zinc-500 print:dark:text-zinc-400">
                        {todayStr}
                      </span>
                    </td>
                    {[2, 3, 4].map((i) => (
                      <td
                        key={i}
                        className="border border-zinc-200 px-2 py-6 align-bottom dark:border-zinc-700 print:dark:border-zinc-200"
                      >
                        &nbsp;
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-[10px] italic text-zinc-500 print:hidden dark:text-zinc-400">
                Workflow phê duyệt 4 chữ ký + xác nhận liên bộ phận sẽ làm ở phase
                sau. Hiện tại {STATUS_LABEL[status]} —{" "}
                {status === "DRAFT" ? "chờ Gia công duyệt YCSX." : ""}
              </p>
            </section>
          </article>
        </div>
      )}

      {/* ===== TAB 2: Tiến độ ===== */}
      {tab === "progress" && (
        <div className="mx-auto w-full max-w-[1200px] space-y-4 p-6">
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Kế hoạch" value={fmtNum(wo.plannedQty)} icon={ClipboardList} />
            <KpiCard
              label="Đạt"
              value={fmtNum(wo.goodQty)}
              icon={CheckCircle2}
              tone="emerald"
            />
            <KpiCard label="Phế" value={fmtNum(wo.scrapQty)} icon={Wrench} tone="rose" />
            <KpiCard
              label="Routing tổng"
              value={`${totalRoutingMin} phút`}
              icon={CalendarClock}
              tone="indigo"
            />
          </div>

          {/* ProgressReportForm */}
          {canOperate && (status === "IN_PROGRESS" || status === "PAUSED") && (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="border-b border-zinc-100 bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 dark:border-zinc-800">
                <p className="text-base font-semibold text-white">
                  Báo cáo tiến độ
                </p>
                <p className="mt-0.5 text-xs text-indigo-100">
                  Ghi nhận sản lượng đạt / phế cho Work Order
                </p>
              </div>
              <div className="p-6">
                <ProgressReportForm
                  woId={wo.id}
                  lines={wo.lines}
                  defaultLineId={null}
                  onSubmitted={() => undefined}
                />
              </div>
            </div>
          )}

          {/* Lines table */}
          {wo.lines.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="border-b border-zinc-100 bg-zinc-50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  Chi tiết lines ({wo.lines.length})
                </p>
              </div>
              <table className="w-full text-[12px]">
                <thead className="bg-zinc-50 dark:bg-zinc-800/40">
                  <tr className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400">
                    <th className="px-4 py-2 text-left">SKU</th>
                    <th className="px-4 py-2 text-left">Tên</th>
                    <th className="px-4 py-2 text-right">Cần</th>
                    <th className="px-4 py-2 text-right">Đã làm</th>
                    <th className="px-4 py-2 text-right">% hoàn</th>
                  </tr>
                </thead>
                <tbody>
                  {wo.lines.map((l) => {
                    const req = Number(l.requiredQty) || 0;
                    const done = Number(l.completedQty) || 0;
                    const pct = req > 0 ? Math.round((done / req) * 100) : 0;
                    return (
                      <tr
                        key={l.id}
                        className="border-t border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="px-4 py-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                          {l.componentSku}
                        </td>
                        <td className="px-4 py-2">{l.componentName}</td>
                        <td className="px-4 py-2 text-right font-mono">{fmtNum(req)}</td>
                        <td className="px-4 py-2 text-right font-mono text-emerald-700 dark:text-emerald-400">
                          {fmtNum(done)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold">
                          {pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Progress timeline */}
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 bg-zinc-50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                Lịch sử báo cáo tiến độ
              </p>
            </div>
            <ProgressTimeline woId={wo.id} />
          </div>
        </div>
      )}

      {/* ===== TAB 3: Lịch sử ===== */}
      {tab === "history" && (
        <div className="mx-auto w-full max-w-[1000px] p-6">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 bg-zinc-50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                Audit log work order
              </p>
            </div>
            {auditQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-zinc-500 dark:text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải…
              </div>
            ) : !auditQuery.data?.data?.length ? (
              <p className="p-6 text-center text-sm italic text-zinc-400 dark:text-zinc-500">
                Chưa có lịch sử
              </p>
            ) : (
              <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {auditQuery.data.data.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-3 text-[12px]">
                    <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                      {formatDate(a.occurredAt, "dd/MM/yyyy HH:mm")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold">
                        {a.actorDisplay ?? a.actor ?? "Hệ thống"}
                      </span>
                      <span className="ml-1 text-zinc-500 dark:text-zinc-400">
                        — {a.action}
                      </span>
                      {a.notes ? (
                        <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                          {a.notes}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {/* Print A4 landscape */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          html,
          body {
            background: white !important;
            color: #18181b !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ─── helpers ─── */

function ROField({
  label,
  value,
  wide,
}: {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("space-y-1", wide ? "md:col-span-2" : "")}>
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
        {label}
      </span>
      <div className="min-h-[28px] rounded-md border border-zinc-200 bg-zinc-50/60 px-3 py-1.5 text-[12px] text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-100 print:dark:border-zinc-300 print:dark:bg-zinc-50/60 print:dark:text-zinc-800">
        {value}
      </div>
    </div>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className={cn(
        "border-r border-zinc-100 px-2 py-1 align-top whitespace-normal break-words dark:border-zinc-800 print:dark:border-zinc-200",
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
      )}
    >
      {children}
    </td>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "zinc",
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: "zinc" | "emerald" | "rose" | "indigo";
}) {
  const toneCls = {
    zinc: "bg-zinc-50 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  }[tone];
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md",
            toneCls,
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}
