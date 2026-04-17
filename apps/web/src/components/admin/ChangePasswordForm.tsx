"use client";

import * as React from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChangePassword } from "@/hooks/useChangePassword";
import { cn } from "@/lib/utils";

interface RuleState {
  label: string;
  test: (v: string) => boolean;
}

const RULES: RuleState[] = [
  { label: "Tối thiểu 8 ký tự", test: (v) => v.length >= 8 },
  { label: "Ít nhất 1 chữ thường (a-z)", test: (v) => /[a-z]/.test(v) },
  {
    label: "Ít nhất 1 chữ hoa hoặc số (A-Z / 0-9)",
    test: (v) => /[A-Z]/.test(v) || /[0-9]/.test(v),
  },
];

export interface ChangePasswordFormProps {
  onSuccess?: () => void;
}

export function ChangePasswordForm({ onSuccess }: ChangePasswordFormProps) {
  const mutation = useChangePassword();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ruleChecks = RULES.map((r) => ({
    ...r,
    passed: r.test(newPassword),
  }));
  const allRulesPass = ruleChecks.every((r) => r.passed);
  const confirmMatch = confirmPassword === newPassword && confirmPassword !== "";
  const notSame = newPassword !== currentPassword && currentPassword !== "";
  const canSubmit =
    currentPassword.length > 0 &&
    allRulesPass &&
    confirmMatch &&
    notSame &&
    !mutation.isPending;

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (!canSubmit) return;
    try {
      await mutation.mutateAsync({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      toast.success("Đã đổi mật khẩu thành công. Hãy đăng nhập lại.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onSuccess?.();
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e.code === "CURRENT_PASSWORD_INVALID") {
        setError("Mật khẩu hiện tại không đúng.");
      } else {
        setError(e.message ?? "Đổi mật khẩu thất bại.");
      }
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="current-password" required uppercase>
          Mật khẩu hiện tại
        </Label>
        <div className="relative">
          <Input
            id="current-password"
            type={showCurrent ? "text" : "password"}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="pr-10"
            disabled={mutation.isPending}
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            aria-label={showCurrent ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          >
            {showCurrent ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-password" required uppercase>
          Mật khẩu mới
        </Label>
        <div className="relative">
          <Input
            id="new-password"
            type={showNew ? "text" : "password"}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="pr-10"
            disabled={mutation.isPending}
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            aria-label={showNew ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          >
            {showNew ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {newPassword.length > 0 ? (
          <ul className="space-y-0.5 pt-1">
            {ruleChecks.map((r) => (
              <li
                key={r.label}
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  r.passed ? "text-emerald-700" : "text-zinc-500",
                )}
              >
                {r.passed ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <X className="h-3 w-3" aria-hidden="true" />
                )}
                {r.label}
              </li>
            ))}
            {currentPassword.length > 0 && !notSame ? (
              <li className="flex items-center gap-1.5 text-xs text-red-600">
                <X className="h-3 w-3" aria-hidden="true" />
                Mật khẩu mới phải khác mật khẩu hiện tại
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm-password" required uppercase>
          Xác nhận mật khẩu mới
        </Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={mutation.isPending}
          aria-invalid={
            confirmPassword.length > 0 && !confirmMatch ? true : undefined
          }
        />
        {confirmPassword.length > 0 && !confirmMatch ? (
          <p className="text-xs text-red-600">
            Mật khẩu xác nhận không khớp.
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end border-t border-zinc-200 pt-4">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {mutation.isPending ? "Đang đổi…" : "Đổi mật khẩu"}
        </Button>
      </div>
    </form>
  );
}
