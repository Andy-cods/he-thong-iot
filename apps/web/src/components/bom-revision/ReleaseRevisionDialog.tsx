"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { useReleaseRevision } from "@/hooks/useBomRevisions";

/**
 * ReleaseRevisionDialog — type-to-confirm "RELEASE" để đóng băng BOM template.
 *
 * Cảnh báo: sau khi release, template auto-promote ACTIVE (nếu đang DRAFT)
 * và không sửa lines được (immutable). Revision_no R01, R02, ... auto.
 */
export interface ReleaseRevisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  templateCode: string;
  /** Revision_no dự kiến (e.g. "R02") — chỉ hiển thị, không gửi server. */
  nextRevisionNoHint?: string;
  onReleased?: (revisionId: string, revisionNo: string) => void;
}

const CONFIRM_KEYWORD = "RELEASE";

export function ReleaseRevisionDialog({
  open,
  onOpenChange,
  templateId,
  templateCode,
  nextRevisionNoHint,
  onReleased,
}: ReleaseRevisionDialogProps) {
  const [typed, setTyped] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const release = useReleaseRevision(templateId);

  React.useEffect(() => {
    if (!open) {
      setTyped("");
      setNotes("");
    }
  }, [open]);

  const disabled = typed !== CONFIRM_KEYWORD || release.isPending;

  const handleSubmit = async () => {
    if (disabled) return;
    try {
      const res = await release.mutateAsync({
        notes: notes.trim().length > 0 ? notes.trim() : null,
      });
      toast.success(
        `Đã release ${res.data.revisionNo} cho BOM ${templateCode}.`,
      );
      onReleased?.(res.data.id, res.data.revisionNo);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Release thất bại");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" role="alertdialog">
        <DialogHeader>
          <DialogTitle>
            Release revision{" "}
            {nextRevisionNoHint ? (
              <span className="font-mono">{nextRevisionNoHint}</span>
            ) : (
              "mới"
            )}{" "}
            cho <span className="font-mono">{templateCode}</span>?
          </DialogTitle>
          <DialogDescription>
            Revision sẽ đóng băng toàn bộ cây linh kiện hiện tại. Các đơn hàng
            sau này explode sẽ dùng bản này.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-medium">Sau khi release:</p>
            <ul className="list-disc pl-4 text-xs text-amber-700">
              <li>Template chuyển sang ACTIVE (nếu đang DRAFT).</li>
              <li>
                Không sửa lines trong template nữa — muốn sửa phải clone hoặc
                release revision tiếp theo.
              </li>
              <li>Snapshot đã explode trước đó không bị ảnh hưởng.</li>
            </ul>
          </div>
        </div>

        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor="release-notes" uppercase>
              Ghi chú (tuỳ chọn)
            </Label>
            <Textarea
              id="release-notes"
              rows={3}
              maxLength={2000}
              placeholder="VD: Cập nhật thép tấm SS400 → Q345B theo yêu cầu KH..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="release-confirm" uppercase required>
              Gõ{" "}
              <span className="font-mono font-semibold text-red-700">
                {CONFIRM_KEYWORD}
              </span>{" "}
              để xác nhận
            </Label>
            <Input
              id="release-confirm"
              autoComplete="off"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value.toUpperCase())}
              aria-label={`Gõ ${CONFIRM_KEYWORD} để xác nhận`}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={release.isPending}
          >
            Huỷ
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={disabled}>
            {release.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Đang release...
              </>
            ) : (
              "Release revision"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
