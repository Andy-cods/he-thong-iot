"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * V2 Tabs — Linear-inspired underline style (not pill-filled V1).
 * List h-9 (36px) border-b zinc-200.
 * Trigger h-8 padding-x 12, text-base 13px weight 500, text-zinc-500.
 * Active: text-zinc-900 border-b-2 zinc-900 (quiet neutral, KHÔNG blue
 * để tabs không "ồn" — blue chỉ cho action/command).
 */

export const Tabs = TabsPrimitive.Root;

/**
 * V4.2 UI (redesign Tài chính §1.9) — tự cuộn tab `data-state="active"` vào
 * tầm nhìn khi mount/đổi. Trước đây `overflow-x-auto` không tự cuộn, nên khi
 * tab active nằm giữa/cuối danh sách dài (VD sub-tab cấp 2 Tài chính), chữ
 * đầu danh sách bị cắt ở mép trái mà không có cách nào biết còn tab phía sau.
 * Dùng chung 1 nơi (component nền) thay vì sửa từng chỗ gọi `TabsList` — API/
 * style giữ nguyên 100%, chỉ thêm hành vi, không phá trang khác.
 */
export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const innerRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => innerRef.current!);

  // Chỉ chạy khi mount + khi tab active THỰC SỰ đổi (theo dõi `data-state`),
  // không chạy mỗi lần re-render — nếu không, refetch nền sẽ giật mất vị trí
  // người dùng vừa vuốt tay. Chỉ cuộn khi tab active đang bị che.
  React.useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const reveal = () => {
      const active = el.querySelector<HTMLElement>('[data-state="active"]');
      if (!active || el.scrollWidth <= el.clientWidth) return;
      const start = active.offsetLeft;
      const end = start + active.offsetWidth;
      if (start >= el.scrollLeft && end <= el.scrollLeft + el.clientWidth) return;
      el.scrollLeft = Math.max(0, start - el.clientWidth / 2 + active.offsetWidth / 2);
    };
    reveal();
    const observer = new MutationObserver(reveal);
    observer.observe(el, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
    return () => observer.disconnect();
  }, []);

  return (
    <TabsPrimitive.List
      ref={innerRef}
      className={cn(
        // V4.1 UI-X6: cuộn ngang khi nhiều tab (chi tiết vật tư/NCC tràn 432/418px trên 390px).
        "inline-flex h-9 w-full items-end justify-start gap-1 overflow-x-auto overflow-y-hidden border-b border-zinc-200 text-zinc-500 [scrollbar-width:none] dark:border-zinc-800 dark:text-zinc-400 [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
});
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap border-b-2 border-transparent px-3 text-base font-medium text-zinc-500 transition-colors duration-100 ease-out dark:text-zinc-400",
      "hover:text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 dark:hover:text-zinc-200",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:border-zinc-900 data-[state=active]:text-zinc-900 dark:data-[state=active]:border-zinc-50 dark:data-[state=active]:text-zinc-50",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";
