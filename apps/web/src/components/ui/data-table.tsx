"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  cellClassForKind,
  isInteractiveTarget,
  splitMobileColumns,
  type ColumnLayoutInput,
} from "@/lib/data-table";
import { cn } from "@/lib/utils";

/**
 * V4.1 UI-11..14 (Đợt 6C, X4) — CHUẨN BẢNG dùng chung.
 *
 * - `<table>` thật → header và ô thân luôn thẳng cột (hết "NHÀ CUNG CẤP|TRẠNG THÁI" dính).
 * - Header dính (sticky top-0) trong khung cuộn; khung cuộn ngang khi hẹp (`minWidth`).
 * - Cột `number|money` canh phải + tabular-nums; `code` mono + truncate + title.
 * - Hàng tổng tuỳ chọn (`footer` của cột).
 * - Điện thoại (< md): tự chuyển DẠNG THẺ — dòng 1 = cột primary + status,
 *   bên dưới là lưới "nhãn: giá trị" của cột secondary; menu ⋯ góc phải.
 * - Hành động phá huỷ (xoá/huỷ) đặt trong `RowActionsMenu` (⋯), không để icon đỏ mỗi dòng.
 *
 * Trạng thái lỗi / rỗng do trang gọi xử lý (QueryError / EmptyState) như 6A.
 */

export interface DataTableColumn<T> extends ColumnLayoutInput {
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  /** Nhãn trong thẻ điện thoại (mặc định = header). */
  mobileLabel?: React.ReactNode;
  /** Độ rộng cột desktop (px hoặc CSS). */
  width?: number | string;
  className?: string;
  headerClassName?: string;
  /** Nội dung hàng tổng (cuối bảng). Có ≥1 cột khai báo → hiện hàng tổng. */
  footer?: React.ReactNode;
  /** Ẩn cột trên desktop hẹp (< lg). */
  hideBelowLg?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T, index: number) => string;
  loading?: boolean;
  skeletonRows?: number;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T, index: number) => string | undefined;
  ariaLabel?: string;
  /** Độ rộng tối thiểu bảng desktop → cuộn ngang thay vì bóp cột. */
  minWidth?: number;
  /** Lớp cho khung cuộn (VD `h-full`, `max-h-[70vh]`). */
  className?: string;
  /** Nhãn hàng tổng ở thẻ điện thoại. */
  footerLabel?: React.ReactNode;
  /** Tắt dạng thẻ điện thoại (bảng cuộn ngang ở mọi cỡ). */
  disableMobileCards?: boolean;
  /** Thẻ điện thoại tuỳ biến hoàn toàn. */
  renderMobileCard?: (row: T, index: number) => React.ReactNode;
  /** Nội dung dưới cùng danh sách thẻ điện thoại (VD hàng tổng tự vẽ). */
  mobileFooter?: React.ReactNode;
  dense?: boolean;
}

function widthStyle(w: number | string | undefined): React.CSSProperties | undefined {
  if (w === undefined) return undefined;
  return { width: typeof w === "number" ? `${w}px` : w };
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  loading,
  skeletonRows = 6,
  onRowClick,
  rowClassName,
  ariaLabel,
  minWidth,
  className,
  footerLabel = "Tổng",
  disableMobileCards,
  renderMobileCard,
  mobileFooter,
  dense,
}: DataTableProps<T>) {
  const hasFooter = columns.some(
    (c) => c.footer !== undefined && (c.kind === "money" || c.kind === "number"),
  );
  const showSkeleton = loading && rows.length === 0;
  const mobile = React.useMemo(() => splitMobileColumns(columns), [columns]);
  const cellPad = dense ? "px-3 py-1.5" : "px-3 py-2.5";

  const handleRowClick = (row: T) => (e: React.MouseEvent) => {
    if (!onRowClick) return;
    if (isInteractiveTarget(e.target as Element)) return;
    onRowClick(row);
  };
  const handleRowKey = (row: T) => (e: React.KeyboardEvent) => {
    if (!onRowClick) return;
    if (e.key === "Enter" && e.target === e.currentTarget) onRowClick(row);
  };

  const table = (
    <div
      role="region"
      aria-label={ariaLabel}
      className={cn(
        // V4.3 Đợt 2 mục 1 — thẻ trắng bo 14px KHÔNG viền (chỉ shadow rất nhẹ),
        // nổi trên nền trang xám thay vì panel viền dính sát các khối khác.
        "relative w-full overflow-auto rounded-xl bg-white shadow-xs dark:bg-zinc-900",
        !disableMobileCards && "hidden md:block",
        className,
      )}
    >
      <table
        className="w-full border-separate border-spacing-0 text-left text-md text-zinc-800 dark:text-zinc-200"
        style={minWidth ? { minWidth: `${minWidth}px` } : undefined}
      >
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.id}
                scope="col"
                style={widthStyle(c.width)}
                className={cn(
                  "sticky top-0 z-10 whitespace-nowrap border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400",
                  (c.kind === "number" || c.kind === "money" || c.kind === "actions") && "text-right",
                  c.hideBelowLg && "hidden lg:table-cell",
                  c.headerClassName,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {showSkeleton
            ? Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      className={cn(
                        "border-b border-zinc-100 dark:border-zinc-800",
                        cellPad,
                        c.hideBelowLg && "hidden lg:table-cell",
                      )}
                    >
                      <Skeleton className="h-4 w-full max-w-[8rem]" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row, i) => (
                <tr
                  key={getRowKey(row, i)}
                  onClick={onRowClick ? handleRowClick(row) : undefined}
                  onKeyDown={onRowClick ? handleRowKey(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    "group transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                    onRowClick && "cursor-pointer focus-visible:bg-indigo-50/60 focus-visible:outline-none dark:focus-visible:bg-indigo-500/10",
                    rowClassName?.(row, i),
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      className={cn(
                        "border-b border-zinc-100 align-middle dark:border-zinc-800",
                        cellPad,
                        cellClassForKind(c.kind),
                        c.hideBelowLg && "hidden lg:table-cell",
                        c.className,
                      )}
                    >
                      {c.cell(row, i)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
        {hasFooter && !showSkeleton && rows.length > 0 && (
          <tfoot>
            <tr>
              {columns.map((c) => (
                <td
                  key={c.id}
                  className={cn(
                    "sticky bottom-0 border-t border-zinc-200 bg-zinc-50 font-semibold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50",
                    cellPad,
                    cellClassForKind(c.kind),
                    c.hideBelowLg && "hidden lg:table-cell",
                  )}
                >
                  {c.footer}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  if (disableMobileCards) return table;

  return (
    <>
      {table}
      {/* Điện thoại: dạng thẻ. */}
      <ul className="space-y-2 md:hidden" aria-label={ariaLabel}>
        {showSkeleton
          ? Array.from({ length: Math.min(skeletonRows, 4) }).map((_, i) => (
              <li
                key={`sk-${i}`}
                className="rounded-xl bg-white p-3 shadow-xs dark:bg-zinc-900"
              >
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-48" />
              </li>
            ))
          : rows.map((row, i) => (
              <li
                key={getRowKey(row, i)}
                onClick={onRowClick ? handleRowClick(row) : undefined}
                onKeyDown={onRowClick ? handleRowKey(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  "rounded-xl bg-white p-3 text-md shadow-xs dark:bg-zinc-900",
                  onRowClick && "cursor-pointer active:bg-zinc-50 dark:active:bg-zinc-800/60",
                  rowClassName?.(row, i),
                )}
              >
                {renderMobileCard ? (
                  renderMobileCard(row, i)
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        {mobile.primary.map((c) => (
                          <div key={c.id} className="min-w-0 truncate font-medium text-zinc-900 dark:text-zinc-50">
                            {c.cell(row, i)}
                          </div>
                        ))}
                      </div>
                      {mobile.status.length > 0 && (
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {mobile.status.map((c) => (
                            <div key={c.id}>{c.cell(row, i)}</div>
                          ))}
                        </div>
                      )}
                      {mobile.actions.map((c) => (
                        <div key={c.id} className="-mr-1 -mt-1 shrink-0">
                          {c.cell(row, i)}
                        </div>
                      ))}
                    </div>
                    {mobile.secondary.length > 0 && (
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                        {mobile.secondary.map((c) => (
                          <div key={c.id} className="min-w-0">
                            <dt className="text-base text-zinc-500 dark:text-zinc-400">
                              {c.mobileLabel ?? c.header}
                            </dt>
                            <dd
                              className={cn(
                                "min-w-0 truncate text-zinc-800 dark:text-zinc-200",
                                (c.kind === "number" || c.kind === "money" || c.kind === "date") && "tabular-nums",
                              )}
                            >
                              {c.cell(row, i)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </>
                )}
              </li>
            ))}
        {mobileFooter ??
          (hasFooter && !showSkeleton && rows.length > 0 ? (
            <li className="rounded-xl bg-zinc-100 p-3 text-md font-semibold dark:bg-zinc-800">
              <div className="text-base font-medium text-zinc-500 dark:text-zinc-400">{footerLabel}</div>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                {columns
                  .filter(
                    (c) =>
                      c.footer !== undefined &&
                      c.footer !== null &&
                      (c.kind === "money" || c.kind === "number"),
                  )
                  .map((c) => (
                    <div key={c.id} className="min-w-0">
                      <dt className="text-base font-normal text-zinc-500 dark:text-zinc-400">
                        {c.mobileLabel ?? c.header}
                      </dt>
                      <dd className="tabular-nums text-zinc-900 dark:text-zinc-50">{c.footer}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          ) : null)}
      </ul>
    </>
  );
}

/* ── Ô mã: mono + truncate + tooltip title ───────────────────────────────── */

export function CodeText({
  value,
  className,
  maxWidth = "12rem",
}: {
  value: string | null | undefined;
  className?: string;
  maxWidth?: string;
}) {
  if (!value) return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  return (
    <span
      className={cn("inline-block max-w-full truncate align-bottom font-mono text-sm", className)}
      style={{ maxWidth }}
      title={value}
    >
      {value}
    </span>
  );
}

/* ── Menu hành động hàng "⋯" ──────────────────────────────────────────────── */

export interface RowAction {
  label: string;
  onSelect: () => void;
  icon?: React.ElementType;
  /** Hành động phá huỷ (xoá / huỷ) — chữ đỏ, tách bằng vạch ngăn. */
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

export function RowActionsMenu({
  actions,
  label = "Thao tác",
  className,
}: {
  actions: RowAction[];
  label?: string;
  className?: string;
}) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;
  const normal = visible.filter((a) => !a.danger);
  const danger = visible.filter((a) => a.danger);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
            className,
          )}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]" onClick={(e) => e.stopPropagation()}>
        {normal.map((a) => (
          <DropdownMenuItem key={a.label} disabled={a.disabled} onSelect={() => a.onSelect()}>
            {a.icon ? <a.icon className="h-4 w-4" aria-hidden /> : null}
            {a.label}
          </DropdownMenuItem>
        ))}
        {normal.length > 0 && danger.length > 0 && <DropdownMenuSeparator />}
        {danger.map((a) => (
          <DropdownMenuItem key={a.label} variant="danger" disabled={a.disabled} onSelect={() => a.onSelect()}>
            {a.icon ? <a.icon className="h-4 w-4" aria-hidden /> : null}
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Thẻ KPI trung tính (X8) ──────────────────────────────────────────────── */

/**
 * V4.1 UI-24 (X8) — thẻ KPI trắng viền zinc, số đen, icon zinc. Màu CHỈ dùng
 * khi mã hoá trạng thái (`tone` = chấm + chữ phụ), không tô nền/viền cả thẻ.
 */
export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  size = "default",
  className,
  onClick,
  active,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ElementType;
  tone?: "warning" | "danger" | "success" | "progress";
  /**
   * MỚI (N1 APPLE_DESIGN_SYSTEM.md) — `"hero"` cho ĐÚNG 1 số quan trọng nhất/
   * trang (số nặng hơn hẳn số phụ, kiểu Apple Health/Stocks). Additive, không
   * đổi mặc định `"default"` (giao diện cũ giữ nguyên 100%).
   */
  size?: "default" | "hero";
  className?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const toneDot = {
    warning: "bg-amber-500",
    danger: "bg-red-500",
    success: "bg-emerald-500",
    progress: "bg-indigo-500",
  } as const;
  const toneText = {
    warning: "text-amber-700 dark:text-amber-400",
    danger: "text-red-700 dark:text-red-400",
    success: "text-emerald-700 dark:text-emerald-400",
    progress: "text-indigo-700 dark:text-indigo-300",
  } as const;
  const isHero = size === "hero";
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? Boolean(active) : undefined}
      className={cn(
        // V4.3 Đợt 2 mục 1 — thẻ trắng bo 14px KHÔNG viền, shadow rất nhẹ
        // (viền chỉ còn dùng làm vòng chọn `active`, không phải khung mặc định).
        "min-w-0 rounded-xl bg-white text-left shadow-xs dark:bg-zinc-900",
        isHero ? "p-4 md:p-5" : "p-3 md:p-4",
        active
          ? "ring-1 ring-inset ring-indigo-500"
          : onClick && "transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {Icon ? (
          <Icon
            className={cn(
              "shrink-0 text-zinc-400 dark:text-zinc-500",
              isHero ? "h-5 w-5" : "h-4 w-4",
            )}
            aria-hidden
          />
        ) : null}
        <span
          className={cn(
            "min-w-0 truncate font-medium text-zinc-500 dark:text-zinc-400 text-base",
          )}
        >
          {label}
        </span>
        {tone ? <span className={cn("ml-auto h-2 w-2 shrink-0 rounded-full", toneDot[tone])} aria-hidden /> : null}
      </div>
      <div
        className={cn(
          "mt-1 truncate font-bold tabular-nums",
          isHero ? "text-3xl md:text-4xl" : "text-xl font-semibold",
          // V4.3 Đợt 2 mục 4 — ô hero tô màu ngữ nghĩa cho SỐ (không chỉ chấm/chữ
          // phụ), khớp mẫu B "Chờ xếp kệ" xanh nổi bật hơn hẳn 3 ô còn lại.
          isHero && tone ? toneText[tone] : "text-zinc-900 dark:text-zinc-50",
        )}
      >
        {value}
      </div>
      {sub ? (
        <div
          className={cn(
            "mt-0.5 truncate text-base",
            tone ? toneText[tone] : "text-zinc-500 dark:text-zinc-400",
          )}
        >
          {sub}
        </div>
      ) : null}
    </Comp>
  );
}
