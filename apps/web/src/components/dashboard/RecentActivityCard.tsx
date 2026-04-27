"use client";

import * as React from "react";
import {
  Activity,
  CheckCircle2,
  CirclePlus,
  CircleX,
  FileEdit,
  FileText,
  Inbox,
  LogIn,
  LogOut,
  PackageCheck,
  PauseCircle,
  PlayCircle,
  Rocket,
  Trash2,
  Truck,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * V3.2 RecentActivityCard — vertical timeline 10 audit_event gần đây
 * (TASK-20260427-027).
 *
 * Auto polling 60s, dùng SWR-pattern đơn giản với fetch + AbortController.
 *
 * Design:
 *  - Vertical timeline với spine line + dot màu theo action.
 *  - Mỗi item: icon action + actor + verb + entity + relative time.
 *  - Empty state: "Chưa có hoạt động" (zen dot).
 *  - Loading: 4 skeleton row.
 */

interface ActivityItem {
  id: string;
  actor: string | null;
  actorDisplay: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  occurredAt: string;
  notes: string | null;
}

interface ActivityPayload {
  cachedAt: string;
  items: ActivityItem[];
}

const POLL_MS = 60_000;

function formatRelative(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "—";
    const diffSec = Math.floor((Date.now() - t) / 1000);
    if (diffSec < 0) return "vừa xong";
    if (diffSec < 60) return "vừa xong";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
    if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)} ngày trước`;
    return new Date(iso).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return "—";
  }
}

interface ActionMeta {
  label: string;
  icon: typeof Activity;
  tone: string;
}

const ACTION_META: Record<string, ActionMeta> = {
  CREATE: { label: "tạo mới", icon: CirclePlus, tone: "emerald" },
  UPDATE: { label: "cập nhật", icon: FileEdit, tone: "blue" },
  DELETE: { label: "xoá", icon: Trash2, tone: "rose" },
  LOGIN: { label: "đăng nhập", icon: LogIn, tone: "zinc" },
  LOGOUT: { label: "đăng xuất", icon: LogOut, tone: "zinc" },
  RELEASE: { label: "phát hành", icon: Rocket, tone: "violet" },
  SNAPSHOT: { label: "snapshot", icon: FileText, tone: "indigo" },
  POST: { label: "đăng ghi", icon: PackageCheck, tone: "indigo" },
  CANCEL: { label: "huỷ", icon: CircleX, tone: "rose" },
  UPLOAD: { label: "tải lên", icon: Upload, tone: "blue" },
  COMMIT: { label: "commit", icon: CheckCircle2, tone: "emerald" },
  TRANSITION: { label: "chuyển trạng thái", icon: Activity, tone: "indigo" },
  RESERVE: { label: "giữ chỗ", icon: Inbox, tone: "amber" },
  ISSUE: { label: "xuất kho", icon: PackageCheck, tone: "violet" },
  RECEIVE: { label: "nhận hàng", icon: Truck, tone: "emerald" },
  APPROVE: { label: "phê duyệt", icon: CheckCircle2, tone: "emerald" },
  CONVERT: { label: "chuyển đổi", icon: FileEdit, tone: "blue" },
  WO_START: { label: "bắt đầu lệnh", icon: PlayCircle, tone: "emerald" },
  WO_PAUSE: { label: "tạm dừng lệnh", icon: PauseCircle, tone: "amber" },
  WO_RESUME: { label: "tiếp tục lệnh", icon: PlayCircle, tone: "blue" },
  WO_COMPLETE: { label: "hoàn tất lệnh", icon: CheckCircle2, tone: "emerald" },
  ECO_SUBMIT: { label: "ECO submit", icon: FileText, tone: "violet" },
  ECO_APPROVE: { label: "ECO duyệt", icon: CheckCircle2, tone: "emerald" },
  ECO_APPLY: { label: "ECO áp dụng", icon: Rocket, tone: "indigo" },
  ECO_REJECT: { label: "ECO từ chối", icon: CircleX, tone: "rose" },
  QC_CHECK: { label: "kiểm tra QC", icon: CheckCircle2, tone: "indigo" },
};

const TONE_DOT: Record<string, string> = {
  emerald: "bg-emerald-500 ring-emerald-100",
  blue: "bg-blue-500 ring-blue-100",
  rose: "bg-rose-500 ring-rose-100",
  amber: "bg-amber-500 ring-amber-100",
  indigo: "bg-indigo-500 ring-indigo-100",
  violet: "bg-violet-500 ring-violet-100",
  zinc: "bg-zinc-400 ring-zinc-100",
};

const TONE_ICON_BG: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  blue: "bg-blue-50 text-blue-700 ring-blue-200/60",
  rose: "bg-rose-50 text-rose-700 ring-rose-200/60",
  amber: "bg-amber-50 text-amber-700 ring-amber-200/60",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200/60",
  violet: "bg-violet-50 text-violet-700 ring-violet-200/60",
  zinc: "bg-zinc-100 text-zinc-600 ring-zinc-200/60",
};

const ENTITY_LABEL: Record<string, string> = {
  bom: "BOM",
  bom_revision: "BOM revision",
  bom_snapshot: "snapshot BOM",
  bom_snapshot_line: "dòng BOM",
  work_order: "lệnh sản xuất",
  work_order_line: "dòng WO",
  purchase_order: "đơn mua",
  purchase_request: "yêu cầu mua",
  inbound_receipt: "phiếu nhập",
  assembly_work_order: "lệnh lắp ráp",
  item: "vật tư",
  user_account: "người dùng",
  reservation: "giữ chỗ",
  inventory_lot_serial: "lot",
  inventory_txn: "giao dịch kho",
  qc_check: "kiểm tra QC",
  eco_change: "ECO",
  sales_order: "đơn bán",
  supplier: "nhà cung cấp",
};

function entityLabel(t: string): string {
  return ENTITY_LABEL[t] ?? t.replace(/_/g, " ");
}

interface RecentActivityCardProps {
  className?: string;
}

export function RecentActivityCard({ className }: RecentActivityCardProps) {
  const [data, setData] = React.useState<ActivityPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [, setTick] = React.useState(0);

  const fetchData = React.useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/dashboard/activity?limit=10", {
        signal,
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as ActivityPayload;
      setData(payload);
      setError(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError("Không tải được hoạt động.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const ctrl = new AbortController();
    void fetchData(ctrl.signal);
    const id = setInterval(() => fetchData(ctrl.signal), POLL_MS);
    const tickId = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => {
      clearInterval(id);
      clearInterval(tickId);
      ctrl.abort();
    };
  }, [fetchData]);

  return (
    <section
      className={cn(
        "dashboard-stagger-fade relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/60 bg-white/70 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] backdrop-blur-sm",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100/80 text-indigo-700 ring-1 ring-indigo-200/60"
          >
            <Activity className="h-4 w-4" strokeWidth={2} />
          </span>
          <h2 className="text-[14px] font-semibold tracking-tight text-zinc-900">
            Hoạt động gần đây
          </h2>
        </div>
        <span className="text-[10.5px] font-medium uppercase tracking-wide text-zinc-500">
          {data?.items?.length ? `${data.items.length} sự kiện` : null}
        </span>
      </header>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <ol className="relative flex flex-col gap-3">
          {/* Vertical spine */}
          <div
            aria-hidden="true"
            className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-zinc-200 via-zinc-200/70 to-transparent"
          />
          {data.items.map((it) => {
            const meta =
              ACTION_META[it.action] ?? {
                label: it.action.toLowerCase(),
                icon: Activity,
                tone: "zinc",
              };
            const Icon = meta.icon;
            return (
              <li
                key={it.id}
                className="relative flex items-start gap-3 pl-0"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                    TONE_ICON_BG[meta.tone] ?? TONE_ICON_BG.zinc,
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="truncate text-[13px] leading-snug text-zinc-700">
                    <span className="font-semibold text-zinc-900">
                      {it.actorDisplay ?? it.actor ?? "Hệ thống"}
                    </span>{" "}
                    {meta.label}{" "}
                    <span className="text-zinc-600">
                      {entityLabel(it.objectType)}
                    </span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-zinc-500">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-block h-1.5 w-1.5 rounded-full ring-2",
                        TONE_DOT[meta.tone] ?? TONE_DOT.zinc,
                      )}
                    />
                    {formatRelative(it.occurredAt)}
                    {it.notes ? (
                      <>
                        <span className="text-zinc-300">•</span>
                        <span className="truncate">{it.notes}</span>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-10">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-zinc-200">
            <Activity className="h-4 w-4 text-zinc-400" strokeWidth={2} />
          </div>
          <p className="text-sm text-zinc-500">Chưa có hoạt động</p>
        </div>
      )}
    </section>
  );
}
