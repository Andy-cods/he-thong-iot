"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * V4.1 UI-X6: danh sách tab cuộn ngang dùng chung (hub + kho + chi tiết).
 *
 * - `overflow-x-auto` + ẩn thanh cuộn → điện thoại 390px không bị tràn trang
 *   (trước đây /sales tràn 461px, /engineering?tab=pr 501px).
 * - Cuộn mượt (`scroll-smooth`) khi người dùng kéo/bấm, nhưng cuộn tab đang
 *   chọn vào tầm nhìn LÚC MỞ TRANG là tức thời (không smooth) để tránh giật
 *   hình khi mount.
 * - Mép TRÁI/PHẢI đều mờ báo "còn tab" khi chưa cuộn hết — V4.4 UI nhóm E/C-PR
 *   thêm mép trái (trước chỉ có mép phải) để không cắt cụt tab đầu khi đã cuộn
 *   qua phải, và để nhất quán 2 chiều. Màu gradient khớp nền `bg-white
 *   dark:bg-zinc-900` của mọi nơi dùng component này (HubTabsNav,
 *   WarehouseTabsNav, PoSecondaryTabs).
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
  const [moreLeft, setMoreLeft] = React.useState(false);
  const [moreRight, setMoreRight] = React.useState(false);

  const update = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setMoreLeft(el.scrollLeft > 2);
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
      // Cuộn tức thời lúc mount — "smooth" chỉ áp dụng cho thao tác sau đó
      // của người dùng (xem class `scroll-smooth` trên <ul>).
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
          "flex scroll-smooth items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
      >
        {children}
      </ul>
      {moreLeft ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent dark:from-zinc-900"
        />
      ) : null}
      {moreRight ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent dark:from-zinc-900"
        />
      ) : null}
    </div>
  );
}
