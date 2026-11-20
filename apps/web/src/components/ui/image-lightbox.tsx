"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Khung xem ảnh lớn DÙNG CHUNG (Radix Dialog): ảnh `object-contain` căn giữa,
 * đóng bằng nền mờ / Esc / nút X. Có thể lồng trong Dialog/Sheet khác (Radix chỉ
 * đóng lớp trên cùng).
 *
 * Fix B1: React cho sự kiện từ portal NỔI BỌT theo cây React → bấm nền tối để
 * đóng ảnh từng kích hoạt `onClick` của dòng bảng / link / dialog phía sau
 * (mở nhầm "Sửa mã hàng"). Bọc `<Dialog>` trong `<span className="contents">`
 * chặn `click` ở đây. KHÔNG chặn `pointerdown`: Radix lắng nghe pointerdown ở
 * document để đóng khi bấm ngoài, chặn nó làm nền mờ hết đóng được.
 */

export type LightboxStage = "full" | "thumb" | "failed";

/** Máy trạng thái lỗi tải: full → (thumb nếu có) → failed. Hàm thuần để test. */
export function nextLightboxStage(stage: LightboxStage, hasFallback: boolean): LightboxStage {
  if (stage === "full" && hasFallback) return "thumb";
  return "failed";
}

export function ImageLightbox({
  open,
  onOpenChange,
  src,
  fallbackSrc,
  alt,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  /** Ảnh dự phòng (thumb) khi ảnh đầy đủ lỗi. */
  fallbackSrc?: string;
  alt: string;
  /** Phần tử nhận lại focus khi đóng (nút mở). Không truyền → Radix tự trả về phần tử đang focus lúc mở. */
  returnFocusRef?: React.RefObject<HTMLElement>;
}) {
  const [stage, setStage] = React.useState<LightboxStage>("full");
  React.useEffect(() => {
    if (open) setStage("full");
  }, [open, src]);
  const current = stage === "full" ? src : stage === "thumb" ? fallbackSrc : undefined;

  return (
    <span
      className="contents"
      onClick={(e) => {
        e.stopPropagation();
        // Chạm nền tối trên điện thoại: Radix chờ `click` ở document để đóng (touch),
        // nhưng click đã bị chặn ở trên → tự đóng khi chạm ngoài khung ảnh.
        if (open && !(e.target as Element | null)?.closest?.('[role="dialog"]')) onOpenChange(false);
      }}
    >
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          size="lg"
          className="p-3"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            const el = returnFocusRef?.current;
            if (el) {
              e.preventDefault();
              el.focus();
            }
          }}
        >
          <DialogTitle className="pr-8 text-md">{alt}</DialogTitle>
          <div className="flex h-[min(80dvh,720px)] w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
            {stage !== "failed" && current ? (
              // eslint-disable-next-line @next/next/no-img-element -- ảnh qua route có auth (cookie) hoặc object URL
              <img
                key={stage}
                src={current}
                alt={alt}
                draggable={false}
                onError={() => setStage((s) => nextLightboxStage(s, !!fallbackSrc))}
                className="h-full w-full object-contain"
              />
            ) : (
              <div role="status" className="flex flex-col items-center gap-2 text-sm text-zinc-500">
                <ImageOff className="h-8 w-8" aria-hidden="true" />
                Không tải được ảnh
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </span>
  );
}

/** Nút ảnh nhỏ → mở ImageLightbox. Không đặt trong <a>/<button> khác. */
export function ZoomableThumb({
  thumbSrc,
  fullSrc,
  alt,
  size,
  className,
  children,
}: {
  thumbSrc?: string;
  fullSrc: string;
  alt: string;
  size?: number;
  className?: string;
  /** Nội dung nút (mặc định: ảnh thumb). */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500",
          className,
        )}
        style={size ? { width: size, height: size } : undefined}
        aria-label={`Xem ảnh lớn ${alt}`}
      >
        {children ??
          (thumbSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh qua route có auth
            <img src={thumbSrc} alt={alt} loading="lazy" draggable={false} className="h-full w-full object-contain" />
          ) : null)}
      </button>
      <ImageLightbox open={open} onOpenChange={setOpen} src={fullSrc} fallbackSrc={thumbSrc} alt={alt} returnFocusRef={btnRef} />
    </>
  );
}
