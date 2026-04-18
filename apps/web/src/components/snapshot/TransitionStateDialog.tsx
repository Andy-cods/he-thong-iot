"use client";

import * as React from "react";
import { ArrowRight, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  BOM_SNAPSHOT_STATE_LABELS,
  type BomSnapshotState,
  validTransitionsFrom,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StateMachineBadge } from "@/components/snapshot/StateMachineBadge";
import { useTransitionState } from "@/hooks/useSnapshots";

/**
 * TransitionStateDialog — đổi state snapshot line.
 *
 * - Chỉ show toState hợp lệ (theo validTransitionsFrom).
 * - adminOverride checkbox chỉ hiện với admin → mở rộng tới mọi state trừ
 *   CLOSED final (server double-check role).
 * - actionNote required (min 3 chars).
 * - Preview "Chuyển {fromLabel} → {toLabel}" với warn icon.
 * - Submit qua useTransitionState (optimistic).
 */

export interface TransitionStateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineId: string;
  orderCode: string;
  currentState: BomSnapshotState;
  versionLock: number;
  componentSku: string;
  componentName: string;
  /** True nếu user hiện tại là admin → hiện option override. */
  isAdmin?: boolean;
}

export function TransitionStateDialog({
  open,
  onOpenChange,
  lineId,
  orderCode,
  currentState,
  versionLock,
  componentSku,
  componentName,
  isAdmin = false,
}: TransitionStateDialogProps) {
  const [toState, setToState] = React.useState<BomSnapshotState | "">("");
  const [actionNote, setActionNote] = React.useState("");
  const [override, setOverride] = React.useState(false);

  const transition = useTransitionState(lineId, orderCode);

  React.useEffect(() => {
    if (!open) {
      setToState("");
      setActionNote("");
      setOverride(false);
    }
  }, [open]);

  const options = React.useMemo(
    () => validTransitionsFrom(currentState, { adminOverride: override }),
    [currentState, override],
  );

  const disabled =
    !toState ||
    actionNote.trim().length < 3 ||
    transition.isPending;

  const handleSubmit = async () => {
    if (disabled || !toState) return;
    try {
      await transition.mutateAsync({
        toState: toState as BomSnapshotState,
        actionNote: actionNote.trim(),
        versionLock,
        adminOverride: override,
      });
      toast.success(
        `Đã chuyển ${componentSku} → ${BOM_SNAPSHOT_STATE_LABELS[toState as BomSnapshotState]}`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Chuyển trạng thái thất bại");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Chuyển trạng thái snapshot line</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-zinc-700">{componentSku}</span> —{" "}
            {componentName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-sm border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              Hiện tại:
            </span>
            <StateMachineBadge state={currentState} size="sm" />
            {toState && (
              <>
                <ArrowRight
                  className="h-3.5 w-3.5 text-zinc-400"
                  aria-hidden="true"
                />
                <StateMachineBadge
                  state={toState as BomSnapshotState}
                  size="sm"
                />
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="to-state" uppercase required>
              Chuyển sang
            </Label>
            <Select
              value={toState}
              onValueChange={(v) => setToState(v as BomSnapshotState)}
            >
              <SelectTrigger id="to-state" aria-label="Chọn state đích">
                <SelectValue placeholder="— Chọn trạng thái đích —" />
              </SelectTrigger>
              <SelectContent>
                {options.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-zinc-500">
                    Không có transition hợp lệ từ{" "}
                    {BOM_SNAPSHOT_STATE_LABELS[currentState]}.
                  </div>
                ) : (
                  options.map((s) => (
                    <SelectItem key={s} value={s}>
                      {BOM_SNAPSHOT_STATE_LABELS[s]}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="action-note" uppercase required>
              Ghi chú thao tác
            </Label>
            <Textarea
              id="action-note"
              rows={2}
              maxLength={500}
              placeholder="VD: QC pass 100% batch PO-2604-0012, đã kiểm kích thước."
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
            />
          </div>

          {isAdmin && (
            <label className="flex items-start gap-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-label="Admin override transition rules"
              />
              <span className="flex-1">
                <span className="flex items-center gap-1 font-medium">
                  <AlertTriangle
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                  Admin override
                </span>
                <span className="text-xs text-amber-700">
                  Bỏ qua state machine rule. Mọi transition ngoại trừ từ
                  CLOSED đều cho phép. Audit log sẽ đánh dấu [ADMIN OVERRIDE].
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={transition.isPending}
          >
            Huỷ
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={disabled}>
            {transition.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Đang chuyển...
              </>
            ) : (
              "Chuyển trạng thái"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
