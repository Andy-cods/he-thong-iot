"use client";

import * as React from "react";
import { FileText, Beaker, Layers, FileEdit, Check } from "lucide-react";
import { toast } from "sonner";
import { type BomSheetKind } from "@iot/shared";
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
import { cn } from "@/lib/utils";
import { useCreateBomSheet } from "@/hooks/useBomSheets";

/**
 * V2.0 Sprint 6 — Dialog thêm sheet mới vào BOM List.
 *
 * UX V2: thay Select dropdown bằng 4 preset card visual để user thấy ngay
 * sheet nào theo dõi gì:
 *   📋 Cấu trúc BOM (PROJECT) — danh sách linh kiện cấu trúc sản phẩm
 *   🧪 Vật liệu (MATERIAL) — bảng vật liệu kèm giá deal + phôi + status
 *   🪟 Quy trình gia công (PROCESS) — bảng quy trình kèm giờ + đơn giá
 *   ✏️ Tuỳ chỉnh (CUSTOM) — sheet free-form (note, hướng dẫn)
 */

interface AddBomSheetDialogProps {
  templateId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback khi sheet tạo xong — parent có thể switch active sheet. */
  onCreated?: (sheetId: string) => void;
  /** Default kind khi mở dialog (mặc định MATERIAL — case phổ biến nhất). */
  defaultKind?: BomSheetKind;
}

interface KindPreset {
  kind: BomSheetKind;
  icon: React.ElementType;
  label: string;
  description: string;
  placeholder: string;
  iconColor: string;
  borderActive: string;
}

const KIND_PRESETS: KindPreset[] = [
  {
    kind: "PROJECT",
    icon: FileText,
    label: "Cấu trúc BOM",
    description: "Danh sách linh kiện / cấu trúc sản phẩm (như Sheet 1)",
    placeholder: "Ví dụ: Sheet chính / Phụ kiện / Module B…",
    iconColor: "text-indigo-600",
    borderActive: "border-indigo-500 bg-indigo-50",
  },
  {
    kind: "MATERIAL",
    icon: Beaker,
    label: "Material & Process",
    description:
      "Bảng vật liệu + bảng quy trình gia công song song trong 1 sheet (như Excel sheet 3)",
    placeholder: "Ví dụ: Material & Process",
    iconColor: "text-emerald-600",
    borderActive: "border-emerald-500 bg-emerald-50",
  },
  {
    kind: "CUSTOM",
    icon: FileEdit,
    label: "Tuỳ chỉnh",
    description:
      "Sheet free-form (ghi chú, hướng dẫn lắp, đặc tả khách hàng)",
    placeholder: "Ví dụ: Ghi chú khách / Hướng dẫn lắp",
    iconColor: "text-zinc-600",
    borderActive: "border-zinc-500 bg-zinc-50",
  },
];

export function AddBomSheetDialog({
  templateId,
  open,
  onOpenChange,
  onCreated,
  defaultKind = "MATERIAL",
}: AddBomSheetDialogProps) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<BomSheetKind>(defaultKind);
  const create = useCreateBomSheet(templateId);

  // Reset form khi mở/đóng
  React.useEffect(() => {
    if (open) {
      setName("");
      setKind(defaultKind);
    }
  }, [open, defaultKind]);

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

  const activePreset = KIND_PRESETS.find((p) => p.kind === kind)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Thêm sheet mới</DialogTitle>
          <DialogDescription>
            Chọn loại sheet bạn muốn thêm vào BOM này. Mỗi loại có giao diện
            + dữ liệu riêng phù hợp với mục đích.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Kind preset cards */}
          <div>
            <Label uppercase className="mb-2">
              Chọn loại sheet *
            </Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {KIND_PRESETS.map((p) => {
                const Icon = p.icon;
                const isSelected = p.kind === kind;
                return (
                  <button
                    key={p.kind}
                    type="button"
                    onClick={() => setKind(p.kind)}
                    className={cn(
                      "group relative flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                      isSelected
                        ? p.borderActive
                        : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                    )}
                  >
                    {isSelected ? (
                      <Check
                        className="absolute right-2 top-2 h-3.5 w-3.5 text-emerald-600"
                        aria-hidden="true"
                      />
                    ) : null}
                    <Icon
                      className={cn("h-5 w-5 shrink-0", p.iconColor)}
                      aria-hidden="true"
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold text-zinc-900">
                        {p.label}
                      </span>
                      <span className="mt-0.5 text-xs text-zinc-500">
                        {p.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name input */}
          <div>
            <Label uppercase>Tên sheet *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={activePreset.placeholder}
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
              {create.isPending ? "Đang tạo…" : `Tạo ${activePreset.label}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
