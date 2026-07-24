"use client";

import * as React from "react";
import Link from "next/link";
import {
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Package,
  Plus,
  Truck,
  XCircle,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FolderBreadcrumb,
  FolderCard,
  FolderGrid,
  type FolderChip,
} from "@/components/archive/DateFolder";
import { ExportExcelDialog } from "@/components/archive/ExportExcelDialog";
import {
  formatDayFull,
  formatDayNum,
  formatMonthLabel,
  formatMonthShort,
  formatWeekday,
  groupDaysByMonth,
  type DayBucket,
} from "@/lib/date-folders";
import { cn } from "@/lib/utils";

/**
 * V3.13 — Yêu cầu vật tư dạng "thư mục theo ngày".
 *
 * 3 cấp điều hướng (state trên URL):
 *   - (mặc định)       → lưới thư mục THÁNG
 *   - ?month=YYYY-MM   → lưới thư mục NGÀY trong tháng
 *   - ?date=YYYY-MM-DD → danh sách phiếu tạo trong ngày (+ action chuyển trạng thái)
 * Click 1 phiếu → trang chi tiết /material-requests/[id] (đã có sẵn).
 *
 * Scope "mine"/"all" áp dụng cho mọi cấp (kho/admin xem tất cả).
 */

type Status = "PENDING" | "PICKING" | "READY" | "DELIVERED" | "CANCELLED";

interface MaterialRequestRow {
  id: string;
  requestNo: string;
  status: Status;
  requestedByName: string | null;
  requestedByUsername: string | null;
  notes: string | null;
  createdAt: string;
  lineCount: number;
}

const STATUS_PILL: Record<Status, { label: string; short: string; cls: string; dot: string; icon: React.ElementType }> = {
  PENDING:   { label: "Chờ chuẩn bị", short: "Chờ",      cls: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800",    dot: "bg-amber-500", icon: Clock        },
  PICKING:   { label: "Đang chuẩn bị", short: "Chuẩn bị", cls: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:ring-blue-800",       dot: "bg-blue-500",  icon: Package      },
  READY:     { label: "Đã sẵn sàng",   short: "Sẵn sàng", cls: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:ring-violet-800", dot: "bg-violet-500", icon: CheckCircle2 },
  DELIVERED: { label: "Đã giao",       short: "Đã giao",  cls: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800", dot: "bg-emerald-500", icon: Truck  },
  CANCELLED: { label: "Đã huỷ",        short: "Huỷ",      cls: "bg-zinc-100 text-zinc-500 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700",      dot: "bg-zinc-400",  icon: XCircle      },
};

const STATUS_ORDER: Status[] = ["PENDING", "PICKING", "READY", "DELIVERED", "CANCELLED"];

function statusChips(statuses: Record<string, number>): FolderChip[] {
  return STATUS_ORDER.map((s) => ({
    label: STATUS_PILL[s].short,
    count: statuses[s] ?? 0,
    dot: STATUS_PILL[s].dot,
  }));
}

interface CalendarResponse {
  days: DayBucket[];
}

interface ListResponse {
  data: MaterialRequestRow[];
  meta: { page: number; pageSize: number; total: number };
}

export default function MaterialRequestsArchivePage() {
  const [urlState, setUrlState] = useQueryStates(
    {
      scope: parseAsStringEnum(["mine", "all"]).withDefault("mine"),
      month: parseAsString.withDefault(""),
      date: parseAsString.withDefault(""),
    },
    { history: "push", shallow: true },
  );
  const { scope, month, date } = urlState;
  const qc = useQueryClient();

  const level: "months" | "days" | "slips" = date ? "slips" : month ? "days" : "months";

  // V3.14 — Khoảng ngày mặc định cho dialog xuất Excel, theo cấp drill-down
  // hiện tại. Không dùng new Date() vô tham số (tránh hydration mismatch) —
  // ở cấp "months" để rỗng, dialog tự tính "hôm nay" lúc mở (client-only).
  const exportRange = React.useMemo(() => {
    if (date) return { from: date, to: date };
    if (month) {
      const [y, m] = month.split("-");
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
    }
    return { from: "", to: "" };
  }, [date, month]);

  const calendar = useQuery<CalendarResponse>({
    queryKey: ["material-requests", "calendar", scope],
    queryFn: async () => {
      const p = new URLSearchParams({ view: "calendar" });
      if (scope === "mine") p.set("mine", "1");
      const res = await fetch(`/api/material-requests?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 15_000,
  });

  const months = React.useMemo(
    () => groupDaysByMonth(calendar.data?.days ?? []),
    [calendar.data],
  );
  const activeMonth = React.useMemo(
    () => months.find((m) => m.month === month),
    [months, month],
  );

  const slips = useQuery<ListResponse>({
    queryKey: ["material-requests", "day", scope, date],
    queryFn: async () => {
      const p = new URLSearchParams({ date, pageSize: "100" });
      if (scope === "mine") p.set("mine", "1");
      const res = await fetch(`/api/material-requests?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: level === "slips" && !!date,
    staleTime: 15_000,
  });

  const transition = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: Status }) => {
      const res = await fetch(`/api/material-requests/${id}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? "Transition failed");
      return body;
    },
    onSuccess: (_, { to }) => {
      toast.success(`Đã chuyển sang ${STATUS_PILL[to].label}`);
      qc.invalidateQueries({ queryKey: ["material-requests"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Lỗi chuyển trạng thái");
    },
  });

  // Breadcrumb: giữ scope khi quay lại cấp trên.
  const scopeQs = scope === "all" ? "?scope=all" : "";
  const crumbs = [
    { label: "Tất cả tháng", href: `/material-requests${scopeQs}` },
    ...(month
      ? [{
          label: formatMonthShort(month),
          href: `/material-requests?month=${month}${scope === "all" ? "&scope=all" : ""}`,
        }]
      : []),
    ...(date ? [{ label: formatDayFull(date) }] : []),
  ];

  const isLoading = level === "slips" ? slips.isLoading : calendar.isLoading;

  return (
    <div className="flex flex-col bg-zinc-50/30 md:h-full md:overflow-hidden dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 md:px-6 md:py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {level === "months" ? (
              <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 dark:text-zinc-400">
                <Link href="/" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-50">Tổng quan</Link>
                <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">›</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">Yêu cầu vật tư</span>
              </nav>
            ) : (
              <FolderBreadcrumb items={crumbs} />
            )}
            <h1 className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900 md:text-2xl dark:text-zinc-50">
              <FileText className="h-5 w-5 shrink-0 text-indigo-600 md:h-6 md:w-6 dark:text-indigo-400" aria-hidden />
              <span className="truncate">
                {level === "slips"
                  ? `Phiếu ngày ${formatDayFull(date)}`
                  : level === "days"
                    ? formatMonthLabel(month)
                    : "Yêu cầu vật tư từ kho"}
              </span>
            </h1>
            <p className="mt-1 hidden text-sm text-zinc-500 sm:block dark:text-zinc-400">
              {level === "months"
                ? "Lưu trữ theo thư mục — chọn tháng, rồi ngày để xem các phiếu."
                : level === "days"
                  ? "Chọn một ngày để xem danh sách phiếu."
                  : "Engineer tạo yêu cầu, kho chuẩn bị và bàn giao linh kiện."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ExportExcelDialog
              module="material-requests"
              scope={scope}
              defaultFrom={exportRange.from}
              defaultTo={exportRange.to}
            />
            <Button asChild size="sm">
              <Link href="/material-requests/new">
                <Plus className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Tạo yêu cầu mới</span>
                <span className="sm:hidden">Tạo</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Scope toggle — áp dụng mọi cấp */}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 md:px-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
          {(["mine", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => void setUrlState({ scope: v })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                scope === v ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
              )}
            >
              {v === "mine" ? "Của tôi" : "Tất cả"}
            </button>
          ))}
        </div>
        {level !== "months" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void setUrlState({ month: date ? month : "", date: "" })}
            className="text-zinc-600 dark:text-zinc-400"
          >
            ← Quay lại
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Đang tải…
          </div>
        ) : level === "months" ? (
          months.length === 0 ? (
            <EmptyFolders scope={scope} />
          ) : (
            <FolderGrid>
              {months.map((m) => (
                <FolderCard
                  key={m.month}
                  href={`/material-requests?month=${m.month}${scope === "all" ? "&scope=all" : ""}`}
                  title={formatMonthLabel(m.month)}
                  subtitle={`${m.days.length} ngày có phiếu`}
                  count={m.count}
                  chips={statusChips(m.statuses)}
                />
              ))}
            </FolderGrid>
          )
        ) : level === "days" ? (
          !activeMonth || activeMonth.days.length === 0 ? (
            <EmptyFolders scope={scope} />
          ) : (
            <FolderGrid>
              {activeMonth.days.map((d) => (
                <FolderCard
                  key={d.day}
                  href={`/material-requests?date=${d.day}${scope === "all" ? "&scope=all" : ""}`}
                  title={formatDayNum(d.day)}
                  subtitle={formatWeekday(d.day)}
                  count={d.count}
                  chips={statusChips(d.statuses)}
                />
              ))}
            </FolderGrid>
          )
        ) : (
          <SlipList
            rows={slips.data?.data ?? []}
            onTransition={(id, to) => transition.mutate({ id, to })}
            transitioning={transition.isPending}
          />
        )}
      </div>
    </div>
  );
}

function EmptyFolders({ scope }: { scope: "mine" | "all" }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center md:p-12 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        <FileText className="h-7 w-7 text-zinc-400 dark:text-zinc-500" aria-hidden />
      </div>
      <h3 className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Chưa có yêu cầu nào
      </h3>
      <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
        {scope === "mine" ? "Bạn chưa tạo yêu cầu vật tư nào." : "Hệ thống chưa có yêu cầu nào."}
      </p>
      <Button asChild size="sm" className="mt-4">
        <Link href="/material-requests/new">
          <Plus className="h-4 w-4" /> Tạo yêu cầu mới
        </Link>
      </Button>
    </div>
  );
}

function SlipList({
  rows,
  onTransition,
  transitioning,
}: {
  rows: MaterialRequestRow[];
  onTransition: (id: string, to: Status) => void;
  transitioning: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Không có phiếu nào trong ngày này.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const cfg = STATUS_PILL[r.status];
        return (
          <div
            key={r.id}
            className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm transition-colors hover:border-indigo-200 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-800"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <Link
                  href={`/material-requests/${r.id}`}
                  className="font-mono text-sm font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {r.requestNo}
                </Link>
                <span className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                  cfg.cls,
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                  {cfg.label}
                </span>
              </div>
              <Link
                href={`/material-requests/${r.id}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-indigo-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-indigo-400"
                aria-label="Xem chi tiết"
              >
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                Người yêu cầu:{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {r.requestedByName || r.requestedByUsername || "—"}
                </span>
              </span>
              <span>
                Số dòng:{" "}
                <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">{r.lineCount}</span>
              </span>
              <span className="tabular-nums">
                {new Date(r.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            {(r.status === "PENDING" || r.status === "PICKING" || r.status === "READY") && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                {r.status === "PENDING" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40"
                    onClick={() => onTransition(r.id, "PICKING")}
                    disabled={transitioning}
                  >
                    <Package className="h-3.5 w-3.5" /> Bắt đầu chuẩn bị
                  </Button>
                )}
                {(r.status === "PENDING" || r.status === "PICKING") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950/40"
                    onClick={() => onTransition(r.id, "READY")}
                    disabled={transitioning}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Sẵn sàng
                  </Button>
                )}
                {r.status === "READY" && (
                  <Button
                    size="sm"
                    className="h-8 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                    onClick={() => onTransition(r.id, "DELIVERED")}
                    disabled={transitioning}
                  >
                    <Check className="h-3.5 w-3.5" /> Xác nhận đã nhận
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
