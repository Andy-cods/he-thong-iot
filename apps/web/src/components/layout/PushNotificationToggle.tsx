"use client";

import * as React from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  disablePush,
  enablePush,
  getActivePushEndpoint,
  getPushPermissionState,
  getPushSupport,
  type PushPermissionState,
} from "@/lib/push";

/**
 * TASK-notify V4.4 — mục "Bật thông báo trên thiết bị này" (Web Push).
 *
 * Trạng thái đọc lúc mount (KHÔNG tự xin quyền/subscribe) — chỉ hành động khi
 * người dùng bấm nút, đúng yêu cầu không tự bật popup khi vào trang. iOS
 * Safari cần "Thêm vào màn hình chính" trước (iOS 16.4+) mới nhận được push —
 * hiện hướng dẫn riêng khi phát hiện iOS chưa chạy ở chế độ standalone.
 */
export function PushNotificationToggle({ className }: { className?: string }) {
  const [supported, setSupported] = React.useState<boolean | null>(null);
  const [permission, setPermission] = React.useState<PushPermissionState>("default");
  const [subscribed, setSubscribed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [isIosNonStandalone, setIsIosNonStandalone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const ok = getPushSupport();
    setSupported(ok);
    if (!ok) return;
    setPermission(getPushPermissionState());
    const endpoint = await getActivePushEndpoint();
    setSubscribed(Boolean(endpoint));
  }, []);

  React.useEffect(() => {
    void refresh();
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const standalone =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches ||
        // Safari cũ: navigator.standalone (không có type chuẩn).
        Boolean((window.navigator as unknown as { standalone?: boolean }).standalone));
    setIsIosNonStandalone(isIos && !standalone);
  }, [refresh]);

  const handleToggle = async () => {
    setError(null);
    setBusy(true);
    try {
      if (subscribed) {
        await disablePush();
      } else {
        const res = await enablePush();
        if (!res.ok) {
          setError(
            res.reason === "denied"
              ? "Trình duyệt đã chặn thông báo — vào Cài đặt trình duyệt để mở lại."
              : res.reason === "not_configured"
                ? "Máy chủ chưa bật kênh đẩy — liên hệ quản trị."
                : res.reason === "unsupported"
                  ? "Thiết bị/trình duyệt này không hỗ trợ thông báo đẩy."
                  : "Không bật được thông báo — thử lại sau.",
          );
        }
      }
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  if (supported === null) return null; // tránh nháy UI trong lúc kiểm tra hỗ trợ (mount-only)

  return (
    <div className={cn("rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              subscribed
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
            )}
          >
            {subscribed ? <BellRing className="h-4 w-4" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Thông báo đẩy trên thiết bị này
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {!supported
                ? "Thiết bị/trình duyệt này không hỗ trợ."
                : permission === "denied"
                  ? "Đã bị chặn — mở lại trong cài đặt trình duyệt."
                  : subscribed
                    ? "Đang bật — bạn sẽ nhận thông báo kể cả khi đóng tab."
                    : "Nhận thông báo việc cần duyệt ngay cả khi không mở web."}
            </p>
            {isIosNonStandalone && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                iPhone: bấm nút Chia sẻ → “Thêm vào MH chính” rồi mở app từ màn
                hình chính trước khi bật (iOS 16.4+).
              </p>
            )}
            {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        </div>
        <Button
          type="button"
          variant={subscribed ? "outline" : "primary"}
          size="sm"
          disabled={!supported || busy || permission === "denied"}
          onClick={() => void handleToggle()}
          className="shrink-0"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : subscribed ? (
            <BellOff className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Bell className="h-3.5 w-3.5" aria-hidden />
          )}
          {subscribed ? "Tắt" : "Bật thông báo"}
        </Button>
      </div>
    </div>
  );
}
