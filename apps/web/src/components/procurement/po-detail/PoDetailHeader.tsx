"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronLeft,
  Clock,
  Download,
  Edit3,
  FileText,
  Loader2,
  MoreHorizontal,
  Save,
  Send,
  Truck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm, usePrompt } from "@/components/ui/confirm-dialog";
import { StatusPill } from "@/components/ui/status-badge";
import {
  useApprovePO,
  usePOTransition,
  useRejectPO,
  useSendPurchaseOrder,
  useSubmitPOApproval,
} from "@/hooks/usePurchaseOrders";
import { downloadFromUrl } from "@/lib/download";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import type { PoFlags } from "@/lib/po-detail";
import { statusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { PoDetail } from "./types";

/**
 * V4.1 PO-UI: đầu trang PO gọn, dính khi cuộn.
 *  Dòng 1: ← Đơn đặt hàng / Số PO + trạng thái + loại + NCC ········ thao tác
 *  Dòng 2: dải tóm tắt nhỏ (Tổng cộng · số dòng · đã nhận · dự kiến)
 * Thao tác chính theo trạng thái (Gửi duyệt / Duyệt / Gửi NCC / Nhận hàng /
 * Tạo HĐ mua / Xuất PDF); phụ (Sửa, Đóng, Huỷ) trong menu "⋯".
 */

export interface PoDetailHeaderProps {
  po: PoDetail;
  flags: PoFlags;
  totals: { total: number; ordered: number; received: number; pct: number };
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onReceive: () => void;
  /** Hiện nút "Tạo HĐ mua" (PO nhận hàng, chưa có HĐ, có quyền tạo). */
  showCreateInvoice: boolean;
  onInvoice: () => void;
}

/** Chiều cao thanh trên cùng (TopBar sticky) để đầu trang PO dính ngay dưới. */
function useTopBarOffset(): number {
  const [top, setTop] = React.useState(0);
  React.useEffect(() => {
    const bar = document.querySelector<HTMLElement>('header[role="banner"]');
    if (!bar) return;
    const update = () => setTop(bar.offsetHeight);
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(bar);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return top;
}

export function PoDetailHeader({
  po,
  flags,
  totals,
  editing,
  saving,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onReceive,
  showCreateInvoice,
  onInvoice,
}: PoDetailHeaderProps) {
  const top = useTopBarOffset();
  const askConfirm = useConfirm();
  const askPrompt = usePrompt();
  const submit = useSubmitPOApproval(po.id);
  const approve = useApprovePO(po.id);
  const reject = useRejectPO(po.id);
  const send = useSendPurchaseOrder(po.id);
  const cancelPo = usePOTransition(po.id, "cancel");
  const closePo = usePOTransition(po.id, "close");
  const [exporting, setExporting] = React.useState(false);

  const busy =
    submit.isPending ||
    approve.isPending ||
    reject.isPending ||
    send.isPending ||
    cancelPo.isPending ||
    closePo.isPending;

  const run = async (fn: () => Promise<unknown>, ok: string, failPrefix: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(`${failPrefix}: ${(err as Error).message}`);
    }
  };

  const handleSubmit = () => void run(() => submit.mutateAsync(), "Đã gửi PO để duyệt.", "Gửi duyệt thất bại");
  const handleApprove = () =>
    void run(() => approve.mutateAsync({ notes: null }), "Đã duyệt PO.", "Duyệt thất bại");
  const handleReject = async () => {
    const reason = await askPrompt({
      title: `Từ chối ${po.poNo}`,
      label: "Lý do từ chối",
      minLength: 3,
      maxLength: 500,
      tone: "danger",
      confirmLabel: "Từ chối",
    });
    if (reason === null) return;
    await run(() => reject.mutateAsync({ reason }), "Đã từ chối PO.", "Từ chối thất bại");
  };
  const handleSend = async () => {
    const ok = await askConfirm({
      title: "Xác nhận đã gửi PO cho NCC",
      description: `PO chuyển sang “${statusLabel("po", "SENT")}”; hệ thống không tự gửi email. Kho được báo để chuẩn bị nhận hàng. Sau đó chỉ sửa được Ngày dự kiến, Ghi chú và giá.`,
      confirmLabel: "Đánh dấu đã gửi",
    });
    if (!ok) return;
    await run(() => send.mutateAsync(), "Đã đánh dấu PO là đã gửi.", "Gửi PO thất bại");
  };
  const handleTransition = async (action: "cancel" | "close") => {
    const reason = await askPrompt({
      title: `${action === "cancel" ? "Huỷ" : "Đóng"} ${po.poNo}`,
      description:
        action === "cancel"
          ? "PO chưa nhận hàng sẽ chuyển sang Đã huỷ. Kho được báo nếu PO đã gửi NCC."
          : "PO chuyển sang Đã đóng — không nhận thêm hàng. Dùng khi NCC không giao nốt hoặc để chốt hồ sơ.",
      label: "Lý do",
      minLength: 3,
      maxLength: 500,
      tone: action === "cancel" ? "danger" : "primary",
      confirmLabel: action === "cancel" ? "Huỷ PO" : "Đóng PO",
      cancelLabel: "Thôi",
    });
    if (reason === null) return;
    await run(
      () => (action === "cancel" ? cancelPo : closePo).mutateAsync({ reason }),
      action === "cancel" ? "Đã huỷ PO." : "Đã đóng PO.",
      action === "cancel" ? "Huỷ PO thất bại" : "Đóng PO thất bại",
    );
  };
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      await downloadFromUrl(`/api/purchase-orders/${po.id}/pdf`, `${po.poNo}.pdf`);
    } catch (e) {
      toast.error(`Không xuất được PDF: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const overdue =
    !!po.expectedEta &&
    (po.status === "SENT" || po.status === "PARTIAL") &&
    po.expectedEta < new Date().toISOString().slice(0, 10);

  const menuItems = [
    flags.canEdit && !flags.isDraft
      ? { key: "edit", label: "Sửa ngày dự kiến / ghi chú", icon: Edit3, onSelect: onEdit }
      : null,
    flags.canClose
      ? { key: "close", label: "Đóng PO", icon: CheckCircle2, onSelect: () => void handleTransition("close") }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; icon: React.ElementType; onSelect: () => void }>;

  return (
    <header
      style={{ top }}
      className="sticky z-sticky -mx-4 -mt-4 mb-4 border-b border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-white/85 md:-mx-6 md:-mt-5 md:px-6 dark:border-zinc-800 dark:bg-zinc-900/95 dark:supports-[backdrop-filter]:bg-zinc-900/85"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            href="/sales?tab=po"
            aria-label="Về danh sách đơn đặt hàng"
            title="Đơn đặt hàng"
            className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md pr-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Đơn đặt hàng</span>
          </Link>
          <span className="hidden text-zinc-300 sm:inline dark:text-zinc-700" aria-hidden>
            /
          </span>
          <h1 className="shrink-0 font-mono text-base font-semibold text-zinc-900 md:text-lg dark:text-zinc-50">
            {po.poNo}
          </h1>
          <StatusPill domain="po" code={po.status} dot />
          <StatusPill
            tone={po.poType === "SUBCONTRACT" ? "info" : "neutral"}
            label={po.poType === "SUBCONTRACT" ? "Gia công ngoài" : "Thương mại"}
            className="hidden sm:inline-flex"
          />
          {po.supplierName || po.supplierCode ? (
            <span
              className="hidden min-w-0 truncate text-sm text-zinc-600 md:inline dark:text-zinc-300"
              title={po.supplierName ?? po.supplierCode ?? undefined}
            >
              · {po.supplierName ?? po.supplierCode}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={onCancelEdit} disabled={saving}>
                Huỷ
              </Button>
              <Button size="sm" onClick={onSaveEdit} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Lưu thay đổi
              </Button>
            </>
          ) : (
            <>
              {flags.canEdit && flags.isDraft && (
                <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
                  <Edit3 className="h-3.5 w-3.5" /> Sửa
                </Button>
              )}
              {flags.canSubmitApproval && (
                <Button size="sm" onClick={handleSubmit} disabled={busy}>
                  {submit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                  Gửi duyệt
                </Button>
              )}
              {flags.canApprove && (
                <>
                  <Button variant="outline" size="sm" onClick={() => void handleReject()} disabled={busy}>
                    <XCircle className="h-3.5 w-3.5" /> Từ chối
                  </Button>
                  <Button size="sm" onClick={handleApprove} disabled={busy}>
                    {approve.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Duyệt
                  </Button>
                </>
              )}
              {flags.canMarkSent && (
                <Button size="sm" onClick={() => void handleSend()} disabled={busy}>
                  {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Gửi NCC
                </Button>
              )}
              {flags.canReceive && (
                <Button size="sm" onClick={onReceive}>
                  <Truck className="h-3.5 w-3.5" /> Nhận hàng
                </Button>
              )}
              {showCreateInvoice && (
                <Button variant="outline" size="sm" onClick={onInvoice}>
                  <FileText className="h-3.5 w-3.5" /> Tạo HĐ mua
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleExportPdf()}
                disabled={exporting}
                title="Xuất Đơn đặt hàng ra PDF để in / lưu hồ sơ"
                aria-label="Xuất PDF"
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Xuất PDF</span>
              </Button>
              {(menuItems.length > 0 || flags.canCancel) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon-sm" aria-label="Thao tác khác" title="Thao tác khác">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[13rem]">
                    {menuItems.map((m) => (
                      <DropdownMenuItem key={m.key} onSelect={m.onSelect}>
                        <m.icon className="h-4 w-4" aria-hidden />
                        {m.label}
                      </DropdownMenuItem>
                    ))}
                    {menuItems.length > 0 && flags.canCancel && <DropdownMenuSeparator />}
                    {flags.canCancel && (
                      <DropdownMenuItem variant="danger" onSelect={() => void handleTransition("cancel")}>
                        <XCircle className="h-4 w-4" aria-hidden />
                        Huỷ PO
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dải tóm tắt — thay 4 thẻ KPI lớn. */}
      <dl className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-baseline gap-1">
          <dt>Tổng cộng</dt>
          <dd className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {formatMoney(totals.total)}
          </dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">Số dòng</dt>
          <dd>{po.lines.length} dòng</dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt>Đã nhận</dt>
          <dd
            className={cn(
              "tabular-nums",
              totals.pct >= 100
                ? "text-emerald-700 dark:text-emerald-400"
                : totals.pct > 0
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-zinc-700 dark:text-zinc-300",
            )}
          >
            {formatQty(totals.received)}/{formatQty(totals.ordered)} ({totals.pct}%)
          </dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt>Dự kiến</dt>
          <dd
            className={cn(
              "tabular-nums",
              overdue ? "font-medium text-red-700 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300",
            )}
            title={overdue ? "Đã quá ngày dự kiến giao" : undefined}
          >
            {po.expectedEta ? formatDate(po.expectedEta, "dd/MM/yyyy") : "—"}
            {overdue ? " · quá hạn" : ""}
          </dd>
        </div>
        {po.supplierName || po.supplierCode ? (
          <div className="flex min-w-0 items-baseline gap-1 md:hidden">
            <dt>NCC</dt>
            <dd className="truncate text-zinc-700 dark:text-zinc-300">{po.supplierName ?? po.supplierCode}</dd>
          </div>
        ) : null}
      </dl>
    </header>
  );
}
