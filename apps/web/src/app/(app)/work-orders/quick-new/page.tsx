"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Factory,
  FileSignature,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * V3.7.10 — `/work-orders/quick-new` Tạo WO nhanh.
 *
 * Tạo WO bypass snapshot system + tự động sinh warehouse_issue_request PENDING.
 *
 * Form:
 *   1. Sản phẩm: search SKU + plannedQty + priority + dates + notes
 *   2. Vật tư cần (>=1 dòng): SKU + qty
 *   3. Submit → tạo WO + ISR-... → chuyển hướng /operations
 */

export const dynamic = "force-dynamic";

interface ItemRef {
  id: string;
  sku: string;
  name: string;
  uom: string;
  totalQty: number;
}

interface MaterialLine {
  rowId: string;
  item: ItemRef | null;
  qty: string;
}

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const PRIORITIES = [
  { value: "LOW", label: "Thấp" },
  { value: "NORMAL", label: "Bình thường" },
  { value: "HIGH", label: "Cao" },
  { value: "URGENT", label: "Khẩn" },
] as const;

export default function QuickNewWorkOrderPage() {
  const router = useRouter();
  const [product, setProduct] = React.useState<ItemRef | null>(null);
  const [plannedQty, setPlannedQty] = React.useState("");
  const [priority, setPriority] = React.useState<
    (typeof PRIORITIES)[number]["value"]
  >("NORMAL");
  const [plannedStart, setPlannedStart] = React.useState("");
  const [plannedEnd, setPlannedEnd] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [materials, setMaterials] = React.useState<MaterialLine[]>([
    { rowId: uuid(), item: null, qty: "" },
  ]);
  const [submitting, setSubmitting] = React.useState(false);

  const totalLines = materials.filter((m) => m.item).length;

  const addLine = () => {
    setMaterials((prev) => [...prev, { rowId: uuid(), item: null, qty: "" }]);
  };
  const removeLine = (rowId: string) => {
    setMaterials((prev) => prev.filter((m) => m.rowId !== rowId));
  };
  const updateLine = (rowId: string, patch: Partial<MaterialLine>) => {
    setMaterials((prev) =>
      prev.map((m) => (m.rowId === rowId ? { ...m, ...patch } : m)),
    );
  };

  const handleSubmit = async () => {
    if (!product) {
      toast.error("Chọn sản phẩm trước.");
      return;
    }
    const pq = Number(plannedQty);
    if (!Number.isFinite(pq) || pq <= 0) {
      toast.error("Số lượng kế hoạch phải > 0.");
      return;
    }
    const valid = materials.filter(
      (m) => m.item && Number(m.qty) > 0,
    );
    if (valid.length === 0) {
      toast.error("Cần ít nhất 1 vật tư.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/work-orders/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productItemId: product.id,
          plannedQty: pq,
          priority,
          plannedStart: plannedStart || null,
          plannedEnd: plannedEnd || null,
          notes: notes.trim() || null,
          materials: valid.map((m) => ({
            itemId: m.item!.id,
            qty: Number(m.qty),
          })),
        }),
      });
      const json = (await res.json()) as {
        data?: {
          woId: string;
          woNo: string;
          requestNo: string;
          totalShortage: number;
        };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        toast.error(json.error?.message ?? "Lỗi tạo WO");
        return;
      }
      const shortage = json.data.totalShortage;
      toast.success(
        `Đã tạo ${json.data.woNo} → yêu cầu xuất ${json.data.requestNo} (chờ Kho duyệt).${
          shortage > 0 ? ` ⚠ Thiếu ${shortage}` : ""
        }`,
      );
      router.push("/operations?tab=wo");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50/30">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 hover:underline">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <Link
            href="/operations"
            className="hover:text-zinc-900 hover:underline"
          >
            Vận hành
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="font-medium text-zinc-900">Tạo lệnh sản xuất</span>
        </nav>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
            <Factory className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">
              Tạo lệnh sản xuất nhanh
            </h1>
            <p className="text-xs text-zinc-500">
              Tạo WO + tự động sinh yêu cầu xuất kho cho Kho duyệt.
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {/* Sản phẩm */}
          <section className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">
              1. Sản phẩm cần sản xuất
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_140px_140px]">
              <ItemPicker
                label="SKU thành phẩm"
                value={product}
                onChange={setProduct}
                disabled={submitting}
              />
              <div>
                <label className="text-xs font-medium text-zinc-700">
                  Số lượng kế hoạch
                </label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={plannedQty}
                  onChange={(e) => setPlannedQty(e.target.value)}
                  className="mt-1 text-right tabular-nums"
                  placeholder="0"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-700">
                  Ưu tiên
                </label>
                <select
                  value={priority}
                  onChange={(e) =>
                    setPriority(
                      e.target.value as (typeof PRIORITIES)[number]["value"],
                    )
                  }
                  disabled={submitting}
                  className="mt-1 block h-10 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-zinc-700">
                  Bắt đầu (dự kiến)
                </label>
                <Input
                  type="date"
                  value={plannedStart}
                  onChange={(e) => setPlannedStart(e.target.value)}
                  disabled={submitting}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-700">
                  Kết thúc (dự kiến)
                </label>
                <Input
                  type="date"
                  value={plannedEnd}
                  onChange={(e) => setPlannedEnd(e.target.value)}
                  disabled={submitting}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-700">
                  Ghi chú
                </label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={submitting}
                  className="mt-1"
                  placeholder="Tuỳ chọn..."
                />
              </div>
            </div>
          </section>

          {/* Vật tư cần */}
          <section className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">
                2. Vật tư cần xuất ({totalLines})
              </h2>
              <span className="text-xs text-zinc-500">
                Hệ thống tự đề xuất bin/lô FIFO khi tạo
              </span>
            </div>
            <div className="space-y-2">
              {materials.map((line, idx) => (
                <div
                  key={line.rowId}
                  className="grid grid-cols-1 gap-2 rounded-md border border-zinc-200 p-3 md:grid-cols-[28px_1fr_140px_28px]"
                >
                  <div className="flex h-9 items-center text-xs font-semibold text-zinc-500">
                    {idx + 1}.
                  </div>
                  <ItemPicker
                    label=""
                    value={line.item}
                    onChange={(v) => updateLine(line.rowId, { item: v })}
                    disabled={submitting}
                    compact
                  />
                  <div>
                    <Input
                      type="number"
                      min={0}
                      step={0.0001}
                      value={line.qty}
                      onChange={(e) =>
                        updateLine(line.rowId, { qty: e.target.value })
                      }
                      placeholder="SL cần"
                      className="text-right tabular-nums"
                      disabled={submitting || !line.item}
                    />
                    {line.item && (
                      <p className="mt-0.5 text-[10px] text-zinc-500">
                        Tồn: {line.item.totalQty} {line.item.uom}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.rowId)}
                    disabled={submitting || materials.length === 1}
                    className="inline-flex h-9 w-7 items-center justify-center text-zinc-400 hover:text-rose-600 disabled:opacity-30"
                    title="Xoá dòng"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLine}
              disabled={submitting}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm vật tư
            </button>
          </section>

          {/* Workflow info */}
          <section className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 text-xs text-indigo-900">
            <p className="flex items-center gap-2 font-semibold">
              <FileSignature className="h-4 w-4" />
              Quy trình sau khi tạo:
            </p>
            <ol className="mt-1.5 ml-6 list-decimal space-y-0.5 text-indigo-800">
              <li>WO được tạo với status RELEASED</li>
              <li>
                Tự động sinh yêu cầu xuất kho (ISR-...) link đến WO này, status
                PENDING
              </li>
              <li>
                Bộ phận Kho mở tab Xuất hàng → thấy yêu cầu → bấm{" "}
                <strong>Duyệt + xuất</strong> → tạo OUT_ISSUE inventory_txn
              </li>
              <li>Xưởng nhận đủ vật tư → bắt đầu sản xuất WO</li>
            </ol>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Button asChild variant="outline">
            <Link href="/operations">
              <ArrowLeft className="h-3.5 w-3.5" />
              Quay lại
            </Link>
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !product || !plannedQty || totalLines === 0}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Factory className="h-3.5 w-3.5" />
            {submitting ? "Đang tạo…" : "Tạo WO + Gửi yêu cầu xuất kho"}
          </Button>
        </div>
      </footer>
    </div>
  );
}

/* ============================================================ */
/* ItemPicker — search + select reusable                         */
/* ============================================================ */

function ItemPicker({
  label,
  value,
  onChange,
  disabled,
  compact,
}: {
  label?: string;
  value: ItemRef | null;
  onChange: (v: ItemRef | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [results, setResults] = React.useState<ItemRef[]>([]);
  const [searching, setSearching] = React.useState(false);

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
          `/api/items?q=${encodeURIComponent(t)}&pageSize=8`,
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
          setResults(
            (json.data ?? []).map((x) => ({
              id: x.id,
              sku: x.sku,
              name: x.name,
              uom: x.uom,
              totalQty: x.inventorySummary?.totalQty ?? 0,
            })),
          );
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  if (value) {
    return (
      <div className={cn(!compact && "mt-0")}>
        {label && (
          <label className="text-xs font-medium text-zinc-700">{label}</label>
        )}
        <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2">
          <div className="min-w-0">
            <code className="font-mono text-xs font-semibold text-indigo-900">
              {value.sku}
            </code>
            <p className="truncate text-[11px] text-indigo-700">{value.name}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            className="text-xs text-zinc-500 hover:text-zinc-900"
          >
            Đổi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && (
        <label className="text-xs font-medium text-zinc-700">{label}</label>
      )}
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Tìm SKU hoặc tên (≥ 2 ký tự)…"
          className="pl-8"
          disabled={disabled}
        />
      </div>
      {searching && (
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Đang tìm…
        </p>
      )}
      {results.length > 0 && (
        <ul className="mt-1 max-h-48 divide-y divide-zinc-100 overflow-auto rounded-md border border-zinc-200 bg-white">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(r);
                  setSearchTerm("");
                  setResults([]);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-zinc-50"
              >
                <div className="min-w-0">
                  <code className="font-mono text-xs font-semibold text-zinc-900">
                    {r.sku}
                  </code>
                  <p className="truncate text-[11px] text-zinc-600">
                    {r.name}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
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
    </div>
  );
}

// Suppress unused import (AlertTriangle) until we add shortage warning UI
void AlertTriangle;
