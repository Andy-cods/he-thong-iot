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
import { DateField } from "@/components/ui/date-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isValidYmd } from "@iot/shared";
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
  /**
   * BOM đang Nháp → release này KÍCH HOẠT BOM (→ Đang dùng) và hệ thống tự
   * thêm dòng lên Bảng sản xuất: hiện thêm 3 ô tuỳ chọn (hạn / RFQ / khách).
   */
  activates?: boolean;
  onReleased?: (revisionId: string, revisionNo: string) => void;
}

const CONFIRM_KEYWORD = "RELEASE";

export function ReleaseRevisionDialog({
  open,
  onOpenChange,
  templateId,
  templateCode,
  nextRevisionNoHint,
  activates = false,
  onReleased,
}: ReleaseRevisionDialogProps) {
  const [typed, setTyped] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [rfqNo, setRfqNo] = React.useState("");
  const [customer, setCustomer] = React.useState("");
  const release = useReleaseRevision(templateId);

  React.useEffect(() => {
    if (!open) {
      setTyped("");
      setNotes("");
      setDeadline("");
      setRfqNo("");
      setCustomer("");
    }
  }, [open]);

  const disabled = typed !== CONFIRM_KEYWORD || release.isPending;

  const handleSubmit = async () => {
    if (disabled) return;
    if (activates && deadline && !isValidYmd(deadline)) {
      toast.error("Ngày cần giao không hợp lệ (cần ngày có thật).");
      return;
    }
    try {
      const res = await release.mutateAsync({
        notes: notes.trim().length > 0 ? notes.trim() : null,
        ...(activates
          ? {
              board: {
                deadline: deadline || null,
                rfqNo: rfqNo.trim() || null,
                customer: customer.trim() || null,
              },
            }
          : {}),
      });
      toast.success(
        `Đã release ${res.data.revisionNo} cho BOM ${templateCode}.`,
      );
      const b = res.board;
      if (res.boardError) {
        toast.error(res.boardError, { duration: 12000 });
      } else if (b && b.action === "created") {
        toast.success(
          `Đã thêm ${b.productCode} lên Bảng sản xuất (Chờ GC)${b.hasDeadline ? "." : " — QC sẽ điền ngày giao."}`,
        );
      } else if (b && (b.action === "linked" || b.action === "updated")) {
        toast.info(`Bảng sản xuất đã có ${b.productCode} — đã liên kết với BOM này.`);
      } else if (b && b.action === "skipped") {
        toast.warning(b.reason);
      }
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

        {/* V4.4 D1 (tự phát hiện) — khối cảnh báo 0 class dark: trong file. */}
        <div className="flex items-start gap-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-medium">Sau khi release:</p>
            <ul className="list-disc pl-4 text-xs text-amber-700 dark:text-amber-400">
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

          {activates && (
            <fieldset className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
              <legend className="px-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Bảng sản xuất (tuỳ chọn)
              </legend>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                BOM sẽ tự lên Bảng sản xuất ở trạng thái Chờ GC. Bỏ trống được — Tổ QC điền sau.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="release-deadline">Ngày cần giao</Label>
                  <DateField id="release-deadline" value={deadline} onChange={setDeadline} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="release-rfq">Số QT/RFQ</Label>
                  <Input
                    id="release-rfq"
                    value={rfqNo}
                    maxLength={64}
                    onChange={(e) => setRfqNo(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="release-customer">Khách hàng</Label>
                  <Input
                    id="release-customer"
                    value={customer}
                    maxLength={64}
                    onChange={(e) => setCustomer(e.target.value)}
                  />
                </div>
              </div>
            </fieldset>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="release-confirm" uppercase required>
              Gõ{" "}
              <span className="font-mono font-semibold text-red-700 dark:text-red-400">
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
