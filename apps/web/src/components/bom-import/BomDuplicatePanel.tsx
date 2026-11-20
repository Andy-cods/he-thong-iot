"use client";

import * as React from "react";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-badge";
import type { BomCodeConflict } from "@/hooks/useBomImport";
import { cn } from "@/lib/utils";

export type DuplicateChoice = "replace" | "new_code";

/** Lựa chọn mặc định: ghi đè nếu MỌI BOM trùng ghi đè được, ngược lại mã mới. */
export function defaultDuplicateChoice(conflicts: readonly BomCodeConflict[]): DuplicateChoice {
  return conflicts.some((c) => c.replaceBlockedReason) ? "new_code" : "replace";
}

interface Props {
  conflicts: BomCodeConflict[];
  choice: DuplicateChoice;
  onChoice: (c: DuplicateChoice) => void;
  /** Mẫu triển khai (1 BOM) — cho sửa mã mới; cổ điển nhiều sheet tự lấy -V2… */
  newCode?: string;
  onNewCode?: (v: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

/**
 * Nhập lại BOM — mã BOM trong file đã có trong hệ thống. Bắt buộc chọn rõ:
 * Thay bằng bản mới (ghi đè) / Tạo BOM mới với mã khác / Huỷ. Không còn chế độ
 * "bỏ qua" âm thầm báo thành công.
 */
export function BomDuplicatePanel({
  conflicts,
  choice,
  onChoice,
  newCode,
  onNewCode,
  onCancel,
  disabled,
}: Props) {
  if (conflicts.length === 0) return null;
  const single = conflicts.length === 1 ? conflicts[0]! : null;
  const blocked = conflicts.filter((c) => c.replaceBlockedReason);
  const replaceDisabled = blocked.length > 0;
  const totalOld = conflicts.reduce((a, c) => a + c.lineCount, 0);
  const hasObsolete = conflicts.some((c) => c.status === "OBSOLETE");

  return (
    <section
      className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20"
      aria-label="BOM đã tồn tại"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {single ? (
              <>
                Mã BOM <span className="font-mono">{single.code}</span> đã tồn tại
              </>
            ) : (
              `${conflicts.length} mã BOM trong file đã tồn tại`
            )}
          </h3>
          <ul className="mt-1.5 space-y-1">
            {conflicts.map((c) => (
              <li key={c.code} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                {!single && <span className="font-mono font-semibold">{c.code}</span>}
                <span className="truncate">{c.name}</span>
                <span className="tabular-nums text-zinc-500 dark:text-zinc-400">· {c.lineCount} dòng</span>
                <StatusPill domain="bom" code={c.status} className="scale-90" />
                <a
                  href={`/bom/${c.templateId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Mở BOM <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div role="radiogroup" aria-label="Cách xử lý BOM trùng" className="mt-3 grid gap-2 md:grid-cols-2">
        <ChoiceCard
          selected={choice === "replace"}
          disabled={disabled || replaceDisabled}
          onSelect={() => onChoice("replace")}
          title="Thay bằng bản mới (ghi đè)"
          badge={replaceDisabled ? undefined : "Khuyến nghị"}
        >
          <p>
            Xoá {totalOld} dòng cũ, ghi các dòng trong file vào <strong>cùng BOM</strong> (giữ mã, giữ liên
            kết). Bản cũ được lưu vào Lịch sử phiên bản.
          </p>
          {hasObsolete && !replaceDisabled && (
            <p className="mt-1 text-amber-800 dark:text-amber-300">
              BOM đang Ngừng dùng — sau khi ghi đè sẽ về Nháp, cần Kích hoạt lại.
            </p>
          )}
          {blocked.map((c) => (
            <p key={c.code} className="mt-1 text-red-700 dark:text-red-400">
              {c.replaceBlockedReason}
            </p>
          ))}
        </ChoiceCard>

        <ChoiceCard
          selected={choice === "new_code"}
          disabled={disabled}
          onSelect={() => onChoice("new_code")}
          title="Tạo BOM mới với mã khác"
        >
          <p>BOM cũ giữ nguyên, không bị đụng tới.</p>
          {single && onNewCode ? (
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              <label htmlFor="bom-new-code" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                Mã BOM mới
              </label>
              <Input
                id="bom-new-code"
                value={newCode ?? ""}
                disabled={disabled}
                onFocus={() => onChoice("new_code")}
                onChange={(e) => onNewCode(e.target.value.toUpperCase())}
                className="h-8 font-mono text-sm"
                maxLength={64}
              />
            </div>
          ) : (
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">
              Mỗi BOM trùng tự lấy mã còn trống: {conflicts.map((c) => c.suggestedNewCode).join(", ")}.
            </p>
          )}
        </ChoiceCard>
      </div>

      <div className="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={disabled}>
          <X className="h-3.5 w-3.5" aria-hidden /> Huỷ — không nhập file này
        </Button>
      </div>
    </section>
  );
}

function ChoiceCard({
  selected,
  disabled,
  onSelect,
  title,
  badge,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "rounded-lg border bg-white p-3 text-left text-xs text-zinc-600 transition-colors dark:bg-zinc-900 dark:text-zinc-400",
        selected
          ? "border-indigo-500 ring-2 ring-indigo-500/20 dark:border-indigo-400"
          : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-indigo-600 dark:border-indigo-400" : "border-zinc-300 dark:border-zinc-600",
          )}
          aria-hidden
        >
          {selected && <span className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />}
        </span>
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</span>
        {badge && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
            {badge}
          </span>
        )}
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}
