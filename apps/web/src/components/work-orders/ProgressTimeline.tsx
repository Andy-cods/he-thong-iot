"use client";

import * as React from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileText,
  Pause,
  Play,
  ShieldAlert,
  ShieldCheck,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useWoProgressLog,
  type WoProgressLogRow,
  type WoProgressStepType,
} from "@/hooks/useWorkOrders";

/**
 * V1.9-P4 — timeline dọc từ wo_progress_log.
 * Filter theo step_type (chip). Hiện 30 entry mới nhất, click expand ảnh.
 */

const STEP_META: Record<
  WoProgressStepType,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  PROGRESS_REPORT: {
    label: "Tiến độ",
    icon: CheckCircle2,
    tone: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  PAUSE: {
    label: "Tạm dừng",
    icon: Pause,
    tone: "bg-amber-50 text-amber-700 border-amber-200",
  },
  RESUME: {
    label: "Tiếp tục",
    icon: Play,
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  QC_PASS: {
    label: "QC đạt",
    icon: ShieldCheck,
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  QC_FAIL: {
    label: "QC lỗi",
    icon: ShieldAlert,
    tone: "bg-red-50 text-red-700 border-red-200",
  },
  ISSUE: {
    label: "Sự cố",
    icon: AlertCircle,
    tone: "bg-red-50 text-red-700 border-red-200",
  },
  NOTE: {
    label: "Ghi chú",
    icon: FileText,
    tone: "bg-zinc-50 text-zinc-700 border-zinc-200",
  },
  PHOTO: {
    label: "Ảnh",
    icon: Camera,
    tone: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
};

const ALL_STEPS: WoProgressStepType[] = [
  "PROGRESS_REPORT",
  "QC_PASS",
  "QC_FAIL",
  "ISSUE",
  "PAUSE",
  "RESUME",
  "NOTE",
  "PHOTO",
];

export function ProgressTimeline({ woId }: { woId: string }) {
  const query = useWoProgressLog(woId);
  const [filter, setFilter] = React.useState<Set<WoProgressStepType>>(
    new Set(ALL_STEPS),
  );
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const toggleFilter = (s: WoProgressStepType) => {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const rows = (query.data?.data ?? []).filter((r) =>
    filter.has(r.stepType),
  );

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-800">
          Nhật ký tiến độ
          <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono text-zinc-600">
            {query.data?.meta.total ?? 0}
          </span>
        </h3>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {ALL_STEPS.map((s) => {
          const meta = STEP_META[s];
          const active = filter.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleFilter(s)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                active
                  ? meta.tone
                  : "border-zinc-200 bg-white text-zinc-400 hover:bg-zinc-50"
              }`}
            >
              <meta.icon className="h-3 w-3" />
              {meta.label}
            </button>
          );
        })}
      </div>

      {query.isLoading ? (
        <div className="py-6 text-center text-xs text-zinc-500">Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-200 py-6 text-center text-xs text-zinc-500">
          Chưa có entry nào khớp bộ lọc.
        </div>
      ) : (
        <ol className="relative space-y-3">
          {rows.map((r, idx) => (
            <TimelineEntry
              key={r.id}
              row={r}
              last={idx === rows.length - 1}
              expanded={!!expanded[r.id]}
              onToggle={() =>
                setExpanded((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
              }
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineEntry({
  row,
  last,
  expanded,
  onToggle,
}: {
  row: WoProgressLogRow;
  last: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = STEP_META[row.stepType];
  const Icon = meta.icon;
  const qtyCompleted = Number(row.qtyCompleted);
  const qtyScrap = Number(row.qtyScrap);

  return (
    <li className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${meta.tone}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        {!last && <div className="mt-1 h-full w-px flex-1 bg-zinc-200" />}
      </div>
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`${meta.tone} text-[10px]`}>
            {meta.label}
          </Badge>
          <span className="flex items-center gap-1 text-xs font-medium text-zinc-800">
            <User className="h-3 w-3 text-zinc-400" />
            {row.operatorDisplayName ??
              row.operatorUsername ??
              "Hệ thống"}
          </span>
          {row.station && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
              {row.station}
            </span>
          )}
          <span className="font-mono text-[10px] text-zinc-400">
            {new Date(row.createdAt).toLocaleString("vi-VN")}
          </span>
        </div>

        {(qtyCompleted > 0 || qtyScrap > 0) && (
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            {qtyCompleted > 0 && (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                +{qtyCompleted.toLocaleString("vi-VN")} đạt
              </span>
            )}
            {qtyScrap > 0 && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">
                {qtyScrap.toLocaleString("vi-VN")} phế
              </span>
            )}
            {row.durationMinutes && row.durationMinutes > 0 && (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">
                {row.durationMinutes} phút
              </span>
            )}
          </div>
        )}

        {row.notes && (
          <div
            className={`mt-1.5 text-xs text-zinc-700 ${expanded ? "" : "line-clamp-2"}`}
          >
            {row.notes}
          </div>
        )}
        {(row.notes && row.notes.length > 120) || row.photoUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="mt-1 h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-700"
          >
            {expanded ? "Thu gọn" : "Xem thêm"}
          </Button>
        ) : null}
        {expanded && row.photoUrl && (
          <a
            href={row.photoUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block max-w-[300px] break-all rounded border border-zinc-200 bg-zinc-50 p-2 text-[11px] text-indigo-700 underline"
          >
            {row.photoUrl}
          </a>
        )}
      </div>
    </li>
  );
}
