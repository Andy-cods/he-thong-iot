"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Banknote, Landmark, Pencil, Plus, ShoppingCart, Wallet2 } from "lucide-react";
import {
  can,
  FIN_ACCOUNT_TYPE_LABELS,
  FIN_ACCOUNT_TYPES,
  finAccountCreateSchema,
  type FinAccountCreate,
  type FinAccountType,
} from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { groupAccountsByType } from "@/components/finance/AccountSourceSelect";
import { ConfirmActionDialog } from "@/components/finance/ConfirmActionDialog";
import { fmtVND } from "@/components/finance/_format";
import {
  useCreateFinAccount,
  useDeactivateFinAccount,
  useFinAccountsList,
  useUpdateFinAccount,
  type FinAccountRow,
} from "@/hooks/useFinance";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

/**
 * Tab "Tài khoản" — danh sách NGUỒN TIỀN + số dư hiện tại.
 * V4.1 Đợt 3 (Q7): thêm loại "TK chi tiêu" (EXPENSE), nhóm theo loại (Quỹ tiền
 * mặt / Ngân hàng / TK chi tiêu), tiền đủ số, xác nhận trước khi ẩn nguồn.
 */

const TYPE_ICON: Record<FinAccountType, typeof Landmark> = {
  BANK: Landmark,
  CASH: Wallet2,
  EXPENSE: ShoppingCart,
};
const TYPE_TONE: Record<FinAccountType, string> = {
  BANK: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
  CASH: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  EXPENSE: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function AccountsTab() {
  const { data: session } = useSession();
  const roles = session?.roles ?? [];
  const canWrite = can(roles, "create", "finance");
  const canDelete = can(roles, "delete", "finance");

  const query = useFinAccountsList({ isActive: true });
  const rows = query.data?.data ?? [];
  const totalBalance = rows.reduce((s, r) => s + Number(r.currentBalance), 0);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FinAccountRow | null>(null);
  const [hideTarget, setHideTarget] = React.useState<FinAccountRow | null>(null);
  const deactivateMut = useDeactivateFinAccount();
  const groups = groupAccountsByType(rows);

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50/30 dark:bg-zinc-950/30">
      <header className="flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Trang chủ", href: "/" },
              { label: "Bộ phận Thu mua", href: "/sales" },
              { label: "Tài chính: Tài khoản" },
            ]}
          />
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Nguồn tiền (tài khoản)
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Tổng số dư:{" "}
            <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {fmtVND(totalBalance)}
            </span>{" "}
            trên {rows.length} nguồn đang hoạt động. Phiếu thu cộng vào nguồn thu, phiếu chi
            trừ nguồn chi; chuyển quỹ nội bộ ở tab Thu chi.
          </p>
        </div>
        {canWrite && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm nguồn
          </Button>
        )}
      </header>

      <div className="flex-1 p-4 md:p-6">
        {query.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            preset="no-data"
            title="Chưa có nguồn tiền nào"
            description="Thêm quỹ tiền mặt, tài khoản ngân hàng hoặc tài khoản chi tiêu để bắt đầu ghi thu chi."
            actions={
              canWrite ? (
                <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                  Thêm nguồn
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.type}>
                <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  <span>{g.label}</span>
                  <span className="font-mono text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                    {fmtVND(g.accounts.reduce((s, a) => s + Number(a.currentBalance), 0))}
                  </span>
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {g.accounts.map((r) => (
                    <AccountCard
                      key={r.id}
                      row={r}
                      canWrite={canWrite}
                      canDelete={canDelete}
                      onEdit={() => {
                        setEditing(r);
                        setDialogOpen(true);
                      }}
                      onDeactivate={() => setHideTarget(r)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <AccountFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <ConfirmActionDialog
        open={!!hideTarget}
        onOpenChange={(open) => { if (!open) setHideTarget(null); }}
        title="Ẩn nguồn tiền?"
        description={
          hideTarget
            ? `Ẩn "${hideTarget.name}" (số dư ${fmtVND(hideTarget.currentBalance)}). Nguồn đã ẩn không chọn được khi ghi thu/chi/nhập Excel; giao dịch cũ vẫn giữ nguyên.`
            : ""
        }
        confirmLabel="Ẩn nguồn"
        loading={deactivateMut.isPending}
        onConfirm={async () => {
          if (!hideTarget) return;
          try {
            await deactivateMut.mutateAsync(hideTarget.id);
            setHideTarget(null);
          } catch {
            /* toast lỗi đã hiện ở hook */
          }
        }}
      />
    </div>
  );
}

function AccountCard({
  row,
  canWrite,
  canDelete,
  onEdit,
  onDeactivate,
}: {
  row: FinAccountRow;
  canWrite: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const Icon = TYPE_ICON[row.type] ?? Wallet2;
  const negative = Number(row.currentBalance) < 0;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", TYPE_TONE[row.type])}>
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{row.name}</p>
            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {row.code} · {FIN_ACCOUNT_TYPE_LABELS[row.type] ?? row.type}
            </p>
          </div>
        </div>
        {canWrite && (
          <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label={`Sửa ${row.name}`}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>

      <p
        className={cn(
          "mt-4 font-mono text-xl font-bold tabular-nums",
          negative ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-50",
        )}
      >
        {fmtVND(row.currentBalance)}
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Số dư hiện tại{negative && " — đang âm, cần kiểm tra"}
      </p>

      {(row.bankName || row.accountNumber) && (
        <div className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {row.bankName && <p>{row.bankName}</p>}
          {row.accountNumber && <p className="font-mono">{row.accountNumber}</p>}
        </div>
      )}

      {canDelete && (
        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <Button size="sm" variant="ghost" onClick={onDeactivate} className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40">
            Ẩn nguồn
          </Button>
        </div>
      )}
    </div>
  );
}

function AccountFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: FinAccountRow | null;
}) {
  const isEdit = !!editing;
  const createMut = useCreateFinAccount();
  const updateMut = useUpdateFinAccount(editing?.id ?? "__none__");
  const submitting = createMut.isPending || updateMut.isPending;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FinAccountCreate>({
    resolver: zodResolver(finAccountCreateSchema),
    defaultValues: {
      code: editing?.code ?? "",
      name: editing?.name ?? "",
      type: editing?.type ?? "BANK",
      bankName: editing?.bankName ?? null,
      accountNumber: editing?.accountNumber ?? null,
      openingBalance: editing ? Number(editing.openingBalance) : 0,
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        code: editing?.code ?? "",
        name: editing?.name ?? "",
        type: editing?.type ?? "BANK",
        bankName: editing?.bankName ?? null,
        accountNumber: editing?.accountNumber ?? null,
        openingBalance: editing ? Number(editing.openingBalance) : 0,
      });
    }
  }, [open, editing, reset]);

  const type = watch("type");

  const onSubmit = async (data: FinAccountCreate) => {
    try {
      if (isEdit && editing) {
        await updateMut.mutateAsync({
          name: data.name,
          type: data.type,
          bankName: data.bankName,
          accountNumber: data.accountNumber,
        });
      } else {
        await createMut.mutateAsync(data);
      }
      onOpenChange(false);
    } catch {
      /* toast lỗi (VD trùng mã) đã hiện ở hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-4 w-4" aria-hidden="true" />
            {isEdit ? "Sửa nguồn tiền" : "Thêm nguồn tiền"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3" noValidate>
          {!isEdit && (
            <div>
              <Label htmlFor="acc-code" required>Mã nguồn</Label>
              <Input id="acc-code" {...register("code")} error={!!errors.code} placeholder="VD: TM-01, TK-VCB, CT-XUONG" className="mt-1 font-mono" />
              {errors.code && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.code.message}</p>}
            </div>
          )}
          <div>
            <Label htmlFor="acc-name" required>Tên nguồn</Label>
            <Input id="acc-name" {...register("name")} error={!!errors.name} placeholder="VD: Quỹ tiền mặt, Vietcombank chính, TK chi tiêu xưởng" className="mt-1" />
            {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="acc-type" required>Loại nguồn</Label>
            <select
              id="acc-type"
              {...register("type")}
              className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {FIN_ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>{FIN_ACCOUNT_TYPE_LABELS[t]}</option>
              ))}
            </select>
            {type === "EXPENSE" && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Tài khoản chi tiêu: nguồn chuyên để chi hằng ngày — nạp tiền vào bằng &quot;Chuyển quỹ&quot; ở tab Thu chi.
              </p>
            )}
          </div>
          {type === "BANK" && (
            <>
              <div>
                <Label htmlFor="acc-bank">Tên ngân hàng</Label>
                <Input id="acc-bank" {...register("bankName")} placeholder="Vietcombank" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="acc-number">Số tài khoản</Label>
                <Input id="acc-number" {...register("accountNumber")} placeholder="0123456789" className="mt-1 font-mono" />
              </div>
            </>
          )}
          {!isEdit && (
            <div>
              <Label htmlFor="acc-opening">Số dư ban đầu</Label>
              <Input
                id="acc-opening"
                type="number"
                step="1000"
                {...register("openingBalance")}
                className="mt-1 font-mono tabular-nums"
                placeholder="0"
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Đang lưu…" : "Lưu"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
