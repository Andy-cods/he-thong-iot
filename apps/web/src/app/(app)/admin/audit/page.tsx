"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Download, Search, X } from "lucide-react";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from "nuqs";
import { toast } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { AuditRow } from "@/components/admin/AuditRow";
import { useAuditList } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

const ENTITY_OPTIONS = [
  { code: "item", label: "Vật tư" },
  { code: "supplier", label: "Nhà cung cấp" },
  { code: "bom_template", label: "BOM template" },
  { code: "bom_line", label: "BOM line" },
  { code: "user_account", label: "User" },
  { code: "receiving_event", label: "Receiving event" },
];

const ACTION_OPTIONS = [
  { code: "CREATE", label: "Tạo" },
  { code: "UPDATE", label: "Sửa" },
  { code: "DELETE", label: "Xoá" },
  { code: "LOGIN", label: "Đăng nhập" },
  { code: "LOGOUT", label: "Đăng xuất" },
];

// grid cols: time / user / action / entity / entityId / diff
const GRID_COLS =
  "grid-cols-[170px,130px,80px,140px,90px,minmax(0,1fr)]";

export default function AdminAuditPage() {
  const [urlState, setUrlState] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      from: parseAsString.withDefault(""),
      to: parseAsString.withDefault(""),
      entity: parseAsArrayOf(parseAsString).withDefault([]),
      action: parseAsArrayOf(parseAsString).withDefault([]),
      userQ: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(100),
    },
    { history: "replace", shallow: true, throttleMs: 250 },
  );

  const fromIso = urlState.from
    ? new Date(urlState.from + "T00:00:00").toISOString()
    : undefined;
  const toIso = urlState.to
    ? new Date(urlState.to + "T23:59:59").toISOString()
    : undefined;

  const query = useAuditList({
    q: urlState.q || undefined,
    actorUsername: urlState.userQ || undefined,
    entity: urlState.entity.length > 0 ? urlState.entity : undefined,
    action: urlState.action.length > 0 ? urlState.action : undefined,
    from: fromIso,
    to: toIso,
    page: urlState.page,
    pageSize: urlState.pageSize,
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));

  const hasFilter =
    urlState.q !== "" ||
    urlState.userQ !== "" ||
    urlState.from !== "" ||
    urlState.to !== "" ||
    urlState.entity.length > 0 ||
    urlState.action.length > 0;

  const handleReset = () => {
    void setUrlState({
      q: "",
      userQ: "",
      from: "",
      to: "",
      entity: [],
      action: [],
      page: 1,
    });
  };

  const toggleEntity = (code: string) => {
    const next = urlState.entity.includes(code)
      ? urlState.entity.filter((e) => e !== code)
      : [...urlState.entity, code];
    void setUrlState({ entity: next, page: 1 });
  };

  const toggleAction = (code: string) => {
    const next = urlState.action.includes(code)
      ? urlState.action.filter((e) => e !== code)
      : [...urlState.action, code];
    void setUrlState({ action: next, page: 1 });
  };

  // Virtualize khi > 50 rows
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualize = rows.length > 50;
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
    enabled: virtualize,
  });

  const handleExport = () => {
    toast.info("Xuất CSV: sẽ có ở V1.2.");
  };

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-4">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-zinc-500"
      >
        <Link href="/" className="hover:text-zinc-900">
          Tổng quan
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <Link href="/admin" className="hover:text-zinc-900">
          Quản trị
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="text-zinc-900">Nhật ký hệ thống</span>
      </nav>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Nhật ký hệ thống
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {total.toLocaleString("vi-VN")} bản ghi
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Xuất CSV (V1.2)
        </Button>
      </header>

      {/* Filter bar */}
      <section className="rounded-md border border-zinc-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Tìm kiếm
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
              <Input
                value={urlState.q}
                onChange={(e) =>
                  void setUrlState({ q: e.target.value, page: 1 })
                }
                placeholder="Entity / notes…"
                className="h-8 pl-7"
              />
            </div>
          </div>
          <div className="min-w-[150px]">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              User
            </label>
            <Input
              value={urlState.userQ}
              onChange={(e) =>
                void setUrlState({ userQ: e.target.value, page: 1 })
              }
              placeholder="username"
              className="h-8"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Từ ngày
            </label>
            <Input
              type="date"
              value={urlState.from}
              onChange={(e) =>
                void setUrlState({ from: e.target.value, page: 1 })
              }
              className="h-8 w-[140px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Đến ngày
            </label>
            <Input
              type="date"
              value={urlState.to}
              onChange={(e) =>
                void setUrlState({ to: e.target.value, page: 1 })
              }
              className="h-8 w-[140px]"
            />
          </div>
          {hasFilter ? (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Xoá lọc
            </Button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Entity:
          </span>
          {ENTITY_OPTIONS.map((o) => {
            const active = urlState.entity.includes(o.code);
            return (
              <button
                key={o.code}
                type="button"
                onClick={() => toggleEntity(o.code)}
                className={cn(
                  "inline-flex h-6 items-center rounded-sm border px-2 text-[11px] font-medium transition-colors",
                  active
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Action:
          </span>
          {ACTION_OPTIONS.map((o) => {
            const active = urlState.action.includes(o.code);
            return (
              <button
                key={o.code}
                type="button"
                onClick={() => toggleAction(o.code)}
                className={cn(
                  "inline-flex h-6 items-center rounded-sm border px-2 font-mono text-[10px] font-semibold uppercase transition-colors",
                  active
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50",
                )}
              >
                {o.code}
              </button>
            );
          })}
        </div>
      </section>

      {/* Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-zinc-200 bg-white">
        <div
          className={cn(
            "sticky top-0 z-sticky grid h-8 items-center border-b border-zinc-200 bg-zinc-50 px-4 text-xs font-medium uppercase tracking-wide text-zinc-500",
            GRID_COLS,
          )}
        >
          <span>Timestamp</span>
          <span>User</span>
          <span>Action</span>
          <span>Entity</span>
          <span>Entity ID</span>
          <span>Thay đổi</span>
        </div>

        {query.isLoading ? (
          <div className="flex-1 p-6 text-center text-sm text-zinc-500">
            Đang tải…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex-1 p-4">
            <EmptyState
              preset={hasFilter ? "no-filter-match" : "no-data"}
              title={
                hasFilter
                  ? "Không có bản ghi khớp bộ lọc"
                  : "Chưa có hoạt động nào"
              }
              description={
                hasFilter
                  ? "Thử mở rộng khoảng thời gian hoặc xoá bộ lọc."
                  : "Nhật ký sẽ hiển thị khi user thực hiện các thao tác."
              }
              actions={
                hasFilter ? (
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    Xoá bộ lọc
                  </Button>
                ) : null
              }
            />
          </div>
        ) : virtualize ? (
          <div ref={parentRef} className="flex-1 overflow-auto">
            <div
              style={{
                height: `${virt.getTotalSize()}px`,
                position: "relative",
                width: "100%",
              }}
            >
              {virt.getVirtualItems().map((vr) => {
                const row = rows[vr.index];
                if (!row) return null;
                return (
                  <div
                    key={row.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${vr.start}px)`,
                    }}
                  >
                    <AuditRow row={row} gridCols={GRID_COLS} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            {rows.map((row) => (
              <AuditRow key={row.id} row={row} gridCols={GRID_COLS} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      <footer className="flex shrink-0 items-center justify-between text-xs">
        <span className="text-zinc-600">
          Hiển thị{" "}
          <span className="tabular-nums text-zinc-900">
            {rows.length === 0 ? 0 : (urlState.page - 1) * urlState.pageSize + 1}
            –{(urlState.page - 1) * urlState.pageSize + rows.length}
          </span>{" "}
          /{" "}
          <span className="tabular-nums text-zinc-900">
            {total.toLocaleString("vi-VN")}
          </span>
        </span>
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
          <span className="px-2 text-zinc-600 tabular-nums">
            {urlState.page} / {pageCount}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={urlState.page >= pageCount}
            onClick={() =>
              void setUrlState({
                page: Math.min(pageCount, urlState.page + 1),
              })
            }
          >
            ›
          </Button>
        </div>
      </footer>
    </div>
  );
}
