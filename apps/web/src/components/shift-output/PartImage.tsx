"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { partImageUrl } from "@/hooks/useShiftOutput";

/**
 * P2 — ảnh mã hàng trong KHUNG CỐ ĐỊNH: nền xám nhạt, ảnh `object-contain` căn
 * giữa cả 2 chiều (tự co vừa khung, không méo / không cắt). `zoomable` → chạm
 * mở ảnh lớn (Dialog). Đặt trong nút / link khác thì để `zoomable={false}`
 * (không lồng button).
 */
export function PartImage({
  partId,
  assetId,
  size = 40,
  alt,
  zoomable = true,
  placeholder = true,
  className,
}: {
  partId: string;
  assetId: string | null | undefined;
  /** Cạnh khung (px). */
  size?: number;
  alt: string;
  zoomable?: boolean;
  /** Không có ảnh: hiện khung trống có icon (true) hay không hiện gì (false). */
  placeholder?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [assetId]);
  const has = !!assetId && !broken;
  if (!has && !placeholder) return null;

  const frame = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700",
    className,
  );
  const style = { width: size, height: size };
  const inner = has ? (
    // eslint-disable-next-line @next/next/no-img-element -- ảnh qua route có auth (cookie), không qua next/image
    <img
      src={partImageUrl(partId, assetId!, size > 96 ? "full" : "thumb")}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setBroken(true)}
      className="h-full w-full object-contain"
    />
  ) : (
    <ImageOff className="h-1/2 w-1/2 max-h-5 max-w-5 text-zinc-300 dark:text-zinc-600" aria-hidden="true" />
  );

  if (!has || !zoomable) {
    return (
      <span className={frame} style={style} aria-label={has ? undefined : "Chưa có ảnh"}>
        {inner}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(frame, "cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500")}
        style={style}
        aria-label={`Xem ảnh lớn ${alt}`}
      >
        {inner}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="p-3" onClick={(e) => e.stopPropagation()}>
          <DialogTitle className="pr-8 text-md">{alt}</DialogTitle>
          <div className="flex h-[min(70dvh,560px)] w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh qua route có auth */}
            <img src={partImageUrl(partId, assetId!, "full")} alt={alt} className="h-full w-full object-contain" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
