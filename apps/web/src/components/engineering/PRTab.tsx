"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import { PR_STATUSES, can } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PRListTable } from "@/components/procurement/PRListTable";
import { usePurchaseRequestsList } from "@/hooks/usePurchaseRequests";
import { useSession } from "@/hooks/useSession";
import type { PRFilter } from "@/lib/query-keys";

/**
 * /procurement/purchase-requests — list PR với filter status + pagination.
 */
export function PRTab() {
  const [urlState, setUrlState] = useQueryStates(
    {
      status: parseAsStringEnum(["all", ...PR_STATUSES]).withDefault("all"),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
      q: parseAsString.withDefault(""),
    },
    { history: "replace", shallow: true },
  );

  const filter: PRFilter = React.useMemo(() => {
    return {
      status:
        urlState.status === "all"
          ? undefined
          : [urlState.status as (typeof PR_STATUSES)[number]],
      page: urlState.page,
      pageSize: urlState.pageSize,
      q: urlState.q || undefined,
    };
  }, [urlState]);

  const query = usePurchaseRequestsList(filter);
  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));

  const isEmpty = !query.isLoading && rows.length === 0;
  const hasFilter = urlState.status !== "all" || urlState.q !== "";

  // V3.7.55 — phân quyền nút tạo PR theo role:
  // V3.7.73 — Đã bỏ "Tạo PR nhanh" (form demo wizard). Mọi role tạo PR
  // đều dùng Phiếu MRF GTAM chính thức (form đầy đủ 5 section).
  const session = useSession();
  const roles = session.data?.roles ?? [];
  // V3.9 — dùng thẳng RBAC matrix thay vì hardcode list role → tự đúng cho
  // purchaser/qc/accountant (create pr) mà không lệch với matrix.
  const canCreateMRF = can(roles, "create", "pr");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
            <Link href="/" className="hover:text-zinc-900 hover:underline">
              Tổng quan
            </Link>
            {" / "}
            <span className="text-zinc-900">Đề xuất vật tư</span>
          </nav>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Đề xuất mua vật tư (YCVT/MRF)
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {total.toLocaleString("vi-VN")} phiếu
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateMRF && (
            <>
              {/* V3.10 — 2 form để chọn: DNVT (mẫu giấy GTAM) + MRF (có cột giá). */}
              <Button asChild title="Phiếu đề xuất vật tư mẫu GTAM/PRD-MRF-02 (khớp form giấy xưởng)">
                <Link href="/procurement/purchase-requests/new-dnvt">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Phiếu đề xuất vật tư (DNVT)
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                title="Phiếu MRF có cột Đơn giá / Tổng tiền (dùng khi cần ước tính chi phí)"
              >
                <Link href="/procurement/purchase-requests/new-mrf">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Phiếu MRF (có giá)
                </Link>
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-6 py-2">
        <div className="flex gap-1">
          {["all", ...PR_STATUSES].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void setUrlState({ status: s as typeof urlState.status, page: 1 })}
              className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
                urlState.status === s
                  ? "bg-blue-100 text-blue-700"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {s === "all" ? "Tất cả" : s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        {isEmpty ? (
          hasFilter ? (
            <EmptyState
              preset="no-filter-match"
              title="Không có PR khớp bộ lọc"
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void setUrlState({ status: "all", q: "", page: 1 })
                  }
                >
                  Xoá bộ lọc
                </Button>
              }
            />
          ) : (
            <EmptyState
              preset="no-bom"
              title="Chưa có phiếu đề xuất nào"
              description="Chọn mẫu phiếu bên dưới để tạo đề xuất mua vật tư gửi Bộ phận Thu mua duyệt."
              actions={
                canCreateMRF ? (
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm">
                      <Link href="/procurement/purchase-requests/new-dnvt">
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Phiếu đề xuất vật tư (DNVT)
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/procurement/purchase-requests/new-mrf">
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Phiếu MRF (có giá)
                      </Link>
                    </Button>
                  </div>
                ) : undefined
              }
            />
          )
        ) : (
          <PRListTable rows={rows} loading={query.isLoading} />
        )}
      </div>

      <footer className="flex h-9 items-center justify-between border-t border-zinc-200 bg-white px-4 text-base">
        <div className="text-zinc-600 tabular-nums">
          Trang {urlState.page} / {pageCount}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={urlState.page <= 1}
            onClick={() =>
              void setUrlState({ page: Math.max(1, urlState.page - 1) })
            }
          >
            ‹
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={urlState.page >= pageCount}
            onClick={() =>
              void setUrlState({ page: Math.min(pageCount, urlState.page + 1) })
            }
          >
            ›
          </Button>
        </div>
      </footer>
    </div>
  );
}
