"use client";

import * as React from "react";
import Link from "next/link";
import { GitBranch, Plus } from "lucide-react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useEcoList,
  STATUS_LABEL,
  STATUS_VARIANTS,
  type EcoStatus,
} from "@/hooks/useEco";

export default function EcoListPage() {
  const [urlState, setUrlState] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      status: parseAsString.withDefault("all"),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
    },
    { history: "replace", shallow: true, throttleMs: 250 },
  );

  const [searchInput, setSearchInput] = React.useState(urlState.q);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== urlState.q) {
        void setUrlState({ q: searchInput, page: 1 });
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const filter = React.useMemo(() => {
    const f: {
      q?: string;
      status?: EcoStatus[];
      page?: number;
      pageSize?: number;
    } = {
      q: urlState.q || undefined,
      page: urlState.page,
      pageSize: urlState.pageSize,
    };
    if (urlState.status !== "all") {
      f.status = [urlState.status as EcoStatus];
    }
    return f;
  }, [urlState]);

  const query = useEcoList(filter);
  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            <GitBranch
              className="mr-1 inline-block h-5 w-5 text-zinc-500"
              aria-hidden="true"
            />{" "}
            Engineering Change Orders
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            ECO · {total.toLocaleString("vi-VN")} bản ghi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/eco/new">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Tạo ECO
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
        <Input
          placeholder="Tìm mã ECO hoặc tiêu đề…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="h-8 max-w-xs"
        />
        <Select
          value={urlState.status}
          onValueChange={(v) => void setUrlState({ status: v, page: 1 })}
        >
          <SelectTrigger className="h-8 w-48">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {(Object.keys(STATUS_LABEL) as EcoStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {query.isLoading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            preset="no-filter-match"
            title="Chưa có ECO nào"
            description="Tạo ECO để đổi BOM template hiện có mà không phá revision đã release."
            actions={
              <Button asChild size="sm">
                <Link href="/eco/new">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Tạo ECO
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">Mã ECO</th>
                  <th className="px-3 py-2 text-left">Tiêu đề</th>
                  <th className="px-3 py-2 text-left">Template</th>
                  <th className="px-3 py-2 text-left">Trạng thái</th>
                  <th className="px-3 py-2 text-right">Orders affected</th>
                  <th className="px-3 py-2 text-left">Tạo lúc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer hover:bg-zinc-50"
                    onClick={() => {
                      window.location.href = `/eco/${r.code}`;
                    }}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/eco/${r.code}`}
                        className="font-mono text-xs font-semibold text-indigo-700 hover:underline"
                      >
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-zinc-800">{r.title}</td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-600">
                      {r.templateCode ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANTS[r.status]}>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.affectedOrdersCount}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {new Date(r.createdAt).toLocaleString("vi-VN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <footer className="flex h-9 items-center justify-between border-t border-zinc-200 bg-white px-4 text-xs">
        <div className="text-zinc-600">
          Trang{" "}
          <span className="tabular-nums">
            {urlState.page}/{pageCount}
          </span>{" "}
          · {total.toLocaleString("vi-VN")} ECO
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
