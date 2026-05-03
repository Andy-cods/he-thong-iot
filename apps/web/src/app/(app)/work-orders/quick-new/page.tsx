"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Calendar,
  CheckCircle2,
  Factory,
  FileSignature,
  Loader2,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * V3.7.12 — `/work-orders/quick-new` — Tạo lệnh sản xuất.
 *
 * UI redesign theo feedback user 2026-04-30: hiện đại, chuyên nghiệp, nhanh chóng.
 *
 * Layout:
 *   - 2 cột: Form (8/12) + Summary sidebar sticky (4/12)
 *   - Section cards với header gradient + step number
 *   - Live summary stats trên sidebar
 *   - Submit button gradient + spinner + icon
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
  { value: "LOW", label: "Thấp", color: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
  { value: "NORMAL", label: "Bình thường", color: "bg-blue-50 text-blue-700 ring-blue-200" },
  { value: "HIGH", label: "Cao", color: "bg-amber-50 text-amber-700 ring-amber-200" },
  { value: "URGENT", label: "Khẩn", color: "bg-rose-50 text-rose-700 ring-rose-200" },
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

  const validMaterials = materials.filter(
    (m) => m.item && Number(m.qty) > 0,
  );
  const totalLines = validMaterials.length;
  const totalQtyNeeded = validMaterials.reduce(
    (s, m) => s + Number(m.qty),
    0,
  );
  const totalShortage = validMaterials.reduce((s, m) => {
    const need = Number(m.qty);
    const have = m.item?.totalQty ?? 0;
    return s + Math.max(0, need - have);
  }, 0);

  const canSubmit =
    !!product && Number(plannedQty) > 0 && totalLines > 0 && !submitting;

  const addLine = () =>
    setMaterials((prev) => [...prev, { rowId: uuid(), item: null, qty: "" }]);
  const removeLine = (rowId: string) =>
    setMaterials((prev) => prev.filter((m) => m.rowId !== rowId));
  const updateLine = (rowId: string, patch: Partial<MaterialLine>) =>
    setMaterials((prev) =>
      prev.map((m) => (m.rowId === rowId ? { ...m, ...patch } : m)),
    );

  const handleSubmit = async () => {
    if (!product) return toast.error("Chọn sản phẩm trước.");
    const pq = Number(plannedQty);
    if (!Number.isFinite(pq) || pq <= 0)
      return toast.error("Số lượng kế hoạch phải > 0.");
    if (validMaterials.length === 0)
      return toast.error("Cần ít nhất 1 vật tư.");

    if (totalShortage > 0) {
      const ok = window.confirm(
        `⚠ Tồn kho thiếu ${totalShortage} đơn vị.\nVẫn tạo WO? (yêu cầu xuất kho sẽ pick được phần có sẵn)`,
      );
      if (!ok) return;
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
          materials: validMaterials.map((m) => ({
            itemId: m.item!.id,
            qty: Number(m.qty),
          })),
        }),
      });
      const json = (await res.json()) as {
        data?: {
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
      toast.success(
        `Đã tạo ${json.data.woNo} → ${json.data.requestNo} (chờ Kho duyệt).`,
      );
      router.push("/operations?tab=wo");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gradient-to-br from-zinc-50 to-zinc-100">
      {/* HEADER */}
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
            Gia công
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="font-medium text-zinc-900">Tạo lệnh sản xuất</span>
        </nav>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-200">
            <Factory className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              Tạo lệnh sản xuất
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              Lệnh + tự động yêu cầu xuất kho → Kho duyệt → vào sản xuất
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 p-6 lg:grid-cols-12">
          {/* MAIN FORM */}
          <div className="space-y-5 lg:col-span-8">
            {/* SECTION 1: Sản phẩm */}
            <Section
              step={1}
              title="Sản phẩm cần sản xuất"
              icon={<Package className="h-4 w-4" />}
              done={!!product && Number(plannedQty) > 0}
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_140px]">
                <ItemPicker
                  label="SKU thành phẩm"
                  value={product}
                  onChange={setProduct}
                  disabled={submitting}
                />
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Số lượng
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={plannedQty}
                    onChange={(e) => setPlannedQty(e.target.value)}
                    className="mt-1.5 h-10 text-right tabular-nums text-base font-semibold"
                    placeholder="0"
                    disabled={submitting || !product}
                  />
                  {product && plannedQty && (
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      = {plannedQty} {product.uom}
                    </p>
                  )}
                </div>
              </div>

              {/* Priority chips */}
              <div className="mt-4">
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Mức độ ưu tiên
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      disabled={submitting}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-all",
                        priority === p.value
                          ? `${p.color} ring-2`
                          : "bg-white text-zinc-500 ring-zinc-200 hover:bg-zinc-50",
                      )}
                    >
                      {priority === p.value && (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <DateField
                  label="Bắt đầu"
                  value={plannedStart}
                  onChange={setPlannedStart}
                  disabled={submitting}
                />
                <DateField
                  label="Kết thúc"
                  value={plannedEnd}
                  onChange={setPlannedEnd}
                  disabled={submitting}
                />
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Ghi chú
                  </label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={submitting}
                    className="mt-1.5"
                    placeholder="Tuỳ chọn..."
                  />
                </div>
              </div>
            </Section>

            {/* SECTION 2: Vật tư */}
            <Section
              step={2}
              title="Vật tư cần xuất kho"
              icon={<Boxes className="h-4 w-4" />}
              done={totalLines > 0}
              accent={totalShortage > 0 ? "warning" : undefined}
            >
              <div className="space-y-2">
                {materials.map((line, idx) => (
                  <MaterialCard
                    key={line.rowId}
                    line={line}
                    index={idx}
                    onUpdate={(patch) => updateLine(line.rowId, patch)}
                    onRemove={() => removeLine(line.rowId)}
                    disabled={submitting}
                    removable={materials.length > 1}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={addLine}
                disabled={submitting}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-600 transition-all hover:border-orange-400 hover:bg-orange-50/50 hover:text-orange-700"
              >
                <Plus className="h-4 w-4" />
                Thêm vật tư
              </button>
            </Section>
          </div>

          {/* SUMMARY SIDEBAR */}
          <div className="lg:col-span-4">
            <div className="sticky top-6 space-y-4">
              {/* Stats */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                  <Sparkles className="h-4 w-4 text-orange-500" />
                  Tổng kết lệnh
                </h3>
                <div className="mt-4 space-y-3">
                  <SummaryRow
                    label="Sản phẩm"
                    value={
                      product ? (
                        <code className="font-mono text-xs">{product.sku}</code>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )
                    }
                  />
                  <SummaryRow
                    label="SL kế hoạch"
                    value={
                      plannedQty && product ? (
                        <span className="font-bold tabular-nums text-emerald-700">
                          {plannedQty} {product.uom}
                        </span>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <SummaryRow
                    label="Số vật tư"
                    value={
                      <span className="font-semibold tabular-nums text-zinc-900">
                        {totalLines}
                      </span>
                    }
                  />
                  <SummaryRow
                    label="Tổng SL xuất"
                    value={
                      <span className="font-bold tabular-nums text-indigo-700">
                        {totalQtyNeeded.toLocaleString("vi-VN")}
                      </span>
                    }
                  />
                  <div className="my-3 border-t border-zinc-100" />
                  {totalShortage > 0 ? (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div>
                        <p className="font-semibold text-amber-900">
                          Thiếu tồn {totalShortage.toLocaleString("vi-VN")} đơn vị
                        </p>
                        <p className="mt-0.5 text-amber-700">
                          Yêu cầu sẽ pick phần có sẵn, phần thiếu chờ NCC giao.
                        </p>
                      </div>
                    </div>
                  ) : totalLines > 0 ? (
                    <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <div>
                        <p className="font-semibold text-emerald-900">
                          Đủ tồn cho toàn bộ lệnh
                        </p>
                        <p className="mt-0.5 text-emerald-700">
                          Kho có thể duyệt + xuất ngay.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400">
                      Thêm vật tư để xem trạng thái tồn kho.
                    </p>
                  )}
                </div>
              </div>

              {/* Workflow */}
              <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-4">
                <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-indigo-900">
                  <FileSignature className="h-3.5 w-3.5" />
                  Quy trình tự động
                </h4>
                <ol className="mt-2 space-y-1.5 text-xs text-indigo-900">
                  <WorkflowStep n="1" label="Lệnh sản xuất tạo (RELEASED)" />
                  <WorkflowStep n="2" label="Yêu cầu xuất kho ISR-... PENDING" />
                  <WorkflowStep n="3" label="Kho duyệt → OUT_ISSUE" />
                  <WorkflowStep n="4" label="Xưởng nhận đủ → bắt đầu sản xuất" />
                </ol>
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={cn(
                  "h-12 w-full bg-gradient-to-r from-orange-500 to-amber-600 text-base font-bold shadow-lg shadow-orange-200",
                  "hover:from-orange-600 hover:to-amber-700",
                  "disabled:from-zinc-300 disabled:to-zinc-400 disabled:shadow-none",
                )}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tạo lệnh…
                  </>
                ) : (
                  <>
                    <Factory className="h-4 w-4" />
                    Tạo lệnh + Yêu cầu xuất kho
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <Button asChild variant="outline" className="h-9 w-full">
                <Link href="/operations">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Quay lại
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Section — card với step number + done check                  */
/* ============================================================ */

function Section({
  step,
  title,
  icon,
  children,
  done,
  accent,
}: {
  step: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  done?: boolean;
  accent?: "warning";
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-white shadow-sm transition-shadow",
        accent === "warning"
          ? "border-amber-200 ring-1 ring-amber-100"
          : "border-zinc-200",
      )}
    >
      <header
        className={cn(
          "flex items-center gap-3 border-b px-5 py-3",
          accent === "warning"
            ? "border-amber-100 bg-amber-50/50"
            : "border-zinc-100",
        )}
      >
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
            done
              ? "bg-emerald-100 text-emerald-700"
              : "bg-zinc-100 text-zinc-600",
          )}
        >
          {done ? <CheckCircle2 className="h-4 w-4" /> : step}
        </span>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
          {icon}
        </span>
        <h2 className="text-sm font-bold tracking-tight text-zinc-900">
          {title}
        </h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ============================================================ */
/* MaterialCard — 1 dòng vật tư với shortage indicator           */
/* ============================================================ */

function MaterialCard({
  line,
  index,
  onUpdate,
  onRemove,
  disabled,
  removable,
}: {
  line: MaterialLine;
  index: number;
  onUpdate: (patch: Partial<MaterialLine>) => void;
  onRemove: () => void;
  disabled: boolean;
  removable: boolean;
}) {
  const need = Number(line.qty);
  const have = line.item?.totalQty ?? 0;
  const shortage = Math.max(0, need - have);
  const ok = line.item && need > 0 && shortage === 0;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-3 transition-all",
        ok && "border-emerald-300 bg-emerald-50/30",
        shortage > 0 && "border-amber-300 bg-amber-50/30",
        !line.item && "border-zinc-200",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
          {index + 1}
        </span>
        <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-[1fr_140px]">
          <ItemPicker
            value={line.item}
            onChange={(v) => onUpdate({ item: v })}
            disabled={disabled}
            compact
          />
          <div className="flex items-stretch gap-1">
            <Input
              type="number"
              min={0}
              step={0.0001}
              value={line.qty}
              onChange={(e) => onUpdate({ qty: e.target.value })}
              placeholder="SL cần"
              className="h-10 text-right tabular-nums"
              disabled={disabled || !line.item}
            />
            {removable && (
              <button
                type="button"
                onClick={onRemove}
                disabled={disabled}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                title="Xoá"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      {line.item && (
        <div className="mt-2 ml-8 flex items-center gap-2 text-[11px]">
          <span className="text-zinc-500">
            Tồn:{" "}
            <span className="font-semibold tabular-nums text-zinc-700">
              {have.toLocaleString("vi-VN")} {line.item.uom}
            </span>
          </span>
          {ok && (
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              Đủ
            </span>
          )}
          {shortage > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
              <AlertCircle className="h-3 w-3" />
              Thiếu {shortage.toLocaleString("vi-VN")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/* DateField                                                     */
/* ============================================================ */

function DateField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
        {label}
      </label>
      <div className="relative mt-1.5">
        <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-10 pl-9"
        />
      </div>
    </div>
  );
}

/* ============================================================ */
/* SummaryRow + WorkflowStep                                     */
/* ============================================================ */

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function WorkflowStep({ n, label }: { n: string; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-200 text-[10px] font-bold text-indigo-900">
        {n}
      </span>
      <span>{label}</span>
    </li>
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
      <div>
        {label && (
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            {label}
          </label>
        )}
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-md border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-3",
            compact ? "h-10" : "mt-1.5 h-12",
          )}
        >
          <div className="min-w-0">
            <code className="font-mono text-sm font-bold text-indigo-900">
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
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          {label}
        </label>
      )}
      <div className={cn("relative", !compact && "mt-1.5")}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Tìm SKU hoặc tên (≥ 2 ký tự)…"
          className="h-10 pl-9"
          disabled={disabled}
        />
      </div>
      {searching && (
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Đang tìm…
        </p>
      )}
      {results.length > 0 && (
        <ul className="mt-1 max-h-56 divide-y divide-zinc-100 overflow-auto rounded-lg border border-zinc-200 bg-white shadow-md">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(r);
                  setSearchTerm("");
                  setResults([]);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-indigo-50"
              >
                <div className="min-w-0">
                  <code className="font-mono text-xs font-bold text-zinc-900">
                    {r.sku}
                  </code>
                  <p className="truncate text-[11px] text-zinc-600">{r.name}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold tabular-nums",
                    r.totalQty > 0
                      ? "bg-emerald-100 text-emerald-700"
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
