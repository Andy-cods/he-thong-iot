"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileEdit, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdateBomSheet } from "@/hooks/useBomSheets";
import type { BomSheetRow } from "@/hooks/useBomSheets";

/**
 * V2.0 Sprint 6 FIX — render sheet kind=CUSTOM.
 *
 * Pattern KISS: textarea lớn cho user nhập markdown / plain text vào
 * `bom_sheet.metadata.content`. Click "Lưu" → PATCH metadata.
 *
 * Defer Sprint 7+: Markdown renderer (react-markdown), file attachments.
 */

interface CustomSheetViewProps {
  templateId: string;
  sheet: BomSheetRow;
  readOnly?: boolean;
}

export function CustomSheetView({
  templateId,
  sheet,
  readOnly,
}: CustomSheetViewProps) {
  const update = useUpdateBomSheet(templateId);

  const initialContent = (sheet.metadata?.content as string | undefined) ?? "";
  const [content, setContent] = React.useState(initialContent);
  const [dirty, setDirty] = React.useState(false);

  // Reset content khi switch sang sheet khác
  React.useEffect(() => {
    setContent(initialContent);
    setDirty(false);
  }, [sheet.id, initialContent]);

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        sheetId: sheet.id,
        patch: {
          metadata: { ...(sheet.metadata ?? {}), content },
        },
      });
      toast.success("Đã lưu nội dung");
      setDirty(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Lưu thất bại");
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-zinc-900">
            <FileEdit className="h-4 w-4 text-zinc-600" aria-hidden="true" />
            {sheet.name}
          </h2>
          <p className="text-xs text-zinc-500">
            Sheet tuỳ chỉnh — ghi chú, hướng dẫn, đặc tả khách hàng. Hỗ trợ
            markdown cơ bản (preview render Sprint 7).
          </p>
        </div>
        {!readOnly ? (
          <Button
            onClick={handleSave}
            disabled={update.isPending || !dirty}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {update.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Lưu
            {dirty ? <span className="ml-1 text-yellow-200">●</span> : null}
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-hidden rounded-md border border-zinc-200 bg-white">
        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setDirty(e.target.value !== initialContent);
          }}
          placeholder={
            readOnly
              ? "(Sheet rỗng)"
              : "Nhập nội dung sheet ở đây…\n\nVí dụ:\n## Hướng dẫn lắp\n1. Bước 1: ...\n2. Bước 2: ...\n\n## Ghi chú khách\n- Yêu cầu đặc biệt: ..."
          }
          disabled={readOnly}
          className="h-full w-full resize-none border-0 bg-transparent p-4 font-mono text-sm leading-relaxed text-zinc-800 outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-zinc-50"
          spellCheck={false}
        />
      </div>

      <p className="text-xs text-zinc-500">
        💡 Mẹo: dùng `# Tiêu đề`, `**đậm**`, `- list` để format khi Sprint 7
        bật markdown render.
      </p>
    </div>
  );
}
