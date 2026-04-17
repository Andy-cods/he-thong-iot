"use client";

import * as React from "react";
import Link from "next/link";
import { FileUp, Plus, Search } from "lucide-react";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  type ItemType,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ItemListTable,
  type ItemRow,
} from "@/components/items/ItemListTable";
import { useItemsList } from "@/hooks/useItems";

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

export default function ItemsPage() {
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState<ItemType | "">("");
  const [isActive, setIsActive] = React.useState<"true" | "false">("true");
  const [page, setPage] = React.useState(1);
  const pageSize = 50;
  const debouncedQ = useDebounced(q, 300);

  const query = useItemsList<ItemRow>({
    q: debouncedQ || undefined,
    type: type ? [type] : undefined,
    isActive: isActive === "true",
    page,
    pageSize,
    sort: "-updatedAt",
  });

  const total = query.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rows = query.data?.data ?? [];

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <h1 className="font-heading text-xl font-semibold text-slate-900">
          Danh mục vật tư
        </h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/items/import">
              <FileUp className="h-4 w-4" aria-hidden />
              Nhập Excel
            </Link>
          </Button>
          <Button asChild>
            <Link href="/items/new">
              <Plus className="h-4 w-4" aria-hidden />
              Tạo mới
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Tìm theo SKU, tên, nhóm…"
            className="pl-7"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={type || "all"}
          onValueChange={(v) => {
            setType(v === "all" ? "" : (v as ItemType));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại</SelectItem>
            {ITEM_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {ITEM_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={isActive}
          onValueChange={(v) => {
            setIsActive(v as "true" | "false");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Đang dùng</SelectItem>
            <SelectItem value="false">Đã xoá</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-slate-500">
          Tổng: <span className="font-semibold text-slate-900">{total}</span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-3">
        <ItemListTable rows={rows} loading={query.isLoading} />
      </div>

      <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2 text-sm">
        <div className="text-slate-600">
          Trang <strong>{page}</strong> / {pageCount}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(1)}
          >
            ‹‹
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            ›
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => setPage(pageCount)}
          >
            ››
          </Button>
        </div>
      </footer>
    </div>
  );
}
