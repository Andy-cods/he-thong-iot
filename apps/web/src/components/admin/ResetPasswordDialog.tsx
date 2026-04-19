"use client";

/**
 * ResetPasswordDialog — admin flow:
 *   1. Bấm "Reset mật khẩu" → confirm dialog (explain hậu quả).
 *   2. Bấm "Xác nhận reset" → call API → nhận tempPassword.
 *   3. Hiển thị temp password (1 lần) với copy button + warning gửi user.
 *   4. Đóng dialog → temp password KHÔNG còn hiển thị lại được.
 */

import * as React from "react";
import { AlertTriangle, Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
}

interface ResetResult {
  tempPassword: string;
  revokedSessions: number;
}

export function ResetPasswordDialog({
  open,
  onOpenChange,
  userId,
  username,
}: ResetPasswordDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<ResetResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Reset state khi đóng dialog
  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setResult(null);
        setCopied(false);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        toast.error(body.error?.message ?? "Reset mật khẩu thất bại.");
        return;
      }
      const data = (await res.json()) as ResetResult;
      setResult(data);
      toast.success("Đã reset mật khẩu thành công.");
    } catch (err) {
      toast.error(
        `Lỗi: ${err instanceof Error ? err.message : "unknown"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.tempPassword);
      setCopied(true);
      toast.success("Đã copy mật khẩu tạm vào clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy thất bại. Hãy chọn text thủ công.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {result === null ? (
          // Step 1: Confirm
          <>
            <DialogHeader>
              <DialogTitle variant="destructive">
                Reset mật khẩu cho {username}?
              </DialogTitle>
              <DialogDescription>
                Hệ thống sẽ sinh mật khẩu tạm ngẫu nhiên, buộc user đổi mật
                khẩu ở lần đăng nhập kế tiếp. Tất cả phiên đăng nhập hiện tại
                của user sẽ bị thu hồi.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold">Mật khẩu tạm chỉ hiện 1 lần</p>
                <p className="mt-1">
                  Hãy sẵn sàng copy vào ứng dụng gửi tin (Telegram, Zalo) ngay
                  sau khi xác nhận. Sau khi đóng cửa sổ, bạn không thể xem lại.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Huỷ
              </Button>
              <Button onClick={() => void handleConfirm()} disabled={loading}>
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                {loading ? "Đang reset…" : "Xác nhận reset"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          // Step 2: Show temp password
          <>
            <DialogHeader>
              <DialogTitle>Mật khẩu tạm đã tạo</DialogTitle>
              <DialogDescription>
                Gửi mật khẩu này cho {username} qua kênh an toàn. User phải
                đổi sang mật khẩu riêng sau khi đăng nhập lần đầu.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-zinc-200 bg-zinc-950 p-4 text-center">
              <code className="select-all font-mono text-base font-semibold tracking-wider text-emerald-300">
                {result.tempPassword}
              </code>
            </div>
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
              <p>
                Đã thu hồi <strong>{result.revokedSessions}</strong> phiên
                đăng nhập của user này.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                aria-hidden="true"
              />
              <p>
                Sau khi đóng cửa sổ, mật khẩu KHÔNG thể xem lại. Nếu quên,
                phải reset lại từ đầu.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {copied ? "Đã copy" : "Copy mật khẩu"}
              </Button>
              <Button onClick={() => onOpenChange(false)}>
                Đã lưu, đóng
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
