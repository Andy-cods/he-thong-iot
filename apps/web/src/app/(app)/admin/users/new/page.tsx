"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { USERNAME_REGEX } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { UserForm, type UserFormState } from "@/components/admin/UserForm";
import {
  TempPasswordDisplay,
  generateTempPassword,
} from "@/components/admin/TempPasswordDisplay";
import { useCreateUser } from "@/hooks/useAdmin";

export default function AdminUsersNewPage() {
  const router = useRouter();
  const createUser = useCreateUser();

  const [form, setForm] = React.useState<UserFormState>({
    username: "",
    fullName: "",
    email: "",
    roles: ["operator"],
    isActive: true,
  });

  const [password, setPassword] = React.useState<string>(() =>
    generateTempPassword(12),
  );
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof UserFormState, string>>
  >({});

  const regenerate = () => setPassword(generateTempPassword(12));

  const validate = (): boolean => {
    const e: Partial<Record<keyof UserFormState, string>> = {};
    if (!form.username) e.username = "Username bắt buộc";
    else if (!USERNAME_REGEX.test(form.username))
      e.username = "Chỉ a-z, 0-9, _.- (bắt đầu bằng chữ/số), tối thiểu 3 ký tự";

    if (!form.fullName.trim()) e.fullName = "Họ tên bắt buộc";
    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    )
      e.email = "Email không hợp lệ";
    if (form.roles.length === 0) e.roles = "Phải chọn ít nhất 1 vai trò";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    try {
      const res = await createUser.mutateAsync({
        username: form.username,
        fullName: form.fullName.trim(),
        email: form.email.trim() || undefined,
        password,
        roles: form.roles,
      });
      toast.success(
        `Tạo user ${res.data.username} thành công — mật khẩu tạm: ${password}`,
        { duration: 8000 },
      );
      router.push("/admin/users");
    } catch (err) {
      const e = err as { message?: string; code?: string };
      if (e.code === "USERNAME_DUPLICATE") {
        setErrors((prev) => ({ ...prev, username: e.message ?? "Trùng username" }));
      } else {
        toast.error(e.message ?? "Tạo user thất bại");
      }
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
        <span className="text-zinc-900">Tạo mới</span>
      </nav>

      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Tạo người dùng mới
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Mật khẩu tạm được sinh tự động — copy và gửi cho user để đổi lần đầu.
        </p>
      </header>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="max-w-3xl space-y-6 rounded-md border border-zinc-200 bg-white p-6"
      >
        <UserForm
          mode="create"
          value={form}
          onChange={(p) => setForm((prev) => ({ ...prev, ...p }))}
          errors={errors}
          disabled={createUser.isPending}
        />

        <section>
          <header className="mb-3">
            <h3 className="text-sm font-semibold text-zinc-900">Mật khẩu tạm</h3>
            <p className="text-xs text-zinc-500">
              12 ký tự random. User được yêu cầu đổi sau lần đăng nhập đầu tiên.
            </p>
          </header>
          <div className="flex items-center gap-2">
            <TempPasswordDisplay value={password} className="flex-1" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={regenerate}
              aria-label="Sinh lại mật khẩu"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </section>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-4">
          <Button asChild variant="ghost" size="sm" type="button">
            <Link href="/admin/users">Huỷ</Link>
          </Button>
          <Button type="submit" size="sm" disabled={createUser.isPending}>
            {createUser.isPending ? "Đang tạo…" : "Tạo user"}
          </Button>
        </div>
      </form>
    </div>
  );
}
