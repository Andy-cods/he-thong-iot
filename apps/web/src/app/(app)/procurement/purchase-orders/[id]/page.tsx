"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Edit3,
  FileText,
  History,
  Loader2,
  MapPin,
  Package,
  Plus,
  Receipt,
  Save,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PO_STATUS_LABELS, type POStatus } from "@iot/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/useSession";
import {
  usePurchaseOrderDetail,
  useUpdatePurchaseOrder,
  useSendPurchaseOrder,
} from "@/hooks/usePurchaseOrders";
import { useReceivingAudit } from "@/hooks/useReceivingEvents";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PoQuickReceiveTable } from "@/components/procurement/PoQuickReceiveTable";

/**
 * V3.4 — Purchase Order detail redesign hoàn toàn.
 *
 * Layout:
 *   - Header sticky: avatar gradient + status pill + actions context-aware
 *   - 4 KPI inline (Tổng giá trị, Số dòng, Đã nhận %, ETA)
 *   - 5 tabs: Thông tin / Dòng hàng / Nhận nhanh / Lịch sử nhận / Audit
 *   - Edit mode inline (DRAFT: full edit, SENT: chỉ ETA + notes)
 */

type Tab = "info" | "lines" | "receive" | "history" | "audit";

const STATUS_PILL: Record<POStatus, { cls: string; dot: string; icon: React.ElementType }> = {
  DRAFT:     { cls: "bg-zinc-100 text-zinc-700 ring-zinc-200",          dot: "bg-zinc-400",                  icon: Edit3        },
  SENT:      { cls: "bg-blue-50 text-blue-700 ring-blue-200",           dot: "bg-blue-500 animate-pulse",    icon: Send         },
  PARTIAL:   { cls: "bg-amber-50 text-amber-700 ring-amber-200",        dot: "bg-amber-500 animate-pulse",   icon: Package      },
  RECEIVED:  { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",  dot: "bg-emerald-500",               icon: CheckCircle2 },
  CANCELLED: { cls: "bg-red-50 text-red-700 ring-red-200",              dot: "bg-red-500",                   icon: XCircle      },
  CLOSED:    { cls: "bg-zinc-100 text-zinc-500 ring-zinc-200",          dot: "bg-zinc-400",                  icon: CheckCircle2 },
};

interface ItemSearch {
  id: string;
  sku: string;
  name: string;
  uom?: string;
}

interface EditableLine {
  id?: string;
  itemId: string;
  sku: string;
  itemName: string;
  uom?: string;
  orderedQty: string;
  unitPrice: string;
  taxRate: string;
  notes: string;
}

function fmtVND(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "0";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "0";
  return Math.round(num).toLocaleString("vi-VN");
}

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const session = useSession();
  const roles = session.data?.roles ?? [];
  const canManage = roles.includes("admin") || roles.includes("purchaser");
  const qc = useQueryClient();

  const detail = usePurchaseOrderDetail(id);
  const update = useUpdatePurchaseOrder(id);
  const send = useSendPurchaseOrder(id);

  const [tab, setTab] = React.useState<Tab>("info");
  const [editing, setEditing] = React.useState(false);
  const [editEta, setEditEta] = React.useState("");
  const [editPaymentTerms, setEditPaymentTerms] = React.useState("");
  const [editAddress, setEditAddress] = React.useState("");
  const [editNotes, setEditNotes] = React.useState("");
  const [editLines, setEditLines] = React.useState<EditableLine[]>([]);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [sendConfirmOpen, setSendConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const itemsQuery = useQuery({
    queryKey: ["items-search", debouncedQ],
    queryFn: async () => {
      const res = await fetch(`/api/items?q=${encodeURIComponent(debouncedQ)}&pageSize=15`, { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json() as Promise<{ data: ItemSearch[] }>;
    },
    enabled: searchOpen && debouncedQ.length >= 1,
    staleTime: 30_000,
  });

  const po = detail.data?.data;

  const startEdit = () => {
    if (!po) return;
    setEditEta(po.expectedEta ?? "");
    setEditPaymentTerms(po.paymentTerms ?? "");
    setEditAddress(po.deliveryAddress ?? "");
    setEditNotes(po.notes ?? "");
    setEditLines(
      po.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        sku: l.itemSku ?? "",
        itemName: l.itemName ?? "",
        uom: l.itemUom ?? undefined,
        orderedQty: String(l.orderedQty),
        unitPrice: String(l.unitPrice ?? 0),
        taxRate: String(l.taxRate ?? 8),
        notes: l.notes ?? "",
      })),
    );
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setSearchOpen(false);
    setSearch("");
  };

  const addItem = (it: ItemSearch) => {
    if (editLines.find((l) => l.itemId === it.id)) {
      toast.info("Linh kiện này đã có");
      return;
    }
    setEditLines((prev) => [
      ...prev,
      {
        itemId: it.id,
        sku: it.sku,
        itemName: it.name,
        uom: it.uom,
        orderedQty: "1",
        unitPrice: "0",
        taxRate: "8",
        notes: "",
      },
    ]);
    setSearch("");
    setSearchOpen(false);
  };

  const removeLine = (idx: number) => setEditLines((prev) => prev.filter((_, i) => i !== idx));
  const updateLine = (idx: number, patch: Partial<EditableLine>) =>
    setEditLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const handleSaveEdit = async () => {
    if (!po) return;
    const isDraft = po.status === "DRAFT";
    if (isDraft && editLines.length === 0) {
      toast.error("PO cần ít nhất 1 dòng");
      return;
    }
    if (isDraft && editLines.some((l) => Number(l.orderedQty) <= 0)) {
      toast.error("Số lượng phải > 0");
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        expectedEta: editEta ? new Date(editEta) : null,
        notes: editNotes.trim() || null,
      };
      if (isDraft) {
        payload.paymentTerms = editPaymentTerms.trim() || null;
        payload.deliveryAddress = editAddress.trim() || null;
        payload.lines = editLines.map((l) => ({
          itemId: l.itemId,
          orderedQty: Number(l.orderedQty),
          unitPrice: Number(l.unitPrice) || 0,
          taxRate: Number(l.taxRate) || 8,
          notes: l.notes.trim() || null,
        }));
      }
      await update.mutateAsync(payload as never);
      toast.success("Đã cập nhật PO");
      setEditing(false);
    } catch (err) {
      toast.error(`Cập nhật thất bại: ${(err as Error).message}`);
    }
  };

  const handleSend = async () => {
    try {
      await send.mutateAsync();
      toast.success("Đã gửi PO sang NCC");
      setSendConfirmOpen(false);
    } catch (err) {
      toast.error(`Gửi PO thất bại: ${(err as Error).message}`);
    }
  };

  if (detail.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải PO…
      </div>
    );
  }
  if (!po) {
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
        <p className="mt-2 text-sm font-semibold text-red-700">Không tìm thấy PO</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/sales?tab=po">Về danh sách</Link>
        </Button>
      </div>
    );
  }

  const cfg = STATUS_PILL[po.status as POStatus];
  const StatusIcon = cfg.icon;
  const isDraft = po.status === "DRAFT";
  const isSent = po.status === "SENT";
  const isEditable = canManage && (isDraft || isSent);
  const canSend = canManage && isDraft;

  // Compute totals from lines (current data)
  let subtotal = 0;
  let totalTax = 0;
  for (const l of po.lines) {
    const qty = Number(l.orderedQty) || 0;
    const price = Number(l.unitPrice) || 0;
    const tax = Number(l.taxRate ?? 0) || 0;
    const pre = qty * price;
    subtotal += pre;
    totalTax += pre * (tax / 100);
  }
  const grandTotal = subtotal + totalTax;
  const displayTotal = Number(po.totalAmount) || grandTotal;

  // Receiving progress
  const totalOrdered = po.lines.reduce((s, l) => s + Number(l.orderedQty), 0);
  const totalReceived = po.lines.reduce((s, l) => s + Number(l.receivedQty), 0);
  const receivedPct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

  return (
    <div className="flex h-full flex-col bg-zinc-50/30">

      {/* ── Header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-6 py-4">
        <Link
          href="/sales?tab=po"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Đơn đặt hàng
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/30">
              <Receipt className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <span className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                cfg.cls,
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                {PO_STATUS_LABELS[po.status as POStatus]}
              </span>
              <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-zinc-900">
                {po.poNo}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!editing && isEditable && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Edit3 className="h-3.5 w-3.5" /> Chỉnh sửa
              </Button>
            )}
            {editing && (
              <>
                <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={update.isPending}>
                  <X className="h-3.5 w-3.5" /> Huỷ
                </Button>
                <Button size="sm" onClick={() => void handleSaveEdit()} disabled={update.isPending}>
                  {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Lưu thay đổi
                </Button>
              </>
            )}
            {!editing && canSend && (
              <Button
                size="sm"
                onClick={() => setSendConfirmOpen(true)}
                disabled={send.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Gửi NCC
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ── KPI strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 border-b border-zinc-200 bg-white px-6 py-3 lg:grid-cols-4">
        <KpiInline icon={CreditCard} label="Tổng giá trị" value={`${fmtVND(displayTotal)} đ`} accent="indigo" />
        <KpiInline icon={Package} label="Số dòng" value={String(po.lines.length)} accent="zinc" />
        <KpiInline
          icon={Truck}
          label="Đã nhận"
          value={`${formatNumber(totalReceived)} / ${formatNumber(totalOrdered)} (${receivedPct}%)`}
          accent={receivedPct >= 100 ? "emerald" : receivedPct > 0 ? "amber" : "zinc"}
        />
        <KpiInline icon={Calendar} label="ETA" value={po.expectedEta ? formatDate(po.expectedEta, "dd/MM/yyyy") : "—"} accent="blue" />
      </div>

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-6">
        {([
          { v: "info" as const, label: "Thông tin", icon: FileText },
          { v: "lines" as const, label: `Dòng hàng (${po.lines.length})`, icon: Package },
          { v: "receive" as const, label: "Nhận nhanh", icon: Truck, hide: isDraft },
          { v: "history" as const, label: "Lịch sử nhận", icon: History, hide: isDraft },
          { v: "audit" as const, label: "Audit", icon: ShoppingCart },
        ]).filter((t) => !t.hide).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.v}
              type="button"
              onClick={() => setTab(t.v)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors whitespace-nowrap",
                "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-t-full after:transition-all",
                tab === t.v
                  ? "text-indigo-700 after:bg-indigo-600"
                  : "text-zinc-500 hover:text-zinc-800 after:bg-transparent",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        {tab === "info" && (
          <div className="mx-auto max-w-5xl space-y-5">
            {/* Info card */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <FileText className="h-4 w-4 text-zinc-400" /> Thông tin đơn hàng
              </h2>
              <div className="grid gap-5 md:grid-cols-2">
                <InfoRow icon={Receipt} label="Số PO" value={<span className="font-mono font-semibold text-indigo-600">{po.poNo}</span>} />
                <InfoRow icon={Building2} label="Nhà cung cấp" value={po.supplierName ?? po.supplierCode ?? "—"} />
                <InfoRow icon={Calendar} label="Ngày đặt" value={formatDate(po.orderDate, "dd/MM/yyyy")} />
                <InfoRow
                  icon={Clock}
                  label="ETA dự kiến"
                  value={editing ? (
                    <input
                      type="date"
                      value={editEta}
                      onChange={(e) => setEditEta(e.target.value)}
                      className="h-9 w-44 rounded-md border border-zinc-200 bg-white px-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (po.expectedEta ? formatDate(po.expectedEta, "dd/MM/yyyy") : "—")}
                />
                <InfoRow
                  icon={CreditCard}
                  label="Điều khoản TT"
                  value={editing && isDraft ? (
                    <input
                      type="text"
                      value={editPaymentTerms}
                      onChange={(e) => setEditPaymentTerms(e.target.value)}
                      placeholder="Net 30"
                      className="h-9 w-44 rounded-md border border-zinc-200 bg-white px-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (po.paymentTerms ?? "—")}
                />
                <InfoRow
                  icon={MapPin}
                  label="Địa chỉ giao"
                  value={editing && isDraft ? (
                    <input
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      placeholder="Địa chỉ giao hàng"
                      className="h-9 w-full max-w-md rounded-md border border-zinc-200 bg-white px-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (po.deliveryAddress ?? "—")}
                />
              </div>

              {/* Total breakdown */}
              <div className="mt-6 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 p-5 ring-1 ring-indigo-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Tổng giá trị</p>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-600">Tạm tính (chưa VAT)</span>
                    <span className="font-mono font-semibold tabular-nums text-zinc-800">{fmtVND(subtotal)} đ</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-600">Tổng VAT</span>
                    <span className="font-mono font-semibold tabular-nums text-zinc-800">{fmtVND(totalTax)} đ</span>
                  </div>
                  <div className="mt-2 border-t border-indigo-200 pt-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-900">Tổng cộng</span>
                    <span className="font-mono text-xl font-bold tabular-nums text-indigo-700">{fmtVND(displayTotal)} đ</span>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <Label htmlFor="po-notes" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Ghi chú
                </Label>
                {editing ? (
                  <Textarea
                    id="po-notes"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={3}
                    className="mt-1.5"
                    placeholder="Ghi chú cho NCC..."
                  />
                ) : (
                  <p className="mt-1.5 whitespace-pre-line text-sm text-zinc-700">
                    {po.notes || <span className="italic text-zinc-400">Không có ghi chú</span>}
                  </p>
                )}
              </div>
            </section>

            {isSent && editing && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4" /> Đã gửi NCC
                </p>
                <p className="mt-1 text-xs">PO đã ở trạng thái SENT. Chỉ sửa được ETA và Ghi chú. Để sửa Lines/Tổng giá trị, vui lòng huỷ PO và tạo mới.</p>
              </div>
            )}
          </div>
        )}

        {tab === "lines" && (
          <div className="mx-auto max-w-6xl space-y-4">
            {editing && isDraft && (
              <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-indigo-900">Đang chỉnh sửa lines</p>
                    <p className="text-xs text-indigo-700">Tổng giá trị tự động tính lại khi lưu</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSearchOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Thêm dòng
                  </Button>
                </div>
                {searchOpen && (
                  <div className="mt-3 rounded-xl border border-indigo-200 bg-white p-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm SKU hoặc tên..."
                        autoFocus
                        className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    {debouncedQ && (
                      <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50/40">
                        {itemsQuery.isLoading ? (
                          <p className="px-4 py-4 text-center text-xs text-zinc-500">Đang tìm…</p>
                        ) : (itemsQuery.data?.data ?? []).length === 0 ? (
                          <p className="px-4 py-4 text-center text-xs text-zinc-500">Không tìm thấy</p>
                        ) : (
                          <ul className="divide-y divide-zinc-100">
                            {(itemsQuery.data?.data ?? []).map((it) => (
                              <li key={it.id}>
                                <button
                                  type="button"
                                  onClick={() => addItem(it)}
                                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white"
                                >
                                  <span className="font-mono text-xs font-semibold text-indigo-600">{it.sku}</span>
                                  <span className="flex-1 truncate text-sm text-zinc-700">{it.name}</span>
                                  <Plus className="h-3.5 w-3.5 text-zinc-400" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 w-12">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Vật tư</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">SL đặt</th>
                    {!editing && <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Đã nhận</th>}
                    {!editing && <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Còn lại</th>}
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Đơn giá</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">VAT%</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Thành tiền</th>
                    {!editing && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">ETA</th>}
                    {editing && isDraft && <th className="w-12" />}
                  </tr>
                </thead>
                <tbody>
                  {editing && isDraft
                    ? editLines.map((l, i) => {
                        const qty = Number(l.orderedQty) || 0;
                        const price = Number(l.unitPrice) || 0;
                        const tax = Number(l.taxRate) || 0;
                        const lineTotal = qty * price * (1 + tax / 100);
                        return (
                          <tr key={l.itemId} className="border-b border-zinc-50">
                            <td className="px-4 py-3 text-zinc-500">{i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="font-mono text-sm font-semibold text-indigo-600">{l.sku}</span>
                                <span className="text-xs text-zinc-500 truncate max-w-xs">{l.itemName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={l.orderedQty}
                                onChange={(e) => updateLine(i, { orderedQty: e.target.value })}
                                className="ml-auto block h-9 w-24 rounded-md border border-zinc-200 bg-white px-2 text-right font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={l.unitPrice}
                                onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                                className="ml-auto block h-9 w-32 rounded-md border border-zinc-200 bg-white px-2 text-right font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={l.taxRate}
                                onChange={(e) => updateLine(i, { taxRate: e.target.value })}
                                className="ml-auto block h-9 w-16 rounded-md border border-zinc-200 bg-white px-2 text-right font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-zinc-800">
                              {fmtVND(lineTotal)}
                            </td>
                            <td className="px-2 py-3">
                              <button
                                type="button"
                                onClick={() => removeLine(i)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    : po.lines.map((l) => {
                        const qty = Number(l.orderedQty);
                        const recv = Number(l.receivedQty);
                        const rem = Math.max(0, qty - recv);
                        const lineTotal = qty * Number(l.unitPrice) * (1 + Number(l.taxRate ?? 0) / 100);
                        return (
                          <tr key={l.id} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors">
                            <td className="px-4 py-3.5 text-sm text-zinc-500">{l.lineNo}</td>
                            <td className="px-4 py-3.5">
                              <div className="flex flex-col">
                                <span className="font-mono text-sm font-semibold text-indigo-600">{l.itemSku ?? "—"}</span>
                                <span className="text-xs text-zinc-500 truncate max-w-xs">{l.itemName ?? "—"}{l.itemUom && ` (${l.itemUom})`}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold text-zinc-800">
                              {formatNumber(qty)}
                            </td>
                            <td className={cn(
                              "px-4 py-3.5 text-right font-mono text-sm font-semibold",
                              recv >= qty ? "text-emerald-700" : recv > 0 ? "text-amber-700" : "text-zinc-400",
                            )}>
                              {formatNumber(recv)}
                            </td>
                            <td className={cn(
                              "px-4 py-3.5 text-right font-mono text-sm",
                              rem > 0 ? "text-orange-700 font-semibold" : "text-zinc-400",
                            )}>
                              {formatNumber(rem)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono text-sm text-zinc-700">
                              {fmtVND(l.unitPrice)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono text-sm text-zinc-700">
                              {l.taxRate ?? 0}%
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold text-zinc-800">
                              {fmtVND(lineTotal)}
                            </td>
                            <td className="px-4 py-3.5 text-sm text-zinc-600">
                              {l.expectedEta ? formatDate(l.expectedEta, "dd/MM/yyyy") : "—"}
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </section>
          </div>
        )}

        {tab === "receive" && !isDraft && (
          <div className="mx-auto max-w-6xl">
            <PoQuickReceiveTable poId={id} readOnly={po.status === "RECEIVED" || po.status === "CLOSED" || po.status === "CANCELLED"} />
          </div>
        )}

        {tab === "history" && !isDraft && (
          <div className="mx-auto max-w-5xl">
            <ReceivingHistorySection poId={id} />
          </div>
        )}

        {tab === "audit" && (
          <div className="mx-auto max-w-3xl">
            <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
                  <History className="h-6 w-6 text-zinc-400" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-zinc-900">Audit log</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Xem chi tiết tất cả thay đổi tại trang quản trị
                </p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href={`/admin/audit?objectType=purchase_order&objectId=${po.id}`}>
                    Mở trang audit
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* ── Send confirm dialog ───────────────────────────────── */}
      <Dialog open={sendConfirmOpen} onOpenChange={setSendConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-600" /> Gửi PO sang Nhà cung cấp
            </DialogTitle>
            <DialogDescription>
              PO sẽ chuyển sang trạng thái <strong>SENT</strong>. Sau khi gửi chỉ có thể sửa ETA và Ghi chú.
              Bộ phận Kho sẽ nhận thông báo để chuẩn bị nhận hàng.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendConfirmOpen(false)}>Huỷ</Button>
            <Button onClick={() => void handleSend()} disabled={send.isPending} className="bg-blue-600 hover:bg-blue-700">
              {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Xác nhận gửi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────── */

function InfoRow({ icon: Icon, label, value }: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        <div className="mt-0.5 text-sm text-zinc-800">{value}</div>
      </div>
    </div>
  );
}

function KpiInline({ icon: Icon, label, value, accent }: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent: "indigo" | "zinc" | "emerald" | "amber" | "blue";
}) {
  const map = {
    indigo:  "bg-indigo-50 text-indigo-600",
    zinc:    "bg-zinc-100 text-zinc-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber:   "bg-amber-50 text-amber-600",
    blue:    "bg-blue-50 text-blue-600",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white px-4 py-3">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", map[accent])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="text-sm font-bold text-zinc-900 truncate">{value}</p>
      </div>
    </div>
  );
}

function ReceivingHistorySection({ poId }: { poId: string }) {
  const audit = useReceivingAudit(poId);
  if (audit.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải lịch sử nhận hàng…
      </div>
    );
  }
  if (audit.isError || !audit.data?.data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {(audit.error as Error)?.message ?? "Không tải được lịch sử"}
      </div>
    );
  }
  const data = audit.data.data;
  return (
    <div className="space-y-5">
      {/* Receipts */}
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 bg-zinc-50/60 px-5 py-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-900">Phiếu nhập kho</h3>
          <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
            {data.receipts.length}
          </span>
        </div>
        {data.receipts.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">Chưa có phiếu nhập nào.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {data.receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-mono text-sm font-bold text-indigo-600">{r.receiptNo}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {new Date(r.receivedAt).toLocaleString("vi-VN")}
                    {r.qcNotes && ` · ${r.qcNotes}`}
                  </p>
                </div>
                <span className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                  r.qcFlag === "OK" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                  r.qcFlag === "NG" ? "bg-red-50 text-red-700 ring-red-200" :
                  "bg-amber-50 text-amber-700 ring-amber-200",
                )}>
                  {r.qcFlag}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Lines */}
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 bg-zinc-50/60 px-5 py-3 flex items-center gap-2">
          <Package className="h-4 w-4 text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-900">Chi tiết vật tư đã nhận</h3>
          <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
            {data.receiptLines.length}
          </span>
        </div>
        {data.receiptLines.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">Chưa có dòng nhận nào.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">SKU</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Tên</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">SL nhận</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Lot</th>
              </tr>
            </thead>
            <tbody>
              {data.receiptLines.map((l) => (
                <tr key={l.id} className="border-b border-zinc-50">
                  <td className="px-4 py-3 font-mono text-sm font-semibold text-zinc-800">{l.itemSku ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-zinc-700">{l.itemName ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-emerald-700">
                    {formatNumber(Number(l.receivedQty))}
                    {l.itemUom && <span className="ml-1 text-xs font-normal text-zinc-500">{l.itemUom}</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                    {l.lotCode ?? l.serialCode ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
