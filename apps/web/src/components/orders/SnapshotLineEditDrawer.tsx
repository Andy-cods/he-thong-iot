"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  BOM_SNAPSHOT_STATES,
  BOM_SNAPSHOT_STATE_LABELS,
  type BomSnapshotState,
} from "@iot/shared";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateSnapshotLine, type SnapshotLineRow } from "@/hooks/useSnapshots";

/**
 * V1.9 Phase 3 — Drawer inline edit 1 snapshot line từ tab Sản xuất order detail.
 *
 * Fields:
 *   - Required (requiredQty)
 *   - Gross required (grossRequiredQty)
 *   - Available / QC-pass (qcPassQty)
 *   - State (admin có thể bypass state machine)
 *   - Notes
 *
 * Save → PATCH /api/orders/[code]/snapshot-lines/[lineId] với expectedVersionLock.
 */
interface SnapshotLineEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderCode: string;
  row: SnapshotLineRow | null;
  isAdmin: boolean;
}

export function SnapshotLineEditDrawer({
  open,
  onOpenChange,
  orderCode,
  row,
  isAdmin,
}: SnapshotLineEditDrawerProps) {
  const mutate = useUpdateSnapshotLine(orderCode);

  const [requiredQty, setRequiredQty] = React.useState("");
  const [grossQty, setGrossQty] = React.useState("");
  const [availableQty, setAvailableQty] = React.useState("");
  const [state, setState] = React.useState<BomSnapshotState | "">("");
  const [notes, setNotes] = React.useState("");

  // Reset form khi đổi row / open.
  React.useEffect(() => {
    if (row && open) {
      setRequiredQty(String(Number(row.requiredQty)));
      setGrossQty(String(Number(row.grossRequiredQty)));
      setAvailableQty(String(Number(row.qcPassQty)));
      setState(row.state);
      setNotes(row.notes ?? "");
    }
  }, [row, open]);

  if (!row) return null;

  const handleSave = async () => {
    // Chỉ gửi field thực sự thay đổi để audit diff gọn.
    const patch: Record<string, unknown> = {
      expectedVersionLock: row.versionLock,
    };
    const rNum = Number(requiredQty);
    if (!Number.isNaN(rNum) && rNum !== Number(row.requiredQty))
      patch.requiredQty = rNum;
    const gNum = Number(grossQty);
    if (!Number.isNaN(gNum) && gNum !== Number(row.grossRequiredQty))
      patch.grossRequiredQty = gNum;
    const aNum = Number(availableQty);
    if (!Number.isNaN(aNum) && aNum !== Number(row.qcPassQty))
      patch.qcPassQty = aNum;
    if (state !== "" && state !== row.state) patch.state = state;
    if ((notes || "") !== (row.notes ?? "")) patch.notes = notes;

    if (Object.keys(patch).length === 1) {
      toast.info("Chưa có thay đổi để lưu.");
      return;
    }

    try {
      await mutate.mutateAsync({
        lineId: row.id,
        data: patch as never,
      });
      toast.success(`Đã cập nhật line ${row.componentSku}.`);
      onOpenChange(false);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "VERSION_CONFLICT") {
        toast.error(
          "Line đã bị người khác sửa, vui lòng tải lại và thử lại.",
        );
      } else if (e.code === "STATE_TRANSITION_INVALID") {
        toast.error(e.message);
      } else if (e.code === "FORBIDDEN") {
        toast.error("Bạn không có quyền cập nhật snapshot line.");
      } else {
        toast.error(e.message ?? "Cập nhật thất bại.");
      }
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md">
        <SheetHeader>
          <div className="flex-1">
            <SheetTitle className="text-sm">
              Cập nhật line{" "}
              <span className="font-mono text-indigo-600">
                {row.componentSku}
              </span>
            </SheetTitle>
            <SheetDescription className="text-xs">
              {row.componentName}
            </SheetDescription>
          </div>
        </SheetHeader>
        <SheetBody className="space-y-4">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono tabular-nums">
              <span>Level: {row.level}</span>
              <span>Path: {row.path}</span>
              <span>Received: {Number(row.receivedQty)}</span>
              <span>Reserved: {Number(row.reservedQty)}</span>
              <span>Issued: {Number(row.issuedQty)}</span>
              <span>
                Shortage:{" "}
                {row.remainingShortQty !== null
                  ? Number(row.remainingShortQty)
                  : "—"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Required qty" htmlFor="req-qty">
              <Input
                id="req-qty"
                type="number"
                min={0}
                step="any"
                value={requiredQty}
                onChange={(e) => setRequiredQty(e.target.value)}
              />
            </FieldGroup>
            <FieldGroup label="Gross required" htmlFor="gross-qty">
              <Input
                id="gross-qty"
                type="number"
                min={0}
                step="any"
                value={grossQty}
                onChange={(e) => setGrossQty(e.target.value)}
              />
            </FieldGroup>
          </div>

          <FieldGroup
            label="Available / QC-pass qty"
            htmlFor="avail-qty"
            hint="Số đã qua QC sẵn sàng cấp phát (qc_pass_qty)."
          >
            <Input
              id="avail-qty"
              type="number"
              min={0}
              step="any"
              value={availableQty}
              onChange={(e) => setAvailableQty(e.target.value)}
            />
          </FieldGroup>

          <FieldGroup
            label="Trạng thái"
            htmlFor="state"
            hint={
              isAdmin
                ? "Admin có thể bypass state machine."
                : "Chỉ chuyển theo state machine hợp lệ."
            }
          >
            <Select
              value={state || row.state}
              onValueChange={(v) => setState(v as BomSnapshotState)}
            >
              <SelectTrigger id="state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOM_SNAPSHOT_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {BOM_SNAPSHOT_STATE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>

          <FieldGroup label="Ghi chú" htmlFor="notes">
            <Textarea
              id="notes"
              rows={3}
              maxLength={2000}
              value={notes}
              placeholder="VD: Lô hàng lỗi, cần QC lại..."
              onChange={(e) => setNotes(e.target.value)}
            />
          </FieldGroup>
        </SheetBody>
        <SheetFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutate.isPending}
          >
            Huỷ
          </Button>
          <Button onClick={() => void handleSave()} disabled={mutate.isPending}>
            {mutate.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            )}
            Lưu thay đổi
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FieldGroup({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} uppercase>
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}
