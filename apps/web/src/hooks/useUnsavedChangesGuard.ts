"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * Cảnh báo mất dữ liệu chưa lưu: beforeunload (reload/đóng tab) + chặn click
 * link nội bộ bằng hộp xác nhận của app. Gọi `release()` ngay trước khi tự
 * điều hướng sau khi lưu/gửi thành công.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const askConfirm = useConfirm();
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;
  const askingRef = React.useRef(false);

  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (askingRef.current) return;
      askingRef.current = true;
      void askConfirm({
        title: "Rời trang mà chưa lưu?",
        description: "Phiếu có thay đổi chưa lưu. Nếu rời đi, các thay đổi sẽ mất.",
        confirmLabel: "Rời trang",
        cancelLabel: "Ở lại",
        tone: "danger",
      })
        .then((ok) => {
          if (ok) {
            dirtyRef.current = false;
            router.push(url.pathname + url.search + url.hash);
          }
        })
        .finally(() => {
          askingRef.current = false;
        });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [askConfirm, router]);

  return {
    release: () => {
      dirtyRef.current = false;
    },
  };
}
