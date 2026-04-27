"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * V3.3 — Material Request creation form.
 *
 * UI đơn giản:
 *   - Search item (qua /api/items?q=)
 *   - Add line (item + qty)
 *   - Notes
 *   - Submit POST /api/material-requests
 */

interface ItemSearch {
  id: string;
  sku: string;
  name: string;
  uom?: string;
}

interface RequestLine {
  itemId: string;
  sku: string;
  itemName: string;
  uom?: string;
  qty: string;
  notes: string;
}

export default function NewMaterialRequestPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [lines, setLines] = React.useState<RequestLine[]>([]);
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const itemsQuery = useQuery({
    queryKey: ["items-search", debouncedQ],
    queryFn: async () => {
      const url = `/api/items?q=${encodeURIComponent(debouncedQ)}&pageSize=15`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json() as Promise<{ data: ItemSearch[] }>;
    },
    enabled: debouncedQ.length >= 1,
    staleTime: 30_000,
  });

  const items = itemsQuery.data?.data ?? [];

  const submit = useMutation({
    mutationFn: async () => {
      const payload = {
        notes: notes.trim() || null,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          requestedQty: Number(l.qty),
          notes: l.notes.trim() || null,
        })),
      };
      const res = await fetch("/api/material-requests", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? "Tạo thất bại");
      return body.data;
    },
    onSuccess: (data) => {
      toast.success(`Đã tạo yêu cầu ${data.requestNo}`);
      router.push(`/material-requests/${data.id}`);
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Không tạo được yêu cầu");
    },
  });

  const addLine = (it: ItemSearch) => {
    if (lines.find((l) => l.itemId === it.id)) {
      toast.info("Linh kiện này đã có trong danh sách");
      return;
    }
    setLines((prev) => [
      ...prev,
      { itemId: it.id, sku: it.sku, itemName: it.name, uom: it.uom, qty: "1", notes: "" },
    ]);
    setSearch("");
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, patch: Partial<RequestLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const isValid =
    lines.length > 0 &&
    lines.every((l) => Number(l.qty) > 0);

  return (
    <div className="flex h-full flex-col bg-zinc-50/30">
      <header className="border-b border-zinc-200 bg-white px-6 py-5">
        <Link
          href="/material-requests"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-indigo-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Về danh sách yêu cầu
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-900">
          <FileText className="h-6 w-6 text-indigo-600" aria-hidden />
          Tạo yêu cầu vật tư mới
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Chọn linh kiện cần lấy từ kho, nhập số lượng. Thông báo sẽ tự động gửi cho Bộ phận Kho.
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {/* Search + add */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Thêm linh kiện</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Tìm theo mã (SKU) hoặc tên linh kiện. Bấm vào kết quả để thêm.
            </p>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm linh kiện..."
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            {debouncedQ && (
              <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50/40">
                {itemsQuery.isLoading ? (
                  <p className="px-4 py-6 text-center text-sm text-zinc-500">Đang tìm…</p>
                ) : items.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-zinc-500">Không tìm thấy linh kiện.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100">
                    {items.map((it) => (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => addLine(it)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white"
                        >
                          <span className="font-mono text-sm font-semibold text-indigo-600">{it.sku}</span>
                          <span className="text-sm text-zinc-700 flex-1 truncate">{it.name}</span>
                          {it.uom && <span className="text-xs text-zinc-400">{it.uom}</span>}
                          <Plus className="h-4 w-4 text-zinc-400" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* Lines */}
          <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/60 px-5 py-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Danh sách yêu cầu ({lines.length} dòng)
              </h2>
            </div>
            {lines.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-zinc-500">
                Chưa có dòng nào. Tìm và thêm linh kiện ở trên.
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 w-16">#</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Linh kiện</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 w-32">SL yêu cầu</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Ghi chú</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.itemId} className="border-b border-zinc-50">
                      <td className="px-5 py-3 text-sm text-zinc-500">{i + 1}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col">
                          <span className="font-mono text-sm font-semibold text-indigo-600">{l.sku}</span>
                          <span className="text-xs text-zinc-600 truncate max-w-xs">{l.itemName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            value={l.qty}
                            onChange={(e) => updateLine(i, { qty: e.target.value })}
                            className="h-9 w-24 rounded-md border border-zinc-200 bg-white px-2.5 text-right font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          {l.uom && <span className="text-xs text-zinc-500">{l.uom}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <input
                          type="text"
                          value={l.notes}
                          onChange={(e) => updateLine(i, { notes: e.target.value })}
                          placeholder="Tuỳ chọn..."
                          className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600"
                          title="Xoá dòng"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Notes + submit */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <label className="block">
              <span className="text-sm font-semibold text-zinc-900">Ghi chú</span>
              <span className="ml-2 text-xs text-zinc-500">(mục đích sử dụng / vị trí cần)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="VD: Cho line lắp ráp số 2, cần gấp trước 10h..."
                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
              />
            </label>
          </section>

          <div className="flex items-center justify-end gap-3">
            <Button asChild variant="ghost">
              <Link href="/material-requests">Huỷ</Link>
            </Button>
            <Button
              type="button"
              onClick={() => submit.mutate()}
              disabled={!isValid || submit.isPending}
              className={cn(!isValid && "opacity-50 cursor-not-allowed")}
            >
              {submit.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FileText className="h-4 w-4" aria-hidden />
              )}
              Tạo yêu cầu
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
