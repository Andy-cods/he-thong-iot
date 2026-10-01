"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Banknote, EyeOff, Landmark, Pencil, Plus, Scale, ShoppingCart, Wallet2 } from "lucide-react";
import {
  can,
  FIN_ACCOUNT_TYPE_LABELS,
  FIN_ACCOUNT_TYPES,
  finAccountAdjustBalanceSchema,
  finAccountCreateSchema,
  type FinAccountAdjustBalance,
  type FinAccountCreate,
  type FinAccountType,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetHeaderNav,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryError } from "@/components/ui/query-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { groupAccountsByType } from "@/components/finance/AccountSourceSelect";
import { ConfirmActionDialog } from "@/components/finance/ConfirmActionDialog";
import { fmtVND } from "@/components/finance/_format";
import {
  useAdjustFinAccountBalance,
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
  // V4.5 — "Điều chỉnh số dư" CHỈ admin (Giám đốc), không phải mọi người có
  // quyền sửa nguồn tiền (kế toán có create:finance nhưng KHÔNG sửa opening).
  const isAdmin = roles.includes("admin");

  const query = useFinAccountsList({ isActive: true });
  const rows = query.data?.data ?? [];
  const totalBalance = rows.reduce((s, r) => s + Number(r.currentBalance), 0);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FinAccountRow | null>(null);
  const [hideTarget, setHideTarget] = React.useState<FinAccountRow | null>(null);
  const [adjustTarget, setAdjustTarget] = React.useState<FinAccountRow | null>(null);
  const deactivateMut = useDeactivateFinAccount();
  const groups = groupAccountsByType(rows);

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50/30 dark:bg-zinc-950/30">
      <header className="flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          {/* V4.1 UI-09 (X6): bỏ breadcrumb thân trang — topbar đã hiện cùng đường dẫn (+ nhãn tab). */}
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Nguồn tiền (tài khoản)
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Tổng số dư:{" "}
            <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {query.isError && rows.length === 0 ? "—" : fmtVND(totalBalance)}
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
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : query.isError && rows.length === 0 ? (
          // V4.1 UI-05: lỗi API không được hiện "Chưa có nguồn tiền nào".
          <QueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Không tải được danh sách nguồn tiền"
          />
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
                  <span className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
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
                      isAdmin={isAdmin}
                      onEdit={() => {
                        setEditing(r);
                        setDialogOpen(true);
                      }}
                      onDeactivate={() => setHideTarget(r)}
                      onAdjustBalance={() => setAdjustTarget(r)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <AccountFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <AdjustBalanceSheet
        open={!!adjustTarget}
        onOpenChange={(open) => { if (!open) setAdjustTarget(null); }}
        account={adjustTarget}
        onDone={() => setAdjustTarget(null)}
      />
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
  isAdmin,
  onEdit,
  onDeactivate,
  onAdjustBalance,
}: {
  row: FinAccountRow;
  canWrite: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onAdjustBalance: () => void;
}) {
  const Icon = TYPE_ICON[row.type] ?? Wallet2;
  const negative = Number(row.currentBalance) < 0;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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
          // Hit-area lớn hơn (icon-sm mặc định 32px → 36px) + nền hover rõ hơn
          // để bấm chính xác trên tablet (§1.10).
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onEdit}
            aria-label={`Sửa ${row.name}`}
            className="h-9 w-9 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <p
        className={cn(
          "mt-4 text-xl font-bold tabular-nums",
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

      {(canDelete || isAdmin) && (
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          {/* V4.5 — CHỈ admin (Giám đốc): sửa số dư đúng thực tế, không qua
              giao dịch thu/chi (không làm sai báo cáo). */}
          {isAdmin && (
            <Button size="sm" variant="ghost" onClick={onAdjustBalance} className="gap-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
              <Scale className="h-3.5 w-3.5" aria-hidden="true" />
              Điều chỉnh số dư
            </Button>
          )}
          {canDelete && (
            // "Ẩn" khác "Xoá" — không dùng màu đỏ cảnh báo (dành cho destructive
            // thật sự), đổi sang trung tính + icon mắt gạch chéo (§1.10).
            <Button size="sm" variant="ghost" onClick={onDeactivate} className="gap-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              Ẩn nguồn
            </Button>
          )}
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

  const formId = "acc-form";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="md" className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Banknote className="h-4 w-4" aria-hidden="true" />
            {isEdit ? "Sửa nguồn tiền" : "Thêm nguồn tiền"}
          </SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form id={formId} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3" noValidate>
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
                className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-[16px] text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 sm:text-md"
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
                  className="mt-1 tabular-nums"
                  placeholder="0"
                />
              </div>
            )}
          </form>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button type="submit" form={formId} disabled={submitting}>{submitting ? "Đang lưu…" : "Lưu"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * V4.5 — "Điều chỉnh số dư" (chỉ admin). Sheet chuẩn Apple (SheetHeaderNav):
 * nhập số dư ĐÚNG hiện tại/đầu kỳ mới (không phải chênh lệch) + lý do bắt
 * buộc ≥3 ký tự. Hiện rõ số dư hiện tại → số mới + chênh lệch trước khi gửi.
 * KHÔNG tạo giao dịch thu/chi — server tự dịch `opening_balance`
 * (xem `computeOpeningBalanceForTarget`, lib/finance.ts).
 */
function AdjustBalanceSheet({
  open,
  onOpenChange,
  account,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: FinAccountRow | null;
  onDone: () => void;
}) {
  const adjustMut = useAdjustFinAccountBalance(account?.id ?? "__none__");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FinAccountAdjustBalance>({
    resolver: zodResolver(finAccountAdjustBalanceSchema),
    defaultValues: { newBalance: 0, reason: "" },
  });

  React.useEffect(() => {
    if (open && account) {
      reset({ newBalance: Number(account.currentBalance), reason: "" });
    }
  }, [open, account, reset]);

  const newBalance = Number(watch("newBalance")) || 0;
  const currentBalance = account ? Number(account.currentBalance) : 0;
  const delta = newBalance - currentBalance;

  const onSubmit = async (data: FinAccountAdjustBalance) => {
    if (!account) return;
    try {
      await adjustMut.mutateAsync(data);
      onDone();
    } catch {
      /* toast lỗi đã hiện ở hook */
    }
  };

  const formId = "acc-adjust-balance-form";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="sm" hideCloseButton className="flex flex-col">
        <SheetHeaderNav
          title={
            <span className="inline-flex items-center gap-2">
              <Scale className="h-4 w-4" aria-hidden="true" />
              Điều chỉnh số dư
            </span>
          }
          onCancel={() => onOpenChange(false)}
          action={{
            label: adjustMut.isPending ? "Đang lưu…" : "Điều chỉnh số dư",
            type: "submit",
            form: formId,
            disabled: adjustMut.isPending,
          }}
        />
        <SheetBody>
          {account && (
            <form id={formId} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
              <div className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800/50">
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">{account.name}</p>
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{account.code}</p>
              </div>

              <div>
                <Label>Số dư hiện tại</Label>
                <p className="mt-1 text-right font-mono text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {fmtVND(currentBalance)}
                </p>
              </div>

              <div>
                <Label htmlFor="adj-new-balance" required>Số dư đúng (mới)</Label>
                <Input
                  id="adj-new-balance"
                  type="number"
                  step="1000"
                  {...register("newBalance")}
                  error={!!errors.newBalance}
                  className="mt-1 text-right tabular-nums"
                  placeholder="0"
                />
                {errors.newBalance && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.newBalance.message}</p>
                )}
              </div>

              <div
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                  delta === 0
                    ? "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                    : delta > 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400"
                      : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400",
                )}
              >
                <span>Chênh lệch</span>
                <span className="font-mono font-semibold tabular-nums">
                  {delta === 0 ? "0 ₫" : `${delta > 0 ? "+" : "−"}${fmtVND(Math.abs(delta))}`}
                </span>
              </div>

              <div>
                <Label htmlFor="adj-reason" required>Lý do điều chỉnh</Label>
                <Textarea
                  id="adj-reason"
                  {...register("reason")}
                  error={!!errors.reason}
                  rows={3}
                  placeholder="VD: Đối chiếu sổ quỹ cuối tháng 9, phát hiện thiếu 500.000đ chưa ghi nhận."
                  className="mt-1"
                />
                {errors.reason && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.reason.message}</p>
                )}
              </div>
            </form>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
