"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, KeyRound, MoreHorizontal, UserX } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { DialogConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResetPasswordDialog } from "@/components/admin/ResetPasswordDialog";
import { UserForm, type UserFormState } from "@/components/admin/UserForm";
import {
  useAuditList,
  useDeactivateUser,
  useUpdateUser,
  useUserDetail,
} from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-purple-50 text-purple-700 border-purple-200",
  planner: "bg-blue-50 text-blue-700 border-blue-200",
  warehouse: "bg-amber-50 text-amber-700 border-amber-200",
  operator: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPDATE: "bg-blue-50 text-blue-700 border-blue-200",
  DELETE: "bg-red-50 text-red-700 border-red-200",
  LOGIN: "bg-zinc-100 text-zinc-600 border-zinc-200",
  LOGOUT: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminUserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const query = useUserDetail(params.id);
  const update = useUpdateUser(params.id);
  const deactivate = useDeactivateUser();

  const auditQuery = useAuditList({
    userId: params.id,
    page: 1,
    pageSize: 30,
  });

  const [form, setForm] = React.useState<UserFormState | null>(null);
  const [deactivateOpen, setDeactivateOpen] = React.useState(false);
  const [resetPwOpen, setResetPwOpen] = React.useState(false);

  React.useEffect(() => {
    if (query.data?.data && !form) {
      setForm({
        username: query.data.data.username,
        fullName: query.data.data.fullName,
        email: query.data.data.email ?? "",
        roles: query.data.data.roles,
        isActive: query.data.data.isActive,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data?.data?.id]);

  if (query.isLoading || !form) {
    return (
      <div className="p-6 text-center text-sm text-zinc-500">
        Đang tải thông tin user…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600">Không tải được user.</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/admin/users")}
          className="mt-2"
        >
          ← Về danh sách
        </Button>
      </div>
    );
  }

  const user = query.data.data;

  const dirty =
    form.fullName !== user.fullName ||
    form.email !== (user.email ?? "") ||
    form.isActive !== user.isActive ||
    JSON.stringify([...form.roles].sort()) !==
      JSON.stringify([...user.roles].sort());

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        fullName: form.fullName.trim(),
        email: form.email.trim() || null,
        isActive: form.isActive,
        roles: form.roles,
      });
      toast.success("Đã lưu thay đổi.");
    } catch (err) {
      const e = err as { message?: string };
      toast.error(e.message ?? "Lưu thất bại");
    }
  };

  const handleDeactivate = async () => {
    try {
      await deactivate.mutateAsync(user.id);
      toast.success(`Đã vô hiệu hoá ${user.username}.`);
      setDeactivateOpen(false);
      router.push("/admin/users");
    } catch (err) {
      const e = err as { message?: string };
      toast.error(e.message ?? "Vô hiệu hoá thất bại");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-zinc-500"
      >
        <Link href="/" className="hover:text-zinc-900">
          Tổng quan
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <Link href="/admin" className="hover:text-zinc-900">
          Quản trị
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <Link href="/admin/users" className="hover:text-zinc-900">
          Người dùng
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="truncate font-mono text-zinc-900">{user.username}</span>
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-lg font-semibold text-zinc-900">
              {user.username}
            </code>
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-sm border px-1.5 text-[10px] font-semibold uppercase",
                user.isActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-zinc-200 bg-zinc-100 text-zinc-500",
              )}
            >
              {user.isActive ? "Active" : "Disabled"}
            </span>
            {user.roles.map((r) => (
              <span
                key={r}
                className={cn(
                  "inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-[10px] font-semibold uppercase",
                  ROLE_COLORS[r],
                )}
              >
                {r}
              </span>
            ))}
          </div>
          <p className="mt-1 text-sm text-zinc-700">{user.fullName}</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="Thao tác">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="danger"
              onSelect={() => setResetPwOpen(true)}
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              Reset mật khẩu
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="danger"
              disabled={!user.isActive}
              onSelect={() => setDeactivateOpen(true)}
            >
              <UserX className="h-3.5 w-3.5" aria-hidden="true" />
              Vô hiệu hoá
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="audit">
            Nhật ký hoạt động ({auditQuery.data?.meta.total ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="max-w-3xl rounded-md border border-zinc-200 bg-white p-6">
            <UserForm
              mode="edit"
              value={form}
              onChange={(p) => setForm((prev) => (prev ? { ...prev, ...p } : prev))}
              disabled={update.isPending}
            />

            <section className="mt-6 border-t border-zinc-200 pt-4">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((prev) =>
                      prev ? { ...prev, isActive: e.target.checked } : prev,
                    )
                  }
                  disabled={update.isPending}
                  className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-zinc-900">
                    Tài khoản đang hoạt động
                  </span>
                  <p className="text-xs text-zinc-500">
                    Bỏ tick sẽ chặn user đăng nhập — tương đương \"Vô hiệu hoá\".
                  </p>
                </div>
              </label>
            </section>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-zinc-200 pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/admin/users")}
                disabled={update.isPending}
              >
                Huỷ
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={!dirty || update.isPending}
              >
                {update.isPending ? "Đang lưu…" : "Lưu thay đổi"}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="audit">
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            {auditQuery.isLoading ? (
              <div className="p-6 text-center text-sm text-zinc-500">
                Đang tải…
              </div>
            ) : (auditQuery.data?.data ?? []).length === 0 ? (
              <div className="p-6 text-center text-sm text-zinc-500">
                Chưa có hoạt động nào được ghi lại.
              </div>
            ) : (
              <ul>
                {auditQuery.data!.data.map((ev) => (
                  <li
                    key={ev.id}
                    className="grid min-h-[36px] grid-cols-[170px,90px,1fr,1fr] items-center gap-3 border-t border-zinc-100 px-4 py-1.5 text-xs first:border-t-0"
                  >
                    <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                      {fmtTime(ev.occurredAt)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-5 items-center justify-center rounded-sm border px-1.5 font-mono text-[10px] font-semibold uppercase",
                        ACTION_COLORS[ev.action] ?? ACTION_COLORS.UPDATE,
                      )}
                    >
                      {ev.action}
                    </span>
                    <span className="truncate text-zinc-700">
                      {ev.objectType}
                      {ev.objectId ? (
                        <code className="ml-1 font-mono text-[10px] text-zinc-400">
                          #{ev.objectId.slice(0, 8)}
                        </code>
                      ) : null}
                    </span>
                    <span className="truncate text-zinc-500">
                      {ev.notes ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <DialogConfirm
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title={`Vô hiệu hoá ${user.username}?`}
        description={`User sẽ không thể đăng nhập. Bạn có thể kích hoạt lại sau bằng cách bật switch "Tài khoản đang hoạt động". Gõ "XOA" để xác nhận.`}
        confirmText="XOA"
        actionLabel="Vô hiệu hoá"
        loading={deactivate.isPending}
        onConfirm={() => void handleDeactivate()}
      />

      <ResetPasswordDialog
        open={resetPwOpen}
        onOpenChange={setResetPwOpen}
        userId={user.id}
        username={user.username}
      />
    </div>
  );
}
