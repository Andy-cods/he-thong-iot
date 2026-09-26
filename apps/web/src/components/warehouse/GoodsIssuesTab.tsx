"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileOutput,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * V4.1 Đợt 1b (Q3) — Tab Kho › "Phiếu xuất kho".
 *
 * Mọi đường xuất (giao phiếu yêu cầu vật tư, xuất nhanh, duyệt yêu cầu xuất
 * kho ISR) đều sinh 1 phiếu PX-YYMM-NNNN → đây là sổ xuất kho duy nhất.
 * Phân trang ở server; lọc nguồn + khoảng ngày xuất + tìm số PX/tham chiếu.
 * `?id=<uuid>` (link từ chi tiết phiếu yêu cầu) → mở sẵn phiếu đó ở đầu trang
 * + tô sáng nếu nằm trong trang hiện tại.
 */

type SourceType = "MATERIAL_REQUEST" | "QUICK_ISSUE" | "ISSUE_REQUEST";

const SOURCE_LABEL: Record<SourceType, string> = {
  MATERIAL_REQUEST: "Phiếu yêu cầu vật tư",
  QUICK_ISSUE: "Xuất nhanh",
  ISSUE_REQUEST: "Yêu cầu xuất kho",
};

const SOURCE_BADGE: Record<SourceType, string> = {
  MATERIAL_REQUEST: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  QUICK_ISSUE: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  ISSUE_REQUEST: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
};

const REASON_LABEL: Record<string, string> = {
  production: "Sản xuất",
  sales: "Bán hàng",
  manual: "Thủ công",
  loss: "Hao hụt",
  return: "Trả NCC",
  other: "Khác",
};

interface GoodsIssueRow {
  id: string;
  issueNo: string;
  sourceType: SourceType;
  reason: string;
  reference: string | null;
  notes: string | null;
  totalQty: string;
  issuedAt: string;
  issuedByName: string | null;
  materialRequestId: string | null;
  materialRequestNo: string | null;
  issueRequestNo: string | null;
  woId: string | null;
  woNo: string | null;
  lineCount?: number;
}

interface GoodsIssueDetail extends GoodsIssueRow {
  lines: Array<{
    id: string;
    lineNo: number;
    sku: string | null;
    itemName: string | null;
    uom: string | null;
    lotCode: string | null;
    binCode: string | null;
    qty: string;
  }>;
}

interface ListResp {
  data: GoodsIssueRow[];
  meta: { page: number; pageSize: number; total: number };
}

const PAGE_SIZE = 30;

function fmtDateTime(at: string): string {
  return new Date(at).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtQty(v: string | number): string {
  return Number(v).toLocaleString("vi-VN");
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (body as { error?: { message?: string } })?.error?.message ??
        `Lỗi tải dữ liệu (HTTP ${res.status})`,
    );
  }
  return body as T;
}

export function GoodsIssuesTab() {
  const focusId = useSearchParams()?.get("id") ?? null;
  const [source, setSource] = React.useState<"" | SourceType>("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [showFocus, setShowFocus] = React.useState(true);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Đổi bộ lọc → về trang 1.
  React.useEffect(() => {
    setPage(1);
  }, [source, from, to, debouncedQ]);

  const list = useQuery<ListResp>({
    queryKey: ["goods-issues", "list", source, from, to, debouncedQ, page],
    queryFn: () => {
      const p = new URLSearchParams();
      if (source) p.set("sourceType", source);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (debouncedQ) p.set("q", debouncedQ);
      p.set("page", String(page));
      p.set("pageSize", String(PAGE_SIZE));
      return fetchJson<ListResp>(`/api/goods-issues?${p}`);
    },
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  const focus = useQuery<{ data: GoodsIssueDetail }>({
    queryKey: ["goods-issues", "detail", focusId],
    queryFn: () => fetchJson(`/api/goods-issues/${focusId}`),
    enabled: !!focusId && /^[0-9a-f-]{36}$/i.test(focusId),
    staleTime: 30_000,
  });

  React.useEffect(() => {
    if (!focusId || !list.data) return;
    document
      .getElementById(`goods-issue-${focusId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, list.data]);

  const rows = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilter = !!source || !!from || !!to || !!debouncedQ;

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50/30 p-4 dark:bg-zinc-950/30 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
            <FileOutput className="h-4 w-4" /> Phiếu xuất kho
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Sổ xuất kho duy nhất — giao phiếu yêu cầu vật tư, xuất nhanh, duyệt yêu cầu xuất kho.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Làm mới
        </Button>
      </div>

      {/* Phiếu được mở từ link (?id=) */}
      {focusId && showFocus ? (
        <div className="mb-4 rounded-xl border border-indigo-200 bg-white p-4 shadow-sm dark:border-indigo-900 dark:bg-zinc-900">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Phiếu đang xem
            </p>
            <button
              type="button"
              onClick={() => setShowFocus(false)}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Đóng"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {focus.isLoading ? (
            <p className="inline-flex items-center gap-1 text-xs text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Đang tải…
            </p>
          ) : focus.isError || !focus.data ? (
            <p className="text-xs text-red-600 dark:text-red-400">
              {(focus.error as Error)?.message ?? "Không tìm thấy phiếu xuất."}
            </p>
          ) : (
            <GoodsIssueDetailView gi={focus.data.data} />
          )}
        </div>
      ) : null}

      {/* Bộ lọc */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as "" | SourceType)}
          aria-label="Nguồn phiếu xuất"
          className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <option value="">Mọi nguồn</option>
          {(Object.keys(SOURCE_LABEL) as SourceType[]).map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Số PX / tham chiếu…"
            className="h-8 w-48 rounded-lg border border-zinc-200 bg-white pl-8 pr-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          Từ
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          Đến
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        {hasFilter ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSource("");
              setFrom("");
              setTo("");
              setQ("");
            }}
          >
            Xoá lọc
          </Button>
        ) : null}
      </div>

      {list.isLoading && rows.length === 0 ? (
        <p className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          <Loader2 className="h-3 w-3 animate-spin" /> Đang tải…
        </p>
      ) : list.isError && rows.length === 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-800 dark:bg-red-950/40">
          <AlertCircle className="mx-auto h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />
          <p className="mt-1 text-sm font-medium text-red-700 dark:text-red-400">
            {(list.error as Error)?.message ?? "Không tải được phiếu xuất kho."}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void list.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {hasFilter ? "Không có phiếu xuất khớp bộ lọc." : "Chưa có phiếu xuất kho nào."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2">Số phiếu</th>
                <th className="px-3 py-2">Ngày xuất</th>
                <th className="px-3 py-2">Nguồn</th>
                <th className="px-3 py-2">Chứng từ gốc</th>
                <th className="px-3 py-2">Người xuất</th>
                <th className="px-3 py-2 text-right">Số dòng</th>
                <th className="px-3 py-2 text-right">Tổng SL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <GoodsIssueRowView
                  key={r.id}
                  row={r}
                  highlighted={r.id === focusId}
                  expanded={expanded === r.id}
                  onToggle={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="mt-3 flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
          <span className="tabular-nums">
            {total.toLocaleString("vi-VN")} phiếu · Trang {page} / {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1 || list.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= pageCount || list.isFetching}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              ›
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SourceRef({ row }: { row: GoodsIssueRow }) {
  if (row.sourceType === "MATERIAL_REQUEST" && row.materialRequestId) {
    return (
      <Link
        href={`/material-requests/${row.materialRequestId}`}
        className="font-mono text-indigo-600 hover:underline dark:text-indigo-400"
      >
        {row.materialRequestNo ?? "Phiếu yêu cầu"}
      </Link>
    );
  }
  if (row.sourceType === "ISSUE_REQUEST") {
    return <span className="font-mono">{row.issueRequestNo ?? "—"}</span>;
  }
  return <span>{row.reference ?? "—"}</span>;
}

function GoodsIssueRowView({
  row,
  highlighted,
  expanded,
  onToggle,
}: {
  row: GoodsIssueRow;
  highlighted: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const detail = useQuery<{ data: GoodsIssueDetail }>({
    queryKey: ["goods-issues", "detail", row.id],
    queryFn: () => fetchJson(`/api/goods-issues/${row.id}`),
    enabled: expanded,
    staleTime: 60_000,
  });

  return (
    <>
      <tr
        id={`goods-issue-${row.id}`}
        className={cn(
          "cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60",
          highlighted && "bg-indigo-50/70 ring-1 ring-inset ring-indigo-300 dark:bg-indigo-950/30 dark:ring-indigo-700",
        )}
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-zinc-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className="px-3 py-2 font-mono font-semibold text-zinc-900 dark:text-zinc-50">{row.issueNo}</td>
        <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">{fmtDateTime(row.issuedAt)}</td>
        <td className="px-3 py-2">
          <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", SOURCE_BADGE[row.sourceType])}>
            {SOURCE_LABEL[row.sourceType] ?? row.sourceType}
          </span>
          {row.reason !== "production" ? (
            <span className="ml-1 text-xs text-zinc-500">· {REASON_LABEL[row.reason] ?? row.reason}</span>
          ) : null}
        </td>
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <SourceRef row={row} />
          {row.woNo ? (
            <span className="ml-1 text-xs text-zinc-500">· {row.woNo}</span>
          ) : null}
        </td>
        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{row.issuedByName ?? "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{row.lineCount ?? "—"}</td>
        <td className="px-3 py-2 text-right font-mono font-semibold">{fmtQty(row.totalQty)}</td>
      </tr>
      {expanded ? (
        <tr className="border-b border-zinc-100 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-800/30">
          <td />
          <td colSpan={7} className="px-3 py-3">
            {detail.isLoading ? (
              <p className="inline-flex items-center gap-1 text-xs text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Đang tải dòng…
              </p>
            ) : detail.isError || !detail.data ? (
              <p className="text-xs text-red-600 dark:text-red-400">
                {(detail.error as Error)?.message ?? "Không tải được dòng phiếu."}
              </p>
            ) : (
              <GoodsIssueLines lines={detail.data.data.lines} notes={row.notes} />
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function GoodsIssueDetailView({ gi }: { gi: GoodsIssueDetail }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-mono font-bold text-zinc-900 dark:text-zinc-50">{gi.issueNo}</span>
        <span className="text-zinc-500">{fmtDateTime(gi.issuedAt)}</span>
        <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", SOURCE_BADGE[gi.sourceType])}>
          {SOURCE_LABEL[gi.sourceType] ?? gi.sourceType}
        </span>
        <SourceRef row={gi} />
        <span className="text-zinc-500">{gi.issuedByName ?? ""}</span>
        <span className="ml-auto font-mono font-semibold">{fmtQty(gi.totalQty)}</span>
      </div>
      <div className="mt-2">
        <GoodsIssueLines lines={gi.lines} notes={gi.notes} />
      </div>
    </div>
  );
}

function GoodsIssueLines({
  lines,
  notes,
}: {
  lines: GoodsIssueDetail["lines"];
  notes: string | null;
}) {
  return (
    <div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-zinc-500 dark:text-zinc-400">
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Mã</th>
            <th className="py-1 pr-2">Tên</th>
            <th className="py-1 pr-2">Lô</th>
            <th className="py-1 pr-2">Vị trí</th>
            <th className="py-1 text-right">SL</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="py-1 pr-2 text-zinc-400">{l.lineNo}</td>
              <td className="py-1 pr-2 font-mono font-semibold text-indigo-600 dark:text-indigo-400">{l.sku ?? "—"}</td>
              <td className="max-w-[220px] truncate py-1 pr-2 text-zinc-700 dark:text-zinc-300">{l.itemName ?? "—"}</td>
              <td className="py-1 pr-2 font-mono">{l.lotCode ?? "—"}</td>
              <td className="py-1 pr-2 font-mono">{l.binCode ?? "—"}</td>
              <td className="py-1 text-right font-mono">
                {fmtQty(l.qty)}
                {l.uom ? <span className="ml-1 text-zinc-400">{l.uom}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {notes ? <p className="mt-1 text-xs italic text-zinc-500">{notes}</p> : null}
    </div>
  );
}
