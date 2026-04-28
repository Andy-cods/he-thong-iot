"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit3,
  FileText,
  History,
  Loader2,
  Package,
  Plus,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { PR_STATUS_LABELS, type PRStatus } from "@iot/shared";
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
  useApprovePurchaseRequest,
  usePurchaseRequestDetail,
  useRejectPurchaseRequest,
  useUpdatePurchaseRequest,
} from "@/hooks/usePurchaseRequests";
import { useConvertPRToPOs } from "@/hooks/usePurchaseOrders";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * V3.4 — Purchase Request detail page redesign hoàn toàn.
 *
 * Layout:
 *   - Header sticky: avatar + status pill + actions (Submit/Approve/Reject/Convert)
 *   - Info section: 2 cột grid với icon labels
 *   - Lines table: inline edit qty + add/remove dòng (DRAFT/SUBMITTED only)
 *   - Audit drawer: ghi log thay đổi (skeleton — endpoint chưa có)
 */

type Tab = "info" | "lines" | "audit";

const STATUS_PILL: Record<PRStatus, { cls: string; dot: string; icon: React.ElementType }> = {
  DRAFT:     { cls: "bg-zinc-100 text-zinc-700 ring-zinc-200",    dot: "bg-zinc-400",       icon: Edit3        },
  SUBMITTED: { cls: "bg-amber-50 text-amber-700 ring-amber-200",  dot: "bg-amber-500 animate-pulse", icon: Clock },
  APPROVED:  { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", icon: CheckCircle2 },
  REJECTED:  { cls: "bg-red-50 text-red-700 ring-red-200",        dot: "bg-red-500",        icon: XCircle      },
  CONVERTED: { cls: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "bg-indigo-500",   icon: ArrowRight   },
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
  qty: string;
  notes: string;
}

export default function PurchaseRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const session = useSession();
  const roles = session.data?.roles ?? [];
  const canManage = roles.includes("admin") || roles.includes("planner");
  const canPurchase = roles.includes("admin") || roles.includes("purchaser");

  const detail = usePurchaseRequestDetail(id);
  const update = useUpdatePurchaseRequest(id);
  const approve = useApprovePurchaseRequest(id);
  const reject = useRejectPurchaseRequest(id);
  const convert = useConvertPRToPOs();

  const [tab, setTab] = React.useState<Tab>("info");
  const [editing, setEditing] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState("");
  const [editNotes, setEditNotes] = React.useState("");
  const [editLines, setEditLines] = React.useState<EditableLine[]>([]);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");

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

  const pr = detail.data?.data;

  // Init edit state khi vào edit mode
  const startEdit = () => {
    if (!pr) return;
    setEditTitle(pr.title ?? "");
    setEditNotes(pr.notes ?? "");
    setEditLines(
      pr.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        sku: l.sku ?? "",
        itemName: l.name ?? "",
        uom: undefined,
        qty: String(l.qty),
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

  const addItemToLines = (it: ItemSearch) => {
    if (editLines.find((l) => l.itemId === it.id)) {
      toast.info("Linh kiện này đã có trong danh sách");
      return;
    }
    setEditLines((prev) => [
      ...prev,
      { itemId: it.id, sku: it.sku, itemName: it.name, uom: it.uom, qty: "1", notes: "" },
    ]);
    setSearch("");
    setSearchOpen(false);
  };

  const removeLine = (idx: number) => setEditLines((prev) => prev.filter((_, i) => i !== idx));
  const updateLine = (idx: number, patch: Partial<EditableLine>) =>
    setEditLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const handleSaveEdit = async () => {
    if (editLines.length === 0) {
      toast.error("PR cần ít nhất 1 dòng linh kiện");
      return;
    }
    if (editLines.some((l) => Number(l.qty) <= 0)) {
      toast.error("Số lượng phải lớn hơn 0");
      return;
    }
    try {
      await update.mutateAsync({
        title: editTitle.trim() || null,
        notes: editNotes.trim() || null,
        lines: editLines.map((l) => ({
          itemId: l.itemId,
          qty: Number(l.qty),
          notes: l.notes.trim() || null,
        })),
      });
      toast.success("Đã cập nhật PR");
      setEditing(false);
    } catch (err) {
      toast.error(`Cập nhật thất bại: ${(err as Error).message}`);
    }
  };

  if (detail.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Đang tải PR…
      </div>
    );
  }
  if (!pr) {
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red-400" aria-hidden />
        <p className="mt-2 text-sm font-semibold text-red-700">Không tìm thấy PR</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/procurement/purchase-requests">Về danh sách</Link>
        </Button>
      </div>
    );
  }

  const cfg = STATUS_PILL[pr.status as PRStatus];
  const StatusIcon = cfg.icon;
  const isEditable = canManage && (pr.status === "DRAFT" || pr.status === "SUBMITTED");
  const canApprove = canPurchase && (pr.status === "DRAFT" || pr.status === "SUBMITTED");
  const canReject = canPurchase && (pr.status === "DRAFT" || pr.status === "SUBMITTED" || pr.status === "APPROVED");
  const canConvert = canPurchase && pr.status === "APPROVED";
  const totalQty = pr.lines.reduce((s, l) => s + Number(l.qty), 0);

  const handleApprove = async () => {
    try {
      await approve.mutateAsync({ notes: null });
      toast.success("Đã duyệt PR");
    } catch (err) {
      toast.error(`Duyệt thất bại: ${(err as Error).message}`);
    }
  };

  const handleReject = async () => {
    if (rejectReason.trim().length < 3) {
      toast.error("Lý do tối thiểu 3 ký tự");
      return;
    }
    try {
      await reject.mutateAsync({ reason: rejectReason.trim() });
      toast.success("Đã từ chối PR");
      setRejectOpen(false);
      setRejectReason("");
    } catch (err) {
      toast.error(`Từ chối thất bại: ${(err as Error).message}`);
    }
  };

  const handleConvert = async () => {
    try {
      const res = await convert.mutateAsync(id);
      const count = res.data.createdPOs.length;
      toast.success(`Đã tạo ${count} PO từ PR`);
      if (count === 1 && res.data.createdPOs[0]) {
        router.push(`/procurement/purchase-orders/${res.data.createdPOs[0].id}`);
      } else {
        router.push("/procurement/purchase-orders");
      }
    } catch (err) {
      toast.error(`Tạo PO thất bại: ${(err as Error).message}`);
    }
  };

  return (
    <div className="flex h-full flex-col bg-zinc-50/30">

      {/* ── Header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-6 py-4">
        <Link
          href="/procurement/purchase-requests"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Yêu cầu mua hàng
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-md shadow-indigo-500/30">
              <ShoppingCart className="h-6 w-6 text-white" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium text-zinc-500">{pr.code}</span>
                <span className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                  cfg.cls,
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} aria-hidden />
                  {PR_STATUS_LABELS[pr.status as PRStatus]}
                </span>
              </div>
              <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-zinc-900">
                {pr.title || "Không có tiêu đề"}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!editing && isEditable && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Edit3 className="h-3.5 w-3.5" aria-hidden />
                Chỉnh sửa
              </Button>
            )}
            {editing && (
              <>
                <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={update.isPending}>
                  <X className="h-3.5 w-3.5" aria-hidden /> Huỷ
                </Button>
                <Button size="sm" onClick={() => void handleSaveEdit()} disabled={update.isPending}>
                  {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Lưu thay đổi
                </Button>
              </>
            )}
            {!editing && (
              <>
                {canApprove && (
                  <Button
                    size="sm"
                    onClick={() => void handleApprove()}
                    disabled={approve.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {approve.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Duyệt
                  </Button>
                )}
                {canReject && (
                  <Button variant="outline" size="sm" onClick={() => setRejectOpen(true)}
                    className="border-red-200 text-red-700 hover:bg-red-50">
                    <X className="h-3.5 w-3.5" /> Từ chối
                  </Button>
                )}
                {canConvert && (
                  <Button size="sm" onClick={() => void handleConvert()} disabled={convert.isPending}>
                    {convert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    Tạo PO
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── KPI strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 border-b border-zinc-200 bg-white px-6 py-3 lg:grid-cols-4">
        <KpiInline icon={Package} label="Số dòng" value={String(pr.lines.length)} />
        <KpiInline icon={FileText} label="Tổng SL" value={formatNumber(totalQty)} />
        <KpiInline icon={Calendar} label="Tạo lúc" value={formatDate(pr.createdAt, "dd/MM/yyyy")} />
        <KpiInline icon={StatusIcon} label="Trạng thái" value={PR_STATUS_LABELS[pr.status as PRStatus]} />
      </div>

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-zinc-200 bg-white px-6">
        {([
          { v: "info" as const, label: "Thông tin", icon: FileText },
          { v: "lines" as const, label: `Dòng hàng (${pr.lines.length})`, icon: Package },
          { v: "audit" as const, label: "Lịch sử", icon: History },
        ]).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.v}
              type="button"
              onClick={() => setTab(t.v)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors",
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
          <div className="mx-auto max-w-4xl space-y-5">
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <FileText className="h-4 w-4 text-zinc-400" /> Thông tin yêu cầu
              </h2>
              <div className="grid gap-5 md:grid-cols-2">
                <InfoRow icon={FileText} label="Mã PR" value={<span className="font-mono font-semibold text-indigo-600">{pr.code}</span>} />
                <InfoRow icon={Building2} label="Nguồn" value={pr.source} />
                <InfoRow icon={Calendar} label="Tạo lúc" value={formatDate(pr.createdAt, "dd/MM/yyyy HH:mm")} />
                <InfoRow icon={Clock} label="Duyệt lúc" value={pr.approvedAt ? formatDate(pr.approvedAt, "dd/MM/yyyy HH:mm") : "—"} />
                <InfoRow icon={User} label="Người yêu cầu" value={pr.requestedBy ? `${pr.requestedBy.slice(0, 8)}…` : "—"} />
                <InfoRow icon={CheckCircle2} label="Người duyệt" value={pr.approvedBy ? `${pr.approvedBy.slice(0, 8)}…` : "—"} />
              </div>

              <div className="mt-5 border-t border-zinc-100 pt-5">
                <Label htmlFor="title" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Tiêu đề
                </Label>
                {editing ? (
                  <input
                    id="title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Tiêu đề ngắn cho PR..."
                  />
                ) : (
                  <p className="mt-1.5 text-sm text-zinc-800">{pr.title || <span className="italic text-zinc-400">Chưa có tiêu đề</span>}</p>
                )}
              </div>

              <div className="mt-4">
                <Label htmlFor="notes" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Ghi chú
                </Label>
                {editing ? (
                  <Textarea
                    id="notes"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={4}
                    className="mt-1.5"
                    placeholder="Ghi chú thêm về yêu cầu..."
                  />
                ) : (
                  <p className="mt-1.5 whitespace-pre-line text-sm text-zinc-700">
                    {pr.notes || <span className="italic text-zinc-400">Không có ghi chú</span>}
                  </p>
                )}
              </div>
            </section>
          </div>
        )}

        {tab === "lines" && (
          <div className="mx-auto max-w-5xl space-y-4">
            {editing && (
              <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-indigo-900">Đang chỉnh sửa</p>
                    <p className="text-xs text-indigo-700">Thêm linh kiện mới hoặc sửa qty/ghi chú từng dòng</p>
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
                        placeholder="Tìm SKU hoặc tên linh kiện..."
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
                                  onClick={() => addItemToLines(it)}
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
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 w-12">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">SKU</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Tên linh kiện</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Số lượng</th>
                    {!editing && <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Còn thiếu</th>}
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">{editing ? "Ghi chú" : "Cần"}</th>
                    {editing && <th className="w-12" />}
                  </tr>
                </thead>
                <tbody>
                  {editing
                    ? editLines.map((l, i) => (
                        <tr key={l.itemId} className="border-b border-zinc-50">
                          <td className="px-4 py-3 text-sm text-zinc-500">{i + 1}</td>
                          <td className="px-4 py-3 font-mono text-sm font-semibold text-indigo-600">{l.sku}</td>
                          <td className="px-4 py-3 text-sm text-zinc-700">{l.itemName}</td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              value={l.qty}
                              onChange={(e) => updateLine(i, { qty: e.target.value })}
                              className="h-9 w-24 rounded-md border border-zinc-200 bg-white px-2.5 text-right font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={l.notes}
                              onChange={(e) => updateLine(i, { notes: e.target.value })}
                              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              placeholder="Tuỳ chọn..."
                            />
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
                      ))
                    : pr.lines.map((l) => (
                        <tr key={l.id} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors">
                          <td className="px-4 py-3.5 text-sm text-zinc-500">{l.lineNo}</td>
                          <td className="px-4 py-3.5 font-mono text-sm font-semibold text-indigo-600">{l.sku ?? "—"}</td>
                          <td className="px-4 py-3.5 text-sm text-zinc-700">{l.name ?? "—"}</td>
                          <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold text-zinc-800">
                            {formatNumber(Number(l.qty))}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-sm text-amber-700">
                            {l.remainingShortQty ? formatNumber(Number(l.remainingShortQty)) : "—"}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-zinc-600">
                            {l.neededBy ? formatDate(l.neededBy, "dd/MM/yyyy") : "—"}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </section>
          </div>
        )}

        {tab === "audit" && (
          <div className="mx-auto max-w-3xl">
            <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
                  <History className="h-6 w-6 text-zinc-400" aria-hidden />
                </div>
                <h3 className="mt-3 text-base font-semibold text-zinc-900">Lịch sử thay đổi</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Xem audit log đầy đủ tại trang quản trị
                </p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href={`/admin/audit?objectType=purchase_request&objectId=${pr.id}`}>
                    Mở trang audit
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* ── Reject dialog ─────────────────────────────────────── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-red-600" /> Từ chối PR
            </DialogTitle>
            <DialogDescription>
              Lý do sẽ được ghi vào audit log. Thao tác không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason" required>Lý do (3–500 ký tự)</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="VD: Linh kiện không cần thiết cho dự án này…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>Huỷ</Button>
            <Button
              variant="destructive"
              onClick={() => void handleReject()}
              disabled={reject.isPending || rejectReason.trim().length < 3}
            >
              {reject.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Từ chối PR
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
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="mt-0.5 text-sm text-zinc-800">{value}</p>
      </div>
    </div>
  );
}

function KpiInline({ icon: Icon, label, value }: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="text-sm font-bold text-zinc-900 truncate">{value}</p>
      </div>
    </div>
  );
}
