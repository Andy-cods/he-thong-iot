"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock,
  FileText,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { POApprovalMetadata, POStatus } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/useSession";
import {
  useApprovePO,
  useRejectPO,
  useSendPurchaseOrder,
  useSubmitPOApproval,
} from "@/hooks/usePurchaseOrders";
import { formatDate } from "@/lib/format";

interface TimelineStep {
  key: string;
  label: string;
  actor?: string | null;
  at?: string | null;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "success" | "warning" | "danger" | "muted";
}

export interface PoApprovalWorkflowProps {
  poId: string;
  status: POStatus;
  metadata: POApprovalMetadata | null | undefined;
  createdAt: string;
  sentAt: string | null;
  cancelledAt: string | null;
}

export function PoApprovalWorkflow({
  poId,
  status,
  metadata,
  createdAt,
  sentAt,
  cancelledAt,
}: PoApprovalWorkflowProps) {
  const session = useSession();
  const roles = session.data?.roles ?? [];
  const isAdmin = roles.includes("admin");

  const submit = useSubmitPOApproval(poId);
  const approve = useApprovePO(poId);
  const reject = useRejectPO(poId);
  const send = useSendPurchaseOrder(poId);

  const [rejectReason, setRejectReason] = React.useState("");
  const [rejectOpen, setRejectOpen] = React.useState(false);

  const approvalStatus = metadata?.approvalStatus;

  const handleSubmit = async () => {
    try {
      await submit.mutateAsync();
      toast.success("Đã gửi PO để duyệt.");
    } catch (err) {
      toast.error(`Gửi duyệt thất bại: ${(err as Error).message}`);
    }
  };

  const handleApprove = async () => {
    try {
      await approve.mutateAsync({ notes: null });
      toast.success("Đã duyệt PO.");
    } catch (err) {
      toast.error(`Duyệt thất bại: ${(err as Error).message}`);
    }
  };

  const handleReject = async () => {
    if (rejectReason.trim().length < 3) {
      toast.error("Lý do từ chối tối thiểu 3 ký tự.");
      return;
    }
    try {
      await reject.mutateAsync({ reason: rejectReason.trim() });
      toast.success("Đã từ chối PO.");
      setRejectOpen(false);
      setRejectReason("");
    } catch (err) {
      toast.error(`Từ chối thất bại: ${(err as Error).message}`);
    }
  };

  const handleSend = async () => {
    try {
      await send.mutateAsync();
      toast.success("Đã gửi PO tới NCC (stub).");
    } catch (err) {
      toast.error(`Gửi NCC thất bại: ${(err as Error).message}`);
    }
  };

  // Build timeline
  const steps: TimelineStep[] = [
    {
      key: "created",
      label: "Tạo PO",
      at: createdAt,
      icon: FileText,
      tone: "default",
    },
  ];
  if (metadata?.submittedAt) {
    steps.push({
      key: "submitted",
      label: "Gửi duyệt",
      at: metadata.submittedAt,
      actor: metadata.submittedBy,
      icon: Clock,
      tone: "warning",
    });
  }
  if (approvalStatus === "approved" && metadata?.approvedAt) {
    steps.push({
      key: "approved",
      label: "Đã duyệt",
      at: metadata.approvedAt,
      actor: metadata.approvedBy,
      icon: CheckCircle2,
      tone: "success",
    });
  }
  if (approvalStatus === "rejected" && metadata?.rejectedAt) {
    steps.push({
      key: "rejected",
      label: `Từ chối: ${metadata.rejectedReason ?? ""}`,
      at: metadata.rejectedAt,
      actor: metadata.rejectedBy,
      icon: XCircle,
      tone: "danger",
    });
  }
  if (sentAt) {
    steps.push({
      key: "sent",
      label: "Gửi NCC",
      at: sentAt,
      icon: Send,
      tone: "default",
    });
  }
  if (cancelledAt) {
    steps.push({
      key: "cancelled",
      label: "Đã huỷ",
      at: cancelledAt,
      icon: XCircle,
      tone: "muted",
    });
  }

  const toneCls: Record<TimelineStep["tone"], string> = {
    default: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
    danger: "bg-red-50 text-red-700 ring-red-200",
    muted: "bg-zinc-50 text-zinc-400 ring-zinc-100",
  };

  // Available actions
  const canSubmit =
    status === "DRAFT" && !approvalStatus && !isAdmin; // planner submit
  const canSelfApproveAsAdmin =
    status === "DRAFT" && approvalStatus !== "approved" && isAdmin;
  const canApprovePending =
    status === "DRAFT" && approvalStatus === "pending" && isAdmin;
  const canSend =
    status === "DRAFT" && approvalStatus === "approved" && isAdmin;

  return (
    <div className="space-y-4">
      {/* Timeline */}
      <ol className="space-y-2">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <li
              key={s.key}
              className={`flex items-start gap-3 rounded-md px-3 py-2 ring-1 ${toneCls[s.tone]}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{s.label}</div>
                <div className="text-xs opacity-75">
                  {s.at ? formatDate(s.at, "dd/MM/yyyy HH:mm") : "—"}
                  {s.actor ? ` · ${s.actor.slice(0, 8)}…` : ""}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3">
        {canSubmit && (
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={submit.isPending}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Gửi duyệt
          </Button>
        )}
        {(canApprovePending || canSelfApproveAsAdmin) && (
          <Button
            size="sm"
            onClick={() => void handleApprove()}
            disabled={approve.isPending}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Duyệt PO
          </Button>
        )}
        {(canApprovePending || canSelfApproveAsAdmin) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRejectOpen((v) => !v)}
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Từ chối
          </Button>
        )}
        {canSend && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleSend()}
            disabled={send.isPending}
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            Gửi NCC
          </Button>
        )}
        {status !== "DRAFT" && !canSend && (
          <span className="text-xs text-zinc-500">
            PO đã {status} — không còn action approval.
          </span>
        )}
      </div>

      {rejectOpen && (
        <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
          <label className="text-xs font-medium text-red-900">
            Lý do từ chối
          </label>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Nhập lý do..."
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRejectOpen(false);
                setRejectReason("");
              }}
            >
              Huỷ
            </Button>
            <Button
              size="sm"
              onClick={() => void handleReject()}
              disabled={reject.isPending}
            >
              Xác nhận từ chối
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
