"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  BOM_SHEET_KINDS,
  BOM_SHEET_KIND_LABELS,
  type BomSheetKind,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateBomSheet } from "@/hooks/useBomSheets";

/**
 * V2.0 Sprint 6 — Dialog thêm sheet mới vào BOM List hiện có.
 *
 * Pattern: chọn loại trước (PROJECT/MATERIAL/PROCESS/CUSTOM) →
 * nhập tên → confirm. Sau khi tạo xong tự switch active sang sheet mới.
 */

interface AddBomSheetDialogProps {
  templateId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback khi sheet tạo xong — parent có thể switch active sheet. */
  onCreated?: (sheetId: string) => void;
}

const KIND_DESCRIPTION: Record<BomSheetKind, string> = {
  PROJECT: "Sheet chứa danh sách linh kiện / cấu trúc sản phẩm (bom_lines).",
  MATERIAL:
    "Reference master vật liệu — chỉ filter, không lưu data riêng. Data thật ở Master vật liệu toàn cục.",
  PROCESS:
    "Reference master quy trình gia công — tương tự MATERIAL.",
  CUSTOM:
    "Sheet tự do (note, hướng dẫn, đặc tả khách). Không cấu trúc cố định.",
};

export function AddBomSheetDialog({
  templateId,
  open,
  onOpenChange,
  onCreated,
}: AddBomSheetDialogProps) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<BomSheetKind>("PROJECT");
  const create = useCreateBomSheet(templateId);

  // Reset form khi mở/đóng
  React.useEffect(() => {
    if (open) {
      setName("");
      setKind("PROJECT");
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Tên sheet bắt buộc");
      return;
    }
    try {
      const res = await create.mutateAsync({ name: trimmed, kind });
      toast.success(`Đã tạo sheet "${res.data.name}"`);
      onCreated?.(res.data.id);
      onOpenChange(false);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "DUPLICATE_NAME") {
        toast.error("Tên sheet đã tồn tại trong BOM này");
      } else if (code === "TEMPLATE_OBSOLETE") {
        toast.error("BOM này đã obsolete — không thể thêm sheet");
      } else {
        toast.error((err as Error).message ?? "Tạo sheet thất bại");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Thêm sheet mới</DialogTitle>
          <DialogDescription>
            Thêm 1 sheet vào BOM List hiện tại. Sheet PROJECT chứa cấu trúc
            sản phẩm; MATERIAL / PROCESS link tới master toàn cục;
            CUSTOM cho note/đặc tả tự do.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label uppercase>Loại sheet *</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as BomSheetKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOM_SHEET_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {BOM_SHEET_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-zinc-500">
              {KIND_DESCRIPTION[kind]}
            </p>
          </div>
          <div>
            <Label uppercase>Tên sheet *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                kind === "PROJECT"
                  ? "Ví dụ: Sheet chính / Phụ kiện điện / Module B…"
                  : kind === "MATERIAL"
                    ? "Ví dụ: Vật liệu sử dụng"
                    : kind === "PROCESS"
                      ? "Ví dụ: Quy trình gia công"
                      : "Ví dụ: Ghi chú khách hàng / Hướng dẫn lắp"
              }
              required
              maxLength={255}
              autoFocus
            />
          </div>
          <DialogFooter className="mt-2 flex flex-row justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              disabled={create.isPending || !name.trim()}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {create.isPending ? "Đang tạo…" : "Tạo sheet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
