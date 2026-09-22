"use client";

import * as React from "react";
import { FileText, Paperclip, Upload, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useUploadFinAttachment } from "@/hooks/useFinance";
import { cn } from "@/lib/utils";

/**
 * TASK-20260922 — Hiển thị + upload chứng từ đính kèm (ảnh/PDF) cho khoản
 * thu chi / hoá đơn. Dùng chung cho `TransactionDetailSheet` và
 * `InvoiceDetailSheet` (cả 2 bảng đều có cột `attachmentUrl`).
 *
 * - Có `attachmentUrl` → ảnh hiện thumbnail (click phóng to trong Dialog),
 *   PDF hiện link mở tab mới.
 * - Chưa có + `canEdit` → nút "Đính kèm chứng từ" mở file picker, upload
 *   xong tự gọi `onUploaded(url)` để caller PATCH vào record.
 */

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|heic)$/i.test(url);
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

export function AttachmentField({
  attachmentUrl,
  canEdit,
  onUploaded,
  uploading: externalUploading,
}: {
  attachmentUrl: string | null;
  canEdit: boolean;
  // Promise<unknown> — caller thường trả Promise<TQueryData> của react-query
  // mutateAsync; ở đây chỉ cần await được, không quan tâm giá trị resolve.
  onUploaded: (url: string) => void | Promise<unknown>;
  uploading?: boolean;
}) {
  const uploadMut = useUploadFinAttachment();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [zoomOpen, setZoomOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isUploading = uploadMut.isPending || !!externalUploading;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const { data } = await uploadMut.mutateAsync(file);
      await onUploaded(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload thất bại.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (!attachmentUrl) {
    if (!canEdit) {
      return <p className="text-xs text-zinc-400 dark:text-zinc-500">Chưa có chứng từ đính kèm.</p>;
    }
    return (
      <div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          {isUploading ? "Đang tải lên…" : "Đính kèm chứng từ"}
        </Button>
        {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  const isImage = isImageUrl(attachmentUrl);

  return (
    <div>
      {isImage ? (
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          className="group relative block h-28 w-28 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ảnh nội bộ qua API guard, không phải remote domain cần next/image */}
          <img src={attachmentUrl} alt="Chứng từ đính kèm" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
            <ZoomIn className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
          </span>
        </button>
      ) : (
        <a
          href={attachmentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-indigo-400 dark:hover:bg-zinc-800/70"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          Xem file PDF
        </a>
      )}

      {canEdit && (
        <div className="mt-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
            className="text-zinc-500 dark:text-zinc-400"
          >
            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
            {isUploading ? "Đang tải lên…" : "Thay chứng từ khác"}
          </Button>
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {isImage && (
        <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
          <DialogContent size="lg" className="bg-transparent p-0 shadow-none">
            <div className="relative">
              <button
                type="button"
                onClick={() => setZoomOpen(false)}
                aria-label="Đóng"
                className={cn(
                  "absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80",
                )}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachmentUrl} alt="Chứng từ đính kèm (phóng to)" className="max-h-[85vh] w-full rounded-lg object-contain" />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
