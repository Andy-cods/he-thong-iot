"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, MoreHorizontal, UserX } from "lucide-react";
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
import { UserPermissionMatrix } from "@/components/admin/UserPermissionMatrix";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import {
  useAuditList,
  useDeactivateUser,
  useUpdateUser,
  useUserDetail,
} from "@/hooks/useAdmin";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-violet-50 text-violet-700 ring-violet-200",
  planner: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  purchaser: "bg-rose-50 text-rose-700 ring-rose-200",
  warehouse: "bg-amber-50 text-amber-700 ring-amber-200",
  operator: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  qc: "bg-teal-50 text-teal-700 ring-teal-200",
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  UPDATE: "bg-sky-50 text-sky-700 ring-sky-200",
  DELETE: "bg-rose-50 text-rose-700 ring-rose-200",
  LOGIN: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  LOGOUT: "bg-zinc-100 text-zinc-600 ring-zinc-200",
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
  const session = useSession();
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
      <AdminPageShell
        breadcrumb={[
          { label: "Trang chủ", href: "/" },
          { label: "Quản trị", href: "/admin" },
          { label: "Người dùng", href: "/admin/users" },
          { label: "Đang tải…" },
        ]}
        title="Đang tải…"
      >
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500 shadow-sm">
          Đang tải thông tin user…
        </div>
      </AdminPageShell>
    );
  }

  if (query.isError || !query.data) {
    return (
      <AdminPageShell
        breadcrumb={[
          { label: "Trang chủ", href: "/" },
          { label: "Quản trị", href: "/admin" },
          { label: "Người dùng", href: "/admin/users" },
          { label: "Lỗi" },
        ]}
        title="Không tải được"
      >
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm text-rose-700">Không tải được thông tin user.</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/admin/users")}
            className="mt-3"
          >
            ← Về danh sách
          </Button>
        </div>
      </AdminPageShell>
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

  const initials = user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <AdminPageShell
      breadcrumb={[
        { label: "Trang chủ", href: "/" },
        { label: "Quản trị", href: "/admin" },
        { label: "Người dùng", href: "/admin/users" },
        { label: user.fullName },
      ]}
      title={user.fullName}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-xs text-zinc-700">
            {user.username}
          </code>
          <span
            className={cn(
              "inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold uppercase ring-1 ring-inset",
              user.isActive
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-zinc-100 text-zinc-500 ring-zinc-200",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                user.isActive ? "bg-emerald-500" : "bg-zinc-400",
              )}
              aria-hidden="true"
            />
            {user.isActive ? "Active" : "Disabled"}
          </span>
          {user.roles.map((r) => (
            <span
              key={r}
              className={cn(
                "inline-flex h-5 items-center rounded-full px-1.5 font-mono text-[10px] font-semibold uppercase ring-1 ring-inset",
                ROLE_BADGE[r],
              )}
            >
              {r}
            </span>
          ))}
        </span>
      }
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label="Thao tác">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              Hành động
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
      }
    >
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="permissions">Quyền</TabsTrigger>
          <TabsTrigger value="audit">
            Phiên &amp; Hoạt động ({auditQuery.data?.meta.total ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
            {/* Left: avatar card */}
            <aside className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-2xl font-semibold tracking-tight text-white shadow-sm">
                  {initials || user.username.slice(0, 2).toUpperCase()}
                </div>
                <p className="mt-3 text-sm font-semibold tracking-tight text-zinc-900">
                  {user.fullName}
                </p>
                <code className="mt-0.5 font-mono text-xs text-zinc-500">
                  {user.username}
                </code>
              </div>
              <dl className="mt-5 space-y-2 border-t border-zinc-100 pt-4 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Email</dt>
                  <dd className="truncate font-medium text-zinc-700">
                    {user.email ?? "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Vai trò</dt>
                  <dd className="font-medium text-zinc-700">
                    {user.roles.length} role
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Trạng thái</dt>
                  <dd
                    className={cn(
                      "font-semibold",
                      user.isActive ? "text-emerald-700" : "text-zinc-500",
                    )}
                  >
                    {user.isActive ? "Đang hoạt động" : "Vô hiệu hoá"}
                  </dd>
                </div>
              </dl>
            </aside>

            {/* Right: form */}
            <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <UserForm
                mode="edit"
                value={form}
                onChange={(p) =>
                  setForm((prev) => (prev ? { ...prev, ...p } : prev))
                }
                disabled={update.isPending}
              />

              <section className="mt-6 border-t border-zinc-200 pt-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev ? { ...prev, isActive: e.target.checked } : prev,
                      )
                    }
                    disabled={update.isPending}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-sm font-medium tracking-tight text-zinc-900">
                      Tài khoản đang hoạt động
                    </span>
                    <p className="text-xs text-zinc-500">
                      Bỏ tick sẽ chặn user đăng nhập — tương đương &quot;Vô hiệu
                      hoá&quot;.
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
          </div>
        </TabsContent>

        <TabsContent value="permissions">
          <UserPermissionMatrix
            userId={user.id}
            isSelf={session.data?.id === user.id}
            currentUserRoles={user.roles}
          />
        </TabsContent>

        <TabsContent value="audit">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            {auditQuery.isLoading ? (
              <div className="p-8 text-center text-sm text-zinc-500">
                Đang tải…
              </div>
            ) : (auditQuery.data?.data ?? []).length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500">
                Chưa có hoạt động nào được ghi lại.
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {auditQuery.data!.data.map((ev) => (
                  <li
                    key={ev.id}
                    className="grid min-h-[40px] grid-cols-[170px,90px,1fr,1fr] items-center gap-3 px-4 py-2 text-xs transition-colors hover:bg-zinc-50/70"
                  >
                    <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                      {fmtTime(ev.occurredAt)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-5 w-fit items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold uppercase ring-1 ring-inset",
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
    </AdminPageShell>
  );
}
