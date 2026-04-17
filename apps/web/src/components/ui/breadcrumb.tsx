"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Direction B — Breadcrumb nav.
 * Last item có aria-current="page", separator aria-hidden.
 * Auto-collapse middle nếu items > maxItems (default 3).
 */

export interface BreadcrumbItemData {
  label: string;
  href?: string;
}

export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItemData[];
  maxItems?: number;
}

export function Breadcrumb({
  items,
  maxItems = 4,
  className,
  ...props
}: BreadcrumbProps) {
  const display = collapseItems(items, maxItems);
  return (
    <nav aria-label="Breadcrumb" className={cn("text-sm", className)} {...props}>
      <ol className="flex flex-wrap items-center gap-1 text-slate-600">
        {display.map((item, idx) => {
          const isLast = idx === display.length - 1;
          if (item === "…") {
            return (
              <li key={`ellipsis-${idx}`} className="flex items-center gap-1">
                <MoreHorizontal
                  className="h-4 w-4 text-slate-400"
                  aria-hidden="true"
                />
                <Separator />
              </li>
            );
          }
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-1">
              {isLast ? (
                <span
                  className="font-medium text-slate-900"
                  aria-current="page"
                >
                  {item.label}
                </span>
              ) : item.href ? (
                <Link
                  href={item.href}
                  className="text-slate-600 transition-colors hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
              {isLast ? null : <Separator />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Separator() {
  return (
    <ChevronRight
      className="h-3.5 w-3.5 text-slate-400"
      aria-hidden="true"
    />
  );
}

function collapseItems(
  items: BreadcrumbItemData[],
  max: number,
): Array<BreadcrumbItemData | "…"> {
  if (items.length <= max) return items;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const before = items[items.length - 2];
  const result: Array<BreadcrumbItemData | "…"> = [first, "…"];
  if (before) result.push(before);
  result.push(last);
  return result;
}

/**
 * useBreadcrumb — auto-generate từ pathname.
 * VD: `/items/ABC-001` → [{label:"Vật tư",href:"/items"},{label:"ABC-001"}].
 * Labels lấy từ map cho các segment quen thuộc, fallback uppercase.
 */
const SEGMENT_LABELS: Record<string, string> = {
  "": "Trang chủ",
  items: "Vật tư",
  suppliers: "Nhà cung cấp",
  import: "Nhập Excel",
  new: "Tạo mới",
  pwa: "PWA",
  receive: "Nhận hàng",
  dashboard: "Tổng quan",
  admin: "Quản trị",
};

export function useBreadcrumb(pathname: string): BreadcrumbItemData[] {
  return React.useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const items: BreadcrumbItemData[] = [{ label: "Trang chủ", href: "/" }];
    let acc = "";
    for (const seg of segments) {
      acc += `/${seg}`;
      const label = SEGMENT_LABELS[seg] ?? decodeURIComponent(seg);
      items.push({ label, href: acc });
    }
    // Item cuối: bỏ href (trang hiện tại).
    if (items.length > 0) {
      const lastItem = items[items.length - 1]!;
      items[items.length - 1] = { label: lastItem.label };
    }
    return items;
  }, [pathname]);
}
