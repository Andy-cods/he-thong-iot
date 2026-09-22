"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Banknote, Landmark, Pencil, Plus, Wallet2 } from "lucide-react";
import { can, finAccountCreateSchema, type FinAccountCreate } from "@iot/shared";
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

/** Tab "Tài khoản" — danh sách tài khoản ngân hàng/tiền mặt + số dư hiện tại. */

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
  const deactivateMut = useDeactivateFinAccount();

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50/30 dark:bg-zinc-950/30">
      <header className="flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Trang chủ", href: "/" },
              { label: "Tài chính" },
              { label: "Tài khoản" },
            ]}
          />
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Tài khoản giao dịch
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Tổng số dư:{" "}
            <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-50">
              {fmtVND(totalBalance)}
            </span>{" "}
            trên {rows.length} tài khoản đang hoạt động
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
            Thêm tài khoản
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
            title="Chưa có tài khoản nào"
            description="Thêm tài khoản ngân hàng hoặc tiền mặt để bắt đầu ghi nhận giao dịch."
            actions={
              canWrite ? (
                <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                  Thêm tài khoản
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <AccountCard
                key={r.id}
                row={r}
                canWrite={canWrite}
                canDelete={canDelete}
                onEdit={() => {
                  setEditing(r);
                  setDialogOpen(true);
                }}
                onDeactivate={() => void deactivateMut.mutateAsync(r.id)}
              />
            ))}
          </div>
        )}
      </div>

      <AccountFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
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
  const Icon = row.type === "BANK" ? Landmark : Wallet2;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              row.type === "BANK"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400"
                : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
            )}
          >
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{row.name}</p>
            <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{row.code}</p>
          </div>
        </div>
        {canWrite && (
          <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label={`Sửa ${row.name}`}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>

      <p className="mt-4 font-mono text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
        {fmtVND(row.currentBalance)}
      </p>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">Số dư hiện tại</p>

      {(row.bankName || row.accountNumber) && (
        <div className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {row.bankName && <p>{row.bankName}</p>}
          {row.accountNumber && <p className="font-mono">{row.accountNumber}</p>}
        </div>
      )}

      {canDelete && (
        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <Button size="sm" variant="ghost" onClick={onDeactivate} className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40">
            Ẩn tài khoản
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-4 w-4" aria-hidden="true" />
            {isEdit ? "Sửa tài khoản" : "Thêm tài khoản"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3" noValidate>
          {!isEdit && (
            <div>
              <Label htmlFor="acc-code" required>Mã tài khoản</Label>
              <Input id="acc-code" {...register("code")} error={!!errors.code} placeholder="VD: TK-VCB" className="mt-1 font-mono" />
              {errors.code && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.code.message}</p>}
            </div>
          )}
          <div>
            <Label htmlFor="acc-name" required>Tên tài khoản</Label>
            <Input id="acc-name" {...register("name")} error={!!errors.name} placeholder="VD: Vietcombank chính" className="mt-1" />
            {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="acc-type" required>Loại tài khoản</Label>
            <select
              id="acc-type"
              {...register("type")}
              className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="BANK">Ngân hàng</option>
              <option value="CASH">Tiền mặt</option>
            </select>
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
