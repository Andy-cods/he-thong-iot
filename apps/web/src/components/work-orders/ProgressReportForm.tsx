"use client";

import * as React from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateProgressLog,
  type ProgressLogInput,
  type WoProgressStepType,
  type WorkOrderLineRow,
} from "@/hooks/useWorkOrders";

/**
 * V1.9-P4 — form báo cáo tiến độ cho operator.
 *
 * Cho phép chọn line (nếu > 1), step type, nhập qty + station + duration
 * + notes + photo URL. Submit → POST /api/work-orders/[id]/progress-log.
 *
 * Zinc + indigo styling, không emoji.
 */

// V4.1 SX-15 — bỏ "Tạm dừng/Tiếp tục (ghi nhận)": chỉ ghi log, KHÔNG đổi
// trạng thái lệnh (gây hiểu nhầm) → dùng nút "Tạm dừng"/"Tiếp tục" thật.
// QC đạt/lỗi chỉ là ghi chú kiểm tra (không có ô SL vô tác dụng).
const STEP_OPTIONS: Array<{ value: WoProgressStepType; label: string }> = [
  { value: "PROGRESS_REPORT", label: "Báo cáo sản lượng" },
  { value: "NOTE", label: "Ghi chú" },
  { value: "ISSUE", label: "Báo sự cố" },
  { value: "QC_PASS", label: "QC đạt (ghi chú)" },
  { value: "QC_FAIL", label: "QC lỗi (ghi chú)" },
  { value: "PHOTO", label: "Ảnh hiện trường" },
];

export function ProgressReportForm({
  woId,
  lines,
  defaultLineId,
  onSubmitted,
}: {
  woId: string;
  lines: WorkOrderLineRow[];
  defaultLineId?: string | null;
  onSubmitted?: () => void;
}) {
  const mut = useCreateProgressLog(woId);
  const [stepType, setStepType] =
    React.useState<WoProgressStepType>("PROGRESS_REPORT");
  // V4.1 SX-14 — mặc định báo cho THÀNH PHẨM (cộng SL đạt của lệnh); chọn
  // dòng linh kiện chỉ cộng tiến độ dòng đó.
  const [lineId, setLineId] = React.useState<string>(defaultLineId ?? "");
  const [qtyCompleted, setQtyCompleted] = React.useState("");
  const [qtyScrap, setQtyScrap] = React.useState("");
  const [station, setStation] = React.useState("");
  const [durationMinutes, setDurationMinutes] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [photoUrl, setPhotoUrl] = React.useState("");

  React.useEffect(() => {
    if (defaultLineId) setLineId(defaultLineId);
  }, [defaultLineId]);

  const reset = () => {
    setQtyCompleted("");
    setQtyScrap("");
    setStation("");
    setDurationMinutes("");
    setNotes("");
    setPhotoUrl("");
  };

  const canSubmit =
    stepType !== "PROGRESS_REPORT" ||
    Number(qtyCompleted) > 0 ||
    Number(qtyScrap) > 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      toast.error("Nhập SL đạt hoặc SL phế > 0 cho báo cáo sản lượng.");
      return;
    }
    const isQtyStep = stepType === "PROGRESS_REPORT";
    const payload: ProgressLogInput = {
      workOrderLineId: isQtyStep ? lineId || null : null,
      stepType,
      qtyCompleted: isQtyStep && qtyCompleted ? Number(qtyCompleted) : 0,
      qtyScrap: isQtyStep && qtyScrap ? Number(qtyScrap) : 0,
      notes: notes.trim() || null,
      photoUrl: photoUrl.trim() || null,
      station: station.trim() || null,
      durationMinutes: durationMinutes ? Number(durationMinutes) : null,
    };
    try {
      await mut.mutateAsync(payload);
      toast.success("Đã ghi nhận tiến độ.");
      reset();
      onSubmitted?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Báo cáo tiến độ / sự cố
        </h3>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Dành cho operator / kỹ thuật trạm máy
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Loại bước</Label>
          <select
            value={stepType}
            onChange={(e) => setStepType(e.target.value as WoProgressStepType)}
            className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {STEP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {lines.length > 0 && stepType === "PROGRESS_REPORT" && (
          <div>
            <Label className="text-xs">Báo cho</Label>
            <select
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">Thành phẩm (cộng SL đạt của lệnh)</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  #{l.position} · {l.componentSku} · {l.componentName}
                </option>
              ))}
            </select>
          </div>
        )}

        {stepType === "PROGRESS_REPORT" && (
          <>
            <div>
              <Label className="text-xs">SL đạt</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={qtyCompleted}
                onChange={(e) => setQtyCompleted(e.target.value)}
                className="mt-1 h-9"
                placeholder="0"
              />
            </div>
            <div>
              <Label className="text-xs">SL phế</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={qtyScrap}
                onChange={(e) => setQtyScrap(e.target.value)}
                className="mt-1 h-9"
                placeholder="0"
              />
            </div>
          </>
        )}

        <div>
          <Label className="text-xs">Máy / trạm</Label>
          <Input
            value={station}
            onChange={(e) => setStation(e.target.value)}
            className="mt-1 h-9"
            placeholder="VD: CNC-01"
          />
        </div>
        <div>
          <Label className="text-xs">Thời gian (phút)</Label>
          <Input
            type="number"
            step="1"
            min="0"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            className="mt-1 h-9"
            placeholder="0"
          />
        </div>

        <div className="sm:col-span-2">
          <Label className="text-xs">Ghi chú</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 min-h-[60px] text-sm"
            placeholder="Mô tả chi tiết bước làm, vấn đề, kết quả..."
            maxLength={2000}
          />
        </div>

        <div className="sm:col-span-2">
          <Label className="text-xs">Photo URL (nếu có)</Label>
          <Input
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            className="mt-1 h-9"
            placeholder="https://... hoặc dán link ảnh"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={mut.isPending}
        >
          Xóa form
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={mut.isPending || !canSubmit}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Send className="h-3.5 w-3.5" />
          Gửi báo cáo
        </Button>
      </div>
    </form>
  );
}
