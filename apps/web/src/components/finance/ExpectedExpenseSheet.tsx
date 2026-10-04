"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, Plus, Trash2, Wallet, X } from "lucide-react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeaderNav,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { SupplierPicker, type SupplierPickerValue } from "@/components/procurement/SupplierPicker";
import { AccountSourceSelect, selectClassName } from "@/components/finance/AccountSourceSelect";
import { fmtVND, todayInputValue } from "@/components/finance/_format";
import {
  useCreateFinTransaction,
  useCreatePlannedExpense,
  useDeletePlannedExpense,
  useExpectedExpenseDetail,
  useFinAccountsList,
  useFinCategoriesList,
  useUpdatePlannedExpense,
  type FinPlannedExpenseRow,
  type PayableDueBucket,
} from "@/hooks/useFinance";
import { PAYABLE_DUE_BUCKET_LABELS, PAYABLE_DUE_BUCKETS } from "@/lib/finance-overview-policy";
import { cn } from "@/lib/utils";

/**
 * TASK-20261001 (việc 3) — Sheet chi tiết ô "Dự trù chi" ở Tổng quan Tài
 * chính: (a) bảng công nợ phải trả theo NCC × mốc hạn, (b) danh sách PO chưa
 * có hoá đơn, (c) danh sách khoản chi dự kiến (CRUD, đánh dấu "Đã chi" mở
 * sẵn form phiếu chi điền trước số tiền/danh mục).
 */
export function ExpectedExpenseSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const detailQuery = useExpectedExpenseDetail(open);
  const detail = detailQuery.data?.data;

  const [createOpen, setCreateOpen] = React.useState(false);
  const [markDoneItem, setMarkDoneItem] = React.useState<FinPlannedExpenseRow | null>(null);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" size="lg" hideCloseButton className="flex flex-col md:w-[880px] md:max-w-[95vw]">
          <SheetHeaderNav
            title={
              <span className="inline-flex items-center gap-2">
                <Wallet className="h-4 w-4" aria-hidden="true" />
                Chi tiết Dự trù chi
              </span>
            }
            onCancel={() => onOpenChange(false)}
          />
          <SheetBody>
            {detailQuery.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-40 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
              </div>
            ) : !detail ? (
              <EmptyState preset="no-data" title="Không tải được dữ liệu" />
            ) : (
              <div className="space-y-6">
                <PayableBucketTable summary={detail.payableBySupplierBucket} />
                <OpenPoSection pos={detail.openPos} />
                <PlannedExpenseSection
                  rows={detail.plannedExpenses}
                  onAdd={() => setCreateOpen(true)}
                  onMarkDone={(row) => setMarkDoneItem(row)}
                />
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <CreatePlannedExpenseDialog open={createOpen} onOpenChange={setCreateOpen} />
      <MarkDonePaymentDialog item={markDoneItem} onOpenChange={(v) => !v && setMarkDoneItem(null)} />
    </>
  );
}

/** (a) Bảng công nợ phải trả theo NCC × mốc hạn — pivot. */
function PayableBucketTable({
  summary,
}: {
  summary: {
    totalBySupplier: Array<{ supplierId: string | null; supplierName: string; total: number }>;
    rows: Array<{ supplierId: string | null; bucket: PayableDueBucket; amount: number }>;
    totalByBucket: Record<PayableDueBucket, number>;
    grandTotal: number;
  };
}) {
  const amountFor = (supplierId: string | null, bucket: PayableDueBucket) =>
    summary.rows.find((r) => r.supplierId === supplierId && r.bucket === bucket)?.amount ?? 0;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Công nợ phải trả theo NCC × mốc hạn
      </h2>
      {summary.totalBySupplier.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Không có công nợ phải trả còn nợ.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Nhà cung cấp</th>
                {PAYABLE_DUE_BUCKETS.map((b) => (
                  <th key={b} className="px-3 py-2 text-right whitespace-nowrap font-medium tabular-nums">
                    {PAYABLE_DUE_BUCKET_LABELS[b]}
                  </th>
                ))}
                <th className="px-3 py-2 text-right whitespace-nowrap font-semibold">Tổng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {summary.totalBySupplier.map((s) => (
                <tr key={s.supplierId ?? s.supplierName}>
                  <td className="min-w-[200px] px-3 py-2 text-zinc-800 dark:text-zinc-200">{s.supplierName}</td>
                  {PAYABLE_DUE_BUCKETS.map((b) => {
                    const v = amountFor(s.supplierId, b);
                    return (
                      <td
                        key={b}
                        className={cn(
                          "px-3 py-2 text-right whitespace-nowrap tabular-nums",
                          v > 0 && b === "OVERDUE"
                            ? "font-semibold text-red-600 dark:text-red-400"
                            : "text-zinc-600 dark:text-zinc-300",
                        )}
                      >
                        {v > 0 ? fmtVND(v) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right whitespace-nowrap font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {fmtVND(s.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
              <tr>
                <td className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">Tổng</td>
                {PAYABLE_DUE_BUCKETS.map((b) => (
                  <td key={b} className="px-3 py-2 text-right whitespace-nowrap font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
                    {summary.totalByBucket[b] > 0 ? fmtVND(summary.totalByBucket[b]) : "—"}
                  </td>
                ))}
                <td className="px-3 py-2 text-right whitespace-nowrap font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {fmtVND(summary.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

/** (b) Danh sách PO chưa có hoá đơn. */
function OpenPoSection({
  pos,
}: {
  pos: Array<{ id: string; poNo: string; supplierName: string; totalAmount: number; expectedEta: string | null }>;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        PO đã gửi/đang nhận — chưa có hoá đơn ({pos.length})
      </h2>
      {pos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Không có PO nào.
        </p>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {pos.map((po) => (
            <div key={po.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-mono font-medium text-zinc-900 dark:text-zinc-50">{po.poNo}</p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{po.supplierName}</p>
              </div>
              <span className="shrink-0 tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                {fmtVND(po.totalAmount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** (c) Danh sách khoản chi dự kiến. */
function PlannedExpenseSection({
  rows,
  onAdd,
  onMarkDone,
}: {
  rows: FinPlannedExpenseRow[];
  onAdd: () => void;
  onMarkDone: (row: FinPlannedExpenseRow) => void;
}) {
  const updateMut = useUpdatePlannedExpense();
  const deleteMut = useDeletePlannedExpense();
  const confirm = useConfirm();

  const cancelRow = async (row: FinPlannedExpenseRow) => {
    try {
      await updateMut.mutateAsync({ id: row.id, payload: { status: "CANCELLED" } });
      toast.success("Đã huỷ khoản chi dự kiến");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi huỷ");
    }
  };

  const deleteRow = async (row: FinPlannedExpenseRow) => {
    const ok = await confirm({
      title: "Xoá khoản chi dự kiến?",
      description: `Xoá "${row.description}" — không hoàn tác được.`,
      confirmLabel: "Xoá",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(row.id);
      toast.success("Đã xoá");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi xoá");
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Khoản chi dự kiến ({rows.length})
        </h2>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          Thêm khoản chi dự kiến
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Chưa có khoản chi dự kiến nào.
        </p>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">{row.description}</p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  Hạn {fmtDateShort(row.dueDate)}
                  {row.supplierName ? ` · ${row.supplierName}` : ""}
                  {row.categoryName ? ` · ${row.categoryName}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                  {fmtVND(row.amount)}
                </span>
                {row.status === "OPEN" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => onMarkDone(row)}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Đã chi
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-zinc-500"
                      onClick={() => void cancelRow(row)}
                    >
                      Huỷ
                    </Button>
                  </>
                )}
                {row.status !== "OPEN" && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      row.status === "DONE"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                    )}
                  >
                    {row.status === "DONE" ? "Đã chi" : "Đã huỷ"}
                  </span>
                )}
                {row.status !== "DONE" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-zinc-400 hover:text-red-600"
                    onClick={() => void deleteRow(row)}
                    aria-label="Xoá"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function fmtDateShort(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Form "+ Thêm khoản chi dự kiến". */
function CreatePlannedExpenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createMut = useCreatePlannedExpense();
  const categoriesQuery = useFinCategoriesList({ direction: "OUT", isActive: true });
  const categories = categoriesQuery.data?.data ?? [];

  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [dueDate, setDueDate] = React.useState(todayInputValue());
  const [categoryId, setCategoryId] = React.useState("");
  const [supplier, setSupplier] = React.useState<SupplierPickerValue | null>(null);
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setDescription("");
    setAmount("");
    setDueDate(todayInputValue());
    setCategoryId("");
    setSupplier(null);
    setNotes("");
    setError(null);
  }, [open]);

  const onSubmit = async () => {
    if (!description.trim()) return setError("Nhập mô tả khoản chi.");
    if (!(Number(amount) > 0)) return setError("Nhập số tiền > 0.");
    if (!dueDate) return setError("Chọn ngày dự kiến.");
    setError(null);
    try {
      await createMut.mutateAsync({
        description: description.trim(),
        amount: Number(amount),
        dueDate,
        categoryId: categoryId || null,
        supplierId: supplier?.id ?? null,
        notes: notes.trim() || null,
      });
      toast.success("Đã thêm khoản chi dự kiến");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi thêm khoản chi");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Thêm khoản chi dự kiến</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label required>Mô tả</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="VD: Lương kỳ tới, thuê mặt bằng tháng 11…"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>Số tiền (₫)</Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-right tabular-nums"
                placeholder="0"
              />
            </div>
            <div>
              <Label required>Ngày dự kiến</Label>
              <DateField value={dueDate} onChange={setDueDate} />
            </div>
          </div>
          <div>
            <Label>Danh mục</Label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={selectClassName}
            >
              <option value="">— Không chọn —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Nhà cung cấp (tuỳ chọn)</Label>
            <SupplierPicker value={supplier} onChange={setSupplier} id="planned-expense-supplier" />
          </div>
          <div>
            <Label>Ghi chú</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={() => void onSubmit()} disabled={createMut.isPending}>
            {createMut.isPending ? "Đang lưu…" : "Thêm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Đánh dấu "Đã chi" — mở sẵn form phiếu chi điền trước số tiền/danh mục. */
function MarkDonePaymentDialog({
  item,
  onOpenChange,
}: {
  item: FinPlannedExpenseRow | null;
  onOpenChange: (v: boolean) => void;
}) {
  const open = !!item;
  const accountsQuery = useFinAccountsList({ isActive: true });
  const accounts = accountsQuery.data?.data ?? [];
  const createTxMut = useCreateFinTransaction();
  const updateMut = useUpdatePlannedExpense();

  const [accountId, setAccountId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [transactionDate, setTransactionDate] = React.useState(todayInputValue());
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!item) return;
    setAccountId("");
    setAmount(String(Number(item.amount) || 0));
    setTransactionDate(todayInputValue());
    setError(null);
  }, [item]);

  if (!item) return null;

  const busy = createTxMut.isPending || updateMut.isPending;

  const onSubmit = async () => {
    if (!accountId) return setError("Chọn nguồn chi.");
    if (!(Number(amount) > 0)) return setError("Nhập số tiền > 0.");
    setError(null);
    try {
      await createTxMut.mutateAsync({
        direction: "OUT",
        accountId,
        categoryId: item.categoryId ?? null,
        amount: Number(amount),
        transactionDate: transactionDate as unknown as Date,
        description: item.description,
        supplierId: item.supplierId ?? null,
        attachmentUrl: null,
        externalRef: null,
      });
      await updateMut.mutateAsync({ id: item.id, payload: { status: "DONE" } });
      toast.success("Đã tạo phiếu chi và đánh dấu Đã chi");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi tạo phiếu chi");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Tạo phiếu chi — {item.description}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label required>Nguồn chi</Label>
            <AccountSourceSelect
              accounts={accounts}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>Số tiền (₫)</Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-right tabular-nums"
              />
            </div>
            <div>
              <Label required>Ngày chi</Label>
              <DateField value={transactionDate} onChange={setTransactionDate} />
            </div>
          </div>
          {item.categoryName && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Danh mục: <span className="font-medium text-zinc-700 dark:text-zinc-300">{item.categoryName}</span>
            </p>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5" />
            Huỷ
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            {busy ? "Đang lưu…" : "Tạo phiếu chi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
