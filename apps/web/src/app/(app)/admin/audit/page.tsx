"use client";

import * as React from "react";
import { Download, Search, X } from "lucide-react";
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
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { useAuditList } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_OBJECT_TYPES,
  auditObjectLabel,
} from "@/lib/audit-scope";

const GRID_COLS =
  "grid-cols-[120px,100px,70px,minmax(0,1fr)] md:grid-cols-[170px,130px,80px,140px,90px,minmax(0,1fr)]";

export default function AdminAuditPage() {
  const [urlState, setUrlState] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      from: parseAsString.withDefault(""),
      to: parseAsString.withDefault(""),
      entity: parseAsArrayOf(parseAsString).withDefault([]),
      action: parseAsArrayOf(parseAsString).withDefault([]),
      // V4.1 AD-10 — lọc theo 1 chứng từ (nút "Mở audit" ở trang PO…).
      objectId: parseAsString.withDefault(""),
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
    objectId: urlState.objectId || undefined,
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
    urlState.action.length > 0 ||
    urlState.objectId !== "";

  const handleReset = () => {
    void setUrlState({
      q: "",
      userQ: "",
      from: "",
      to: "",
      entity: [],
      action: [],
      objectId: "",
      page: 1,
    });
  };

  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualize = rows.length > 50;
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
    enabled: virtualize,
  });

  const [exporting, setExporting] = React.useState(false);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    const p = new URLSearchParams();
    if (urlState.q) p.set("q", urlState.q);
    if (urlState.userQ) p.set("actorUsername", urlState.userQ);
    if (fromIso) p.set("from", fromIso);
    if (toIso) p.set("to", toIso);
    for (const e of urlState.entity) p.append("entity", e);
    for (const a of urlState.action) p.append("action", a);
    if (urlState.objectId) p.set("objectId", urlState.objectId);
    try {
      const res = await fetch(`/api/admin/audit/export?${p.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        toast.error(`Xuất Excel thất bại (HTTP ${res.status})`);
        return;
      }
      const truncated = res.headers.get("X-Export-Truncated");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (truncated) {
        toast.warning(
          `Kết quả quá lớn, đã cắt còn ${truncated} dòng. Thu hẹp bộ lọc để xuất đủ.`,
        );
      } else {
        toast.success("Đã xuất Excel audit log.");
      }
    } catch (err) {
      toast.error(
        `Lỗi xuất Excel: ${err instanceof Error ? err.message : "unknown"}`,
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminPageShell
      breadcrumb={[
        { label: "Trang chủ", href: "/" },
        { label: "Quản trị", href: "/admin" },
        { label: "Audit log" },
      ]}
      title="Nhật ký hệ thống"
      description={
        <>
          Theo dõi toàn bộ thao tác ghi (CREATE / UPDATE / DELETE) và sự kiện
          phiên đăng nhập.{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {total.toLocaleString("vi-VN")} bản ghi
          </span>
          .
        </>
      }
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {exporting ? "Đang xuất…" : "Xuất Excel"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Filter bar */}
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <FilterLabel>Tìm kiếm</FilterLabel>
              <div className="relative mt-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
                  aria-hidden="true"
                />
                <Input
                  value={urlState.q}
                  onChange={(e) =>
                    void setUrlState({ q: e.target.value, page: 1 })
                  }
                  placeholder="Entity / notes…"
                  className="h-9 pl-8"
                />
              </div>
            </div>
            <div className="min-w-[150px]">
              <FilterLabel>Username</FilterLabel>
              <Input
                value={urlState.userQ}
                onChange={(e) =>
                  void setUrlState({ userQ: e.target.value, page: 1 })
                }
                placeholder="username"
                className="mt-1 h-9"
              />
            </div>
            <div>
              <FilterLabel>Từ ngày</FilterLabel>
              <Input
                type="date"
                value={urlState.from}
                onChange={(e) =>
                  void setUrlState({ from: e.target.value, page: 1 })
                }
                className="mt-1 h-9 w-[150px]"
              />
            </div>
            <div>
              <FilterLabel>Đến ngày</FilterLabel>
              <Input
                type="date"
                value={urlState.to}
                onChange={(e) =>
                  void setUrlState({ to: e.target.value, page: 1 })
                }
                className="mt-1 h-9 w-[150px]"
              />
            </div>
            {hasFilter ? (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Xoá lọc
              </Button>
            ) : null}
          </div>

          {/* V4.1 AD-10 — bộ lọc đủ mọi loại đối tượng + hành động (trước chỉ 6 loại). */}
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[220px]">
              <FilterLabel>Loại đối tượng</FilterLabel>
              <select
                value={urlState.entity[0] ?? ""}
                onChange={(e) =>
                  void setUrlState({
                    entity: e.target.value ? [e.target.value] : [],
                    page: 1,
                  })
                }
                className="mt-1 h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                aria-label="Lọc theo loại đối tượng"
              >
                <option value="">Tất cả</option>
                {AUDIT_OBJECT_TYPES.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
                {urlState.entity[0] &&
                !AUDIT_OBJECT_TYPES.some((o) => o.code === urlState.entity[0]) ? (
                  <option value={urlState.entity[0]}>{urlState.entity[0]}</option>
                ) : null}
              </select>
            </div>
            <div className="min-w-[180px]">
              <FilterLabel>Hành động</FilterLabel>
              <select
                value={urlState.action[0] ?? ""}
                onChange={(e) =>
                  void setUrlState({
                    action: e.target.value ? [e.target.value] : [],
                    page: 1,
                  })
                }
                className="mt-1 h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                aria-label="Lọc theo hành động"
              >
                <option value="">Tất cả</option>
                {AUDIT_ACTION_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label} ({o.code})
                  </option>
                ))}
              </select>
            </div>
            {urlState.objectId ? (
              <div className="flex h-9 items-center gap-2 rounded-md bg-indigo-50 px-3 text-xs text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                Chỉ 1 chứng từ
                {urlState.entity[0] ? ` (${auditObjectLabel(urlState.entity[0])})` : ""}
                <button
                  type="button"
                  aria-label="Bỏ lọc chứng từ"
                  onClick={() => void setUrlState({ objectId: "", page: 1 })}
                  className="rounded p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        </section>

        {/* Table */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div
            className={cn(
              "sticky top-0 z-sticky grid h-9 items-center border-b border-zinc-200 bg-zinc-50/70 px-4 text-[11px] font-semibold uppercase tracking-normal text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400",
              GRID_COLS,
            )}
          >
            <span>Thời điểm</span>
            <span>User</span>
            <span>Action</span>
            <span>Entity</span>
            <span className="hidden md:block">Entity ID</span>
            <span className="hidden md:block">Thay đổi</span>
          </div>

          {query.isLoading ? (
            <div className="flex-1 p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Đang tải…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex-1 p-6">
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
            <div ref={parentRef} className="max-h-[60vh] flex-1 overflow-auto">
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
            <div className="max-h-[60vh] flex-1 overflow-auto">
              {rows.map((row) => (
                <AuditRow key={row.id} row={row} gridCols={GRID_COLS} />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        <footer className="flex shrink-0 items-center justify-between text-xs">
          <span className="text-zinc-600 dark:text-zinc-400">
            Hiển thị{" "}
            <span className="tabular-nums text-zinc-900 dark:text-zinc-50">
              {rows.length === 0
                ? 0
                : (urlState.page - 1) * urlState.pageSize + 1}
              –{(urlState.page - 1) * urlState.pageSize + rows.length}
            </span>{" "}
            /{" "}
            <span className="tabular-nums text-zinc-900 dark:text-zinc-50">
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
            <span className="px-2 text-zinc-600 tabular-nums dark:text-zinc-400">
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
    </AdminPageShell>
  );
}

function FilterLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-[11px] font-semibold uppercase tracking-normal text-zinc-500 dark:text-zinc-400",
        className,
      )}
    >
      {children}
    </span>
  );
}
