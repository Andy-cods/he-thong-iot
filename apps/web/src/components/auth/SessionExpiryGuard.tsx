"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * V4.1 D1 — Canh hạn phiên đăng nhập (4 tiếng tuyệt đối, không có refresh).
 *
 * - Còn ≤ 10 phút: hiện dải cảnh báo trên cùng để người dùng lưu dở dang.
 * - Hết hạn, HOẶC bất kỳ lời gọi /api/* nào trả 401 (bị admin khoá / đổi vai
 *   trò / thu hồi phiên): hiện hộp thoại "Phiên đã hết hạn" thay vì để các
 *   thao tác sau đó thất bại âm thầm từng cái một.
 *
 * Không có API client dùng chung nên bắt 401 bằng cách bọc window.fetch một
 * lần. Bỏ qua các endpoint đăng nhập/đăng xuất vì 401 ở đó là bình thường.
 */
const WARN_BEFORE_MS = 10 * 60_000;
const IGNORE_401 = ["/api/auth/login", "/api/auth/logout"];

function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SessionExpiryGuard({ expiresAt }: { expiresAt: number | null }) {
  const pathname = usePathname();
  const [now, setNow] = React.useState(() => Date.now());
  const [forcedExpired, setForcedExpired] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    const original = window.fetch;
    const wrapped: typeof window.fetch = async (input, init) => {
      const res = await original(input, init);
      if (res.status === 401) {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        let path = url;
        try {
          const u = new URL(url, window.location.origin);
          path = u.origin === window.location.origin ? u.pathname : "";
        } catch {
          // giữ nguyên url
        }
        if (path.startsWith("/api/") && !IGNORE_401.some((p) => path.startsWith(p))) {
          setForcedExpired(true);
        }
      }
      return res;
    };
    window.fetch = wrapped;
    return () => {
      if (window.fetch === wrapped) window.fetch = original;
    };
  }, []);

  const remaining = expiresAt ? expiresAt - now : Infinity;
  const expired = forcedExpired || remaining <= 0;
  const warn = !expired && !dismissed && remaining <= WARN_BEFORE_MS;
  // V4.1 AD-18 — giữ cả query (?tab=…, dữ liệu điền sẵn) khi quay lại sau đăng nhập.
  const search = typeof window !== "undefined" ? window.location.search : "";
  const loginHref = `/login?next=${encodeURIComponent((pathname || "/") + search)}`;

  return (
    <>
      {warn && expiresAt ? (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-dropdown flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Phiên đăng nhập sẽ hết hạn lúc <strong>{fmtTime(expiresAt)}</strong>.
            Hãy lưu công việc đang làm.
          </span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded px-2 py-0.5 text-xs font-medium underline underline-offset-2 hover:bg-amber-100 dark:hover:bg-amber-900"
          >
            Đã hiểu
          </button>
        </div>
      ) : null}

      <Dialog open={expired}>
        <DialogContent
          size="sm"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Phiên đăng nhập đã hết hạn</DialogTitle>
            <DialogDescription>
              Mỗi phiên kéo dài 4 tiếng (một ca làm việc), hoặc tài khoản vừa
              được quản trị viên thay đổi. Đăng nhập lại để tiếp tục — bạn sẽ
              quay về đúng trang này.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button asChild>
              <a href={loginHref}>Đăng nhập lại</a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
