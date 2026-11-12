"use client";

import * as React from "react";
import { Copy, Factory, ImageOff, MoreHorizontal, Trash2, X } from "lucide-react";
import { SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CATEGORY_GROUP_LABEL,
  lineCategory,
  lineIdText,
  lineImageSrc,
  lineNameText,
} from "@/lib/bom-grid/line-view";
import type { BomTreeNodeRaw } from "@/hooks/useBom";

export interface LineSheetHeaderProps {
  node: BomTreeNodeRaw;
  templateCode: string;
  onClose: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onCreateWorkOrder?: () => void;
}

/** Ảnh 3D lớn (4:3, nền trắng, bấm phóng to) + chip ID, pill category, tên, mã vật tư, menu "…". */
export function LineSheetHeader({
  node,
  templateCode,
  onClose,
  onDuplicate,
  onDelete,
  onCreateWorkOrder,
}: LineSheetHeaderProps) {
  const [zoom, setZoom] = React.useState(false);
  const [imgFailed, setImgFailed] = React.useState(false);
  const src = lineImageSrc(node, "full");
  const id = lineIdText(node);
  const name = lineNameText(node) ?? "(chưa có tên)";
  const hasMenu = !!(onDuplicate || onDelete || onCreateWorkOrder);

  React.useEffect(() => setImgFailed(false), [src]);

  // Esc khi đang phóng to chỉ đóng ảnh, không đóng cả sheet.
  React.useEffect(() => {
    if (!zoom) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setZoom(false);
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [zoom]);

  return (
    <header className="px-5 pb-1 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
          {templateCode}
        </span>
        <div className="flex items-center gap-1">
          {hasMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Thao tác khác"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onCreateWorkOrder && (
                  <DropdownMenuItem onSelect={onCreateWorkOrder}>
                    <Factory className="h-3.5 w-3.5" aria-hidden /> Tạo lệnh SX
                  </DropdownMenuItem>
                )}
                {onDuplicate && (
                  <DropdownMenuItem onSelect={onDuplicate}>
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Nhân bản
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="danger" onSelect={onDelete}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Xoá
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {src && !imgFailed ? (
        <button
          type="button"
          onClick={() => setZoom(true)}
          aria-label="Phóng to ảnh"
          className="block w-full cursor-zoom-in overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:ring-zinc-700"
          style={{ aspectRatio: "4 / 3", maxHeight: "40vh" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-contain"
          />
        </button>
      ) : (
        <div
          className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl bg-zinc-50 text-[12px] text-zinc-400 dark:bg-zinc-800/40 dark:text-zinc-500"
          style={{ height: "min(120px, 20vh)" }}
        >
          <ImageOff className="h-5 w-5" aria-hidden />
          Chưa có ảnh
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {id && (
          <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
            {id}
          </span>
        )}
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {CATEGORY_GROUP_LABEL[lineCategory(node)]}
        </span>
      </div>
      <SheetTitle className="mt-1.5 break-words text-[22px] font-semibold leading-tight tracking-tight">
        {name}
      </SheetTitle>
      <p className="mt-1 font-mono text-[12px] text-zinc-500 dark:text-zinc-400">
        {node.componentSku ?? "—"}
      </p>

      {zoom && src && (
        <div
          role="dialog"
          aria-label="Ảnh phóng to"
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/80 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={name}
            className="max-h-full max-w-full rounded-xl bg-white object-contain"
          />
          <button
            type="button"
            autoFocus
            onClick={() => setZoom(false)}
            aria-label="Đóng ảnh"
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-zinc-800"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </header>
  );
}
