"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ScrollTabsList } from "@/components/common/ScrollTabsList";
import { ObjectAuditList } from "@/components/admin/ObjectAuditList";
import { PoQuickReceiveTable } from "@/components/procurement/PoQuickReceiveTable";
import { cn } from "@/lib/utils";
import { PoReceivingHistory } from "./PoReceivingHistory";

/**
 * V4.1 PO-UI: nội dung phụ dưới bảng dòng hàng — Nhận nhanh / Lịch sử nhận /
 * Nhật ký. Tab do trang điều khiển (nút "Nhận hàng" ở đầu trang mở tab Nhận nhanh).
 */

export type PoSecondaryTab = "receive" | "history" | "audit";

export const PoSecondaryTabs = React.forwardRef<
  HTMLElement,
  {
    poId: string;
    status: string;
    tab: PoSecondaryTab;
    onTabChange: (t: PoSecondaryTab) => void;
    isAdmin: boolean;
  }
>(function PoSecondaryTabs({ poId, status, tab, onTabChange, isAdmin }, ref) {
  const isDraft = status === "DRAFT";
  const tabs: Array<{ v: PoSecondaryTab; label: string; hide?: boolean }> = [
    { v: "receive", label: "Nhận nhanh", hide: isDraft || status === "CANCELLED" },
    { v: "history", label: "Lịch sử nhận", hide: isDraft },
    { v: "audit", label: "Nhật ký" },
  ];
  const visible = tabs.filter((t) => !t.hide);
  const active = visible.some((t) => t.v === tab) ? tab : (visible[0]?.v ?? "audit");

  return (
    <section
      ref={ref}
      className="min-w-0 scroll-mt-40 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <ScrollTabsList className="gap-1 px-2">
          {visible.map((t) => {
            const isActive = t.v === active;
            return (
              <li key={t.v} className="shrink-0">
                <button
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onTabChange(t.v)}
                  className={cn(
                    "relative flex h-9 items-center whitespace-nowrap px-3 text-sm font-medium transition-colors",
                    "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-t-full",
                    isActive
                      ? "text-indigo-700 after:bg-indigo-600 dark:text-indigo-300 dark:after:bg-indigo-400"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                  )}
                >
                  {t.label}
                </button>
              </li>
            );
          })}
        </ScrollTabsList>
      </div>
      <div className="p-3 md:p-4">
        {active === "receive" && (
          <PoQuickReceiveTable
            poId={poId}
            readOnly={status === "RECEIVED" || status === "CLOSED" || status === "CANCELLED"}
          />
        )}
        {active === "history" && <PoReceivingHistory poId={poId} />}
        {active === "audit" && (
          <div>
            {/* V4.1 AD-10 — lịch sử của CHÍNH PO này, xem ngay tại đây. */}
            {isAdmin ? (
              <div className="-mt-1 mb-1 flex justify-end">
                <Link
                  href={`/admin/audit?entity=purchase_order&objectId=${poId}`}
                  className="inline-flex items-center gap-0.5 text-xs text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400"
                >
                  Mở trong Nhật ký hệ thống <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : null}
            <ObjectAuditList objectType="purchase_order" objectId={poId} />
          </div>
        )}
      </div>
    </section>
  );
});
