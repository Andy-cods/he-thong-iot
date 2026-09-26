"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * V4.1 UI-X6: danh sách tab cuộn ngang dùng chung (hub + kho + chi tiết).
 *
 * - `overflow-x-auto` + ẩn thanh cuộn → điện thoại 390px không bị tràn trang
 *   (trước đây /sales tràn 461px, /engineering?tab=pr 501px).
 * - Tự cuộn tab đang chọn (`aria-current="page"` hoặc `data-state="active"`)
 *   vào giữa khung khi mở trang.
 * - Mép phải mờ báo "còn tab" khi chưa cuộn hết.
 *
 * Các item con phải tự có `shrink-0 whitespace-nowrap`.
 */
export function ScrollTabsList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLUListElement>(null);
  const [moreRight, setMoreRight] = React.useState(false);

  const update = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(
      '[aria-current="page"], [data-state="active"]',
    );
    if (active && el.scrollWidth > el.clientWidth) {
      const left =
        active.offsetLeft - el.clientWidth / 2 + active.offsetWidth / 2;
      el.scrollLeft = Math.max(0, left);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  return (
    <div className="relative min-w-0">
      <ul
        ref={ref}
        onScroll={update}
        className={cn(
          "flex items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
      >
        {children}
      </ul>
      {moreRight ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent dark:from-zinc-900"
        />
      ) : null}
    </div>
  );
}
