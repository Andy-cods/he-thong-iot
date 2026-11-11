"use client";

import * as React from "react";
import { AlertTriangle, ArrowLeft, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BomImportDecisionInput, TkPreviewRow, TrienKhaiPreview } from "@/hooks/useBomImport";
import { cn } from "@/lib/utils";
import { buildDecisions, reasonText, undecidedPositions, type MatchChoice } from "./matchDecisions";

type Filter = "ALL" | "MATCH" | "CONFIRM" | "NEW";

const PILL: Record<"MATCH" | "CONFIRM" | "NEW", { label: string; cls: string }> = {
  MATCH: { label: "Khớp", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
  CONFIRM: { label: "Cần xác nhận", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  NEW: { label: "Tạo mới", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300" },
};

interface Props {
  data: TrienKhaiPreview;
  committing: boolean;
  onBack: () => void;
  onCommit: (decisions: BomImportDecisionInput[]) => void;
}

/**
 * V5 WP4b — bước "Khớp vật tư" cho mẫu BOM triển khai.
 * Dòng CONFIRM phải chọn 1 vật tư ứng viên hoặc "Tạo mới" mới được commit.
 */
export function BomImportMatchStep({ data, committing, onBack, onCommit }: Props) {
  const [choice, setChoice] = React.useState<MatchChoice>({});
  const [filter, setFilter] = React.useState<Filter>("ALL");

  const { rows, matchStats: st } = data;
  const undecided = undecidedPositions(rows, choice);
  const shown = filter === "ALL" ? rows : rows.filter((r) => r.match.status === filter);

  const cards: Array<{ key: Filter | "SUP"; label: string; value: number; tone: string }> = [
    { key: "MATCH", label: "Khớp", value: st.match, tone: "text-emerald-700 dark:text-emerald-300" },
    { key: "CONFIRM", label: "Cần xác nhận", value: st.confirm, tone: "text-amber-700 dark:text-amber-300" },
    { key: "NEW", label: "Tạo mới", value: st.new, tone: "text-sky-700 dark:text-sky-300" },
    { key: "SUP", label: "NCC cần chốt", value: st.supplierPending, tone: "text-zinc-800 dark:text-zinc-100" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {data.title ?? data.sheetName}
          {data.projectCode ? (
            <span className="ml-2 text-sm font-normal text-zinc-500">{data.projectCode}</span>
          ) : null}
        </h2>
        <p className="text-sm text-zinc-500">
          {st.total} dòng · kiểm tra khớp vật tư trước khi tạo BOM
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => {
          const clickable = c.key !== "SUP";
          const active = clickable && filter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && setFilter(active ? "ALL" : (c.key as Filter))}
              className={cn(
                "rounded-2xl bg-zinc-100 p-4 text-left transition dark:bg-zinc-800/60",
                clickable && "hover:bg-zinc-200/70 dark:hover:bg-zinc-800",
                active && "ring-2 ring-indigo-500",
              )}
            >
              <div className="text-xs font-medium text-zinc-500">{c.label}</div>
              <div className={cn("mt-1 text-2xl font-semibold tabular-nums", c.tone)}>{c.value}</div>
            </button>
          );
        })}
      </div>

      {st.suppliersMissing.length > 0 && (
        <div className="rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
          NCC chưa có trong danh mục:{" "}
          <span className="font-medium">{st.suppliersMissing.join(", ")}</span>. Các dòng này sẽ để
          &quot;Cần chốt NCC&quot; sau khi tạo BOM.
        </div>
      )}
      {data.warnings.length > 0 && (
        <ul className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          {data.warnings.slice(0, 6).map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-2xl bg-zinc-50 dark:bg-zinc-900/60">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-zinc-500">
              <th className="px-3 py-3">Ảnh</th>
              <th className="px-3 py-3">ID</th>
              <th className="px-3 py-3">Tên 3D</th>
              <th className="px-3 py-3">Mã vật liệu</th>
              <th className="px-3 py-3">Quy cách</th>
              <th className="px-3 py-3">Trạng thái</th>
              <th className="px-3 py-3">Vật tư hệ thống</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <MatchRow
                key={r.position}
                row={r}
                value={choice[r.position]}
                onChange={(v) => setChoice((c) => ({ ...c, [r.position]: v }))}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-2xl bg-white/90 px-4 py-3 backdrop-blur dark:bg-zinc-900/90">
        <Button variant="ghost" onClick={onBack} disabled={committing}>
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Quay lại
        </Button>
        <div className="flex items-center gap-3">
          {undecided.length > 0 && (
            <span className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Còn {undecided.length} dòng chưa quyết
            </span>
          )}
          <Button
            size="lg"
            disabled={undecided.length > 0 || committing}
            onClick={() => onCommit(buildDecisions(rows, choice))}
          >
            {committing ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Play className="mr-1 h-4 w-4" aria-hidden />
            )}
            Tạo BOM
          </Button>
        </div>
      </div>
    </div>
  );
}

function MatchRow({
  row,
  value,
  onChange,
}: {
  row: TkPreviewRow;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const m = row.match;
  const pill = PILL[m.status];
  const needsPick = m.status === "CONFIRM";
  return (
    <tr className={cn("align-top", needsPick && !value && "bg-amber-50/60 dark:bg-amber-950/20")}>
      <td className="px-3 py-2">
        {row.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.thumbUrl}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            decoding="async"
            className="h-10 w-10 rounded-lg bg-white object-contain"
          />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        )}
      </td>
      <td className="px-3 py-2 font-medium tabular-nums">{row.position}</td>
      <td className="max-w-[260px] px-3 py-2 break-words">{row.file3dName}</td>
      <td className="px-3 py-2">{row.materialCode ?? "—"}</td>
      <td className="px-3 py-2 tabular-nums">{row.dimsText ?? row.blankSpec ?? "—"}</td>
      <td className="px-3 py-2">
        <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium", pill.cls)}>
          {pill.label}
        </span>
      </td>
      <td className="px-3 py-2">
        {m.status === "MATCH" && (
          <span className="text-zinc-700 dark:text-zinc-200">
            {m.candidates.find((c) => c.itemId === m.itemId)?.sku ?? "—"}
          </span>
        )}
        {m.status === "NEW" && <span className="text-zinc-500">Sẽ tạo vật tư mới</span>}
        {needsPick && (
          <div className="space-y-1.5">
            {m.reasons.length > 0 && (
              <div className="text-xs text-amber-700 dark:text-amber-300">{reasonText(m.reasons)}</div>
            )}
            {m.candidates.map((c) => (
              <label key={c.itemId} className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name={`pick-${row.position}`}
                  checked={value === c.itemId}
                  onChange={() => onChange(c.itemId)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{c.sku}</span>
                  <span className="block text-xs text-zinc-500">{reasonText(c.reason)}</span>
                </span>
              </label>
            ))}
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name={`pick-${row.position}`}
                checked={value === "NEW"}
                onChange={() => onChange("NEW")}
              />
              <span className="font-medium">Tạo mới</span>
            </label>
          </div>
        )}
        {m.warnings.map((w, i) => (
          <div key={i} className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>đổi sang {w.text}</span>
          </div>
        ))}
      </td>
    </tr>
  );
}
