"use client";

import * as React from "react";
import { Loader2, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * V3.7 — Pick FIFO tool.
 *
 * Workflow:
 *   1. Tìm SKU (autocomplete) hoặc nhập trực tiếp ID
 *   2. Nhập qty cần lấy
 *   3. Bấm "Gợi ý FIFO" → POST /api/warehouse/fifo-pick
 *   4. Xem danh sách picks: bin → lot → qty → ngày nhập + ngày HSD
 *   5. (V1) Chỉ hiển thị plan; thực sự xuất kho qua /receiving hoặc /inventory/issue.
 */

interface ItemSearchResult {
  id: string;
  sku: string;
  name: string;
  uom: string;
  totalQty: number;
}

interface PickPlan {
  picks: Array<{
    lotSerialId: string;
    lotCode: string | null;
    binId: string;
    binFullCode: string;
    qty: number;
    receivedAt: string;
    expDate: string | null;
  }>;
  covered: number;
  shortage: number;
}

export function PickingTab() {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState<ItemSearchResult[]>([]);
  const [selected, setSelected] = React.useState<ItemSearchResult | null>(null);
  const [qty, setQty] = React.useState("");
  const [picking, setPicking] = React.useState(false);
  const [plan, setPlan] = React.useState<PickPlan | null>(null);

  // Debounced search
  React.useEffect(() => {
    const t = searchTerm.trim();
    if (t.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/items?q=${encodeURIComponent(t)}&pageSize=10`,
        );
        const json = (await res.json()) as {
          data: Array<{
            id: string;
            sku: string;
            name: string;
            uom: string;
            inventorySummary?: { totalQty: number };
          }>;
        };
        if (!cancelled) {
          const list = (json.data ?? []).map((x) => ({
            id: x.id,
            sku: x.sku,
            name: x.name,
            uom: x.uom,
            totalQty: x.inventorySummary?.totalQty ?? 0,
          }));
          setResults(list);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const handleSuggest = async () => {
    if (!selected) {
      toast.error("Chọn 1 SKU trước.");
      return;
    }
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Số lượng phải > 0.");
      return;
    }
    setPicking(true);
    setPlan(null);
    try {
      const res = await fetch("/api/warehouse/fifo-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: selected.id, qty: q }),
      });
      const json = (await res.json()) as { data?: PickPlan; error?: { message?: string } };
      if (!res.ok || !json.data) {
        toast.error(json.error?.message ?? "Lỗi gợi ý FIFO");
        return;
      }
      setPlan(json.data);
      if (json.data.shortage > 0) {
        toast.warning(
          `Thiếu ${json.data.shortage.toLocaleString("vi-VN")} ${selected.uom}.`,
        );
      } else {
        toast.success("Đã có plan FIFO đầy đủ.");
      }
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Pick FIFO — Đề xuất xuất kho theo lô cũ nhất
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          Chọn vật tư + số lượng cần. Hệ thống đề xuất danh sách bin/lô theo
          nguyên tắc FIFO (lô nhập trước xuất trước).
        </p>
      </header>

      {/* Step 1: Search SKU */}
      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <label className="text-sm font-medium text-zinc-700">
          1. Chọn vật tư
        </label>
        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm SKU hoặc tên vật tư (tối thiểu 2 ký tự)…"
            className="pl-9"
          />
        </div>

        {searching && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Đang tìm…
          </p>
        )}

        {results.length > 0 && (
          <ul className="mt-2 max-h-64 overflow-auto rounded-md border border-zinc-200 divide-y divide-zinc-100 text-sm">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(r);
                    setSearchTerm("");
                    setResults([]);
                    setPlan(null);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <code className="font-mono text-xs font-semibold text-zinc-900">
                      {r.sku}
                    </code>
                    <p className="truncate text-xs text-zinc-600">{r.name}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded px-2 py-0.5 text-xs font-medium tabular-nums",
                      r.totalQty > 0
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-zinc-100 text-zinc-500",
                    )}
                  >
                    {r.totalQty.toLocaleString("vi-VN")} {r.uom}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <div className="mt-3 flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2">
            <div>
              <span className="font-mono text-xs font-semibold text-indigo-900">
                {selected.sku}
              </span>
              <span className="ml-2 text-xs text-indigo-700">
                {selected.name}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded bg-white px-2 py-0.5 font-medium tabular-nums text-zinc-700">
                Tồn: {selected.totalQty.toLocaleString("vi-VN")} {selected.uom}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setPlan(null);
                  setQty("");
                }}
                className="text-zinc-500 hover:text-zinc-900"
              >
                Đổi
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Step 2: Qty + Suggest */}
      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <label className="text-sm font-medium text-zinc-700">
          2. Số lượng cần
        </label>
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="number"
            min={0}
            step={0.0001}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            disabled={!selected}
            className="w-32 text-right tabular-nums"
          />
          {selected && (
            <span className="text-xs text-zinc-500">{selected.uom}</span>
          )}
          <Button
            onClick={handleSuggest}
            disabled={!selected || !qty || picking}
            className="ml-auto"
          >
            {picking ? "Đang tính…" : "Gợi ý FIFO"}
          </Button>
        </div>
      </section>

      {/* Step 3: Plan */}
      {plan && (
        <section className="rounded-md border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <h3 className="text-sm font-medium text-zinc-900">
              3. Plan FIFO ({plan.picks.length} dòng)
            </h3>
            {plan.shortage > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                Thiếu {plan.shortage.toLocaleString("vi-VN")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                Đủ {plan.covered.toLocaleString("vi-VN")}
              </span>
            )}
          </div>

          {plan.picks.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">
              Không có lot nào AVAILABLE cho SKU này.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Bin</th>
                  <th className="px-3 py-2 text-left">Lô</th>
                  <th className="px-3 py-2 text-right">Lấy</th>
                  <th className="px-3 py-2 text-left">Ngày nhập</th>
                  <th className="px-3 py-2 text-left">HSD</th>
                </tr>
              </thead>
              <tbody>
                {plan.picks.map((p, idx) => (
                  <tr
                    key={`${p.lotSerialId}-${p.binId}`}
                    className="border-t border-zinc-100"
                  >
                    <td className="px-3 py-2 text-xs tabular-nums text-zinc-500">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs font-medium text-blue-700">
                        {p.binFullCode}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-700">
                      {p.lotCode ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-medium tabular-nums text-zinc-900">
                      {p.qty.toLocaleString("vi-VN")}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {p.receivedAt
                        ? new Date(p.receivedAt).toLocaleDateString("vi-VN")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {p.expDate
                        ? new Date(p.expDate).toLocaleDateString("vi-VN")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
