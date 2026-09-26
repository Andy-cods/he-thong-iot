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
import { QueryError } from "@/components/ui/query-error";
import { formatRelative as formatRelativeVN } from "@/lib/format";
import { entityLabel as entityLabelVN } from "@/lib/status";

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
/** Số dòng hiển thị trên thẻ. */
const SHOW_LIMIT = 10;
/**
 * V4.1 (Đợt 6B): lấy dư rồi lọc bỏ đăng nhập/đăng xuất ở client — trước đây
 * LOGIN/LOGOUT chiếm hết 10 dòng. Nếu còn quá ít sự kiện nghiệp vụ (< 3) thì
 * giữ nguyên danh sách gốc để thẻ không trống trơn.
 */
const FETCH_LIMIT = 50;
const MIN_BUSINESS_ITEMS = 3;
const SESSION_ACTIONS = new Set(["LOGIN", "LOGOUT"]);

function pickFeedItems(items: ActivityItem[]): ActivityItem[] {
  const business = items.filter((it) => !SESSION_ACTIONS.has(it.action));
  return (business.length >= MIN_BUSINESS_ITEMS ? business : items).slice(0, SHOW_LIMIT);
}

// V4.1 UI-15: thời gian tương đối qua lib/format (giờ VN).
function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  // Đồng hồ máy lệch (sự kiện "tương lai") → coi như vừa xong.
  if (Number.isFinite(t) && t > Date.now()) return "vừa xong";
  return formatRelativeVN(iso);
}

interface ActionMeta {
  /** Động từ — KHÔNG lặp danh từ đối tượng ("hoàn tất" + "lệnh sản xuất"). */
  label: string;
  icon: typeof Activity;
  tone: string;
  /** true → không nối tên đối tượng (VD "đăng nhập", không "đăng nhập session"). */
  noEntity?: boolean;
}

const ACTION_META: Record<string, ActionMeta> = {
  CREATE: { label: "tạo mới", icon: CirclePlus, tone: "emerald" },
  UPDATE: { label: "cập nhật", icon: FileEdit, tone: "blue" },
  DELETE: { label: "xoá", icon: Trash2, tone: "rose" },
  LOGIN: { label: "đăng nhập", icon: LogIn, tone: "zinc", noEntity: true },
  LOGOUT: { label: "đăng xuất", icon: LogOut, tone: "zinc", noEntity: true },
  RELEASE: { label: "phát hành", icon: Rocket, tone: "violet" },
  SNAPSHOT: { label: "chốt BOM cho", icon: FileText, tone: "indigo" },
  POST: { label: "ghi sổ", icon: PackageCheck, tone: "indigo" },
  CANCEL: { label: "huỷ", icon: CircleX, tone: "rose" },
  UPLOAD: { label: "tải lên", icon: Upload, tone: "blue" },
  COMMIT: { label: "chốt nhập", icon: CheckCircle2, tone: "emerald" },
  TRANSITION: { label: "chuyển trạng thái", icon: Activity, tone: "indigo" },
  RESERVE: { label: "giữ chỗ", icon: Inbox, tone: "amber" },
  ISSUE: { label: "xuất kho", icon: PackageCheck, tone: "violet" },
  RECEIVE: { label: "nhận hàng", icon: Truck, tone: "emerald" },
  APPROVE: { label: "phê duyệt", icon: CheckCircle2, tone: "emerald" },
  CONVERT: { label: "chuyển đổi", icon: FileEdit, tone: "blue" },
  WO_START: { label: "bắt đầu", icon: PlayCircle, tone: "emerald" },
  WO_PAUSE: { label: "tạm dừng", icon: PauseCircle, tone: "amber" },
  WO_RESUME: { label: "tiếp tục", icon: PlayCircle, tone: "blue" },
  WO_COMPLETE: { label: "hoàn tất", icon: CheckCircle2, tone: "emerald" },
  ECO_SUBMIT: { label: "gửi duyệt", icon: FileText, tone: "violet" },
  ECO_APPROVE: { label: "duyệt", icon: CheckCircle2, tone: "emerald" },
  ECO_APPLY: { label: "áp dụng", icon: Rocket, tone: "indigo" },
  ECO_REJECT: { label: "từ chối", icon: CircleX, tone: "rose" },
  QC_CHECK: { label: "kiểm tra QC", icon: CheckCircle2, tone: "indigo" },
};

const TONE_DOT: Record<string, string> = {
  emerald: "bg-emerald-500 ring-emerald-100 dark:ring-emerald-950",
  blue: "bg-sky-500 ring-sky-100 dark:ring-sky-950",
  rose: "bg-rose-500 ring-rose-100 dark:ring-rose-950",
  amber: "bg-amber-500 ring-amber-100 dark:ring-amber-950",
  indigo: "bg-indigo-500 ring-indigo-100 dark:ring-indigo-950",
  // V4.1 UI-24: bỏ tím (ngoài bảng màu) — dùng indigo thương hiệu.
  violet: "bg-indigo-500 ring-indigo-100 dark:ring-indigo-950",
  zinc: "bg-zinc-400 ring-zinc-100 dark:ring-zinc-800",
};

const TONE_ICON_BG: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800/60",
  blue: "bg-sky-50 text-sky-700 ring-sky-200/60 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-800/60",
  rose: "bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800/60",
  amber: "bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800/60",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200/60 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-800/60",
  violet: "bg-indigo-50 text-indigo-700 ring-indigo-200/60 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-800/60",
  zinc: "bg-zinc-100 text-zinc-600 ring-zinc-200/60 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
};

// V4.1 UI-27: nhãn đối tượng từ lib/status.ts (ENTITY_LABELS) — bỏ map cục bộ.
// Bổ sung vài loại chỉ xuất hiện ở feed này (chưa có trong lib/status.ts).
const EXTRA_ENTITY_LABEL: Record<string, string> = {
  import_batch: "lô nhập Excel",
};

function entityLabel(t: string): string {
  return EXTRA_ENTITY_LABEL[t] ?? entityLabelVN(t);
}

/** Động từ theo ngữ cảnh: POST trên PO = đánh dấu đã gửi NCC. */
function verbFor(action: string, objectType: string, fallback: string): string {
  if (action === "POST" && objectType === "purchase_order") return "gửi";
  return fallback;
}

/**
 * V4.1: ghi chú kỹ thuật (tiếng Anh / key=value như "created (orderType=NEW)",
 * "Progress log: PROGRESS_REPORT") KHÔNG hiện cho người dùng. Chỉ giữ ghi chú
 * viết tiếng Việt có dấu, không chứa cặp key=value.
 */
function humanNote(notes: string | null): string | null {
  if (!notes) return null;
  const n = notes.trim();
  if (!n) return null;
  if (/\w=\w/.test(n)) return null;
  if (/^progress log/i.test(n)) return null;
  if (!/[à-ỹđ]/i.test(n)) return null;
  return n;
}

interface RecentActivityCardProps {
  className?: string;
}

export function RecentActivityCard({ className }: RecentActivityCardProps) {
  const [data, setData] = React.useState<ActivityPayload | null>(null);
  // V4.1 UI-05: giữ nguyên lỗi (có "HTTP xxx") để QueryError phân loại.
  const [error, setError] = React.useState<Error | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [retrying, setRetrying] = React.useState(false);
  const [, setTick] = React.useState(0);

  const fetchData = React.useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/dashboard/activity?limit=${FETCH_LIMIT}`, {
        signal,
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as ActivityPayload;
      setData({ ...payload, items: pickFeedItems(payload.items ?? []) });
      setError(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e as Error);
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
        "dashboard-stagger-fade relative flex flex-col gap-4 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 md:p-5",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100/80 text-indigo-700 ring-1 ring-indigo-200/60 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-800/60"
          >
            <Activity className="h-4 w-4" strokeWidth={2} />
          </span>
          <h2 className="text-[14px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Hoạt động gần đây
          </h2>
        </div>
        <span className="text-[10.5px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {data?.items?.length ? `${data.items.length} sự kiện` : null}
        </span>
      </header>

      {error ? (
        <QueryError
          compact
          error={error}
          retrying={retrying}
          onRetry={() => {
            setRetrying(true);
            void fetchData().finally(() => setRetrying(false));
          }}
          title="Không tải được hoạt động"
        />
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
            className="absolute left-[15px] top-2 bottom-2 w-px bg-zinc-200 dark:bg-zinc-700"
          />
          {data.items.map((it) => {
            const meta: ActionMeta =
              ACTION_META[it.action] ?? {
                // Mã hành động lạ → động từ trung tính, không lộ mã thô.
                label: "thao tác trên",
                icon: Activity,
                tone: "zinc",
              };
            const Icon = meta.icon;
            const note = humanNote(it.notes);
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
                  <p className="truncate text-[13px] leading-snug text-zinc-700 dark:text-zinc-300">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                      {it.actorDisplay ?? it.actor ?? "Hệ thống"}
                    </span>{" "}
                    {verbFor(it.action, it.objectType, meta.label)}
                    {meta.noEntity || it.objectType === "session" ? null : (
                      <>
                        {" "}
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {entityLabel(it.objectType)}
                        </span>
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-zinc-500 dark:text-zinc-400">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-block h-1.5 w-1.5 rounded-full ring-2",
                        TONE_DOT[meta.tone] ?? TONE_DOT.zinc,
                      )}
                    />
                    {formatRelative(it.occurredAt)}
                    {note ? (
                      <>
                        <span className="text-zinc-300 dark:text-zinc-600">•</span>
                        <span className="truncate">{note}</span>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : error ? null : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-10 dark:border-zinc-700 dark:bg-zinc-800/40">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700">
            <Activity className="h-4 w-4 text-zinc-400 dark:text-zinc-500" strokeWidth={2} />
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Chưa có hoạt động</p>
        </div>
      )}
    </section>
  );
}
