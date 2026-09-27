/**
 * V4.1 PO-UI: logic THUẦN của trang chi tiết PO (quyền thao tác theo trạng thái,
 * tiến trình, đọc số kiểu VN). Không import React/DB → vitest dùng thẳng.
 */

import { isPoPriceEditableStatus } from "./procurement-policy";

export interface PoFlagInput {
  status: string;
  approvalStatus?: "pending" | "approved" | "rejected" | null;
  roles: readonly string[];
  lines: ReadonlyArray<{ receivedQty: number | string }>;
  /** Trạng thái HĐ mua đang hoạt động (null = chưa có / chưa tải). */
  invoiceStatus?: string | null;
}

export interface PoFlags {
  isDraft: boolean;
  isAdmin: boolean;
  /** Sửa PO (DRAFT: toàn bộ; SENT: Ngày dự kiến + Ghi chú). */
  canEdit: boolean;
  canSubmitApproval: boolean;
  canApprove: boolean;
  canMarkSent: boolean;
  canReceive: boolean;
  canCancel: boolean;
  canClose: boolean;
  invoiceable: boolean;
  canSeeInvoice: boolean;
  /** Người dùng có quyền giá + PO chưa huỷ (chưa xét HĐ). */
  canPriceRole: boolean;
  /** Lý do khoá "Điều chỉnh giá" (null = được sửa). */
  priceLockReason: string | null;
}

export function derivePoFlags(input: PoFlagInput): PoFlags {
  const { status, roles } = input;
  const approval = input.approvalStatus ?? null;
  const isAdmin = roles.includes("admin");
  const isPurchaser = roles.includes("purchaser");
  const canManage = isAdmin || isPurchaser || roles.includes("planner");
  const canTransition = isAdmin || isPurchaser;
  const isDraft = status === "DRAFT";
  const isSent = status === "SENT";
  const draftOpen = isDraft && (!approval || approval === "rejected");
  const hasReceipts = input.lines.some((l) => Number(l.receivedQty) > 0);
  const canPriceRole = (isAdmin || isPurchaser) && isPoPriceEditableStatus(status);

  let priceLockReason: string | null = null;
  if (!isPoPriceEditableStatus(status)) {
    priceLockReason = "PO đã huỷ — không điều chỉnh giá.";
  } else if (!(isAdmin || isPurchaser)) {
    priceLockReason = "Chỉ Bộ phận Thu mua hoặc Giám đốc được sửa đơn giá / VAT.";
  } else if (
    input.invoiceStatus &&
    input.invoiceStatus !== "DRAFT" &&
    input.invoiceStatus !== "CANCELLED"
  ) {
    priceLockReason = "PO đã có hoá đơn mua đã ghi công nợ — điều chỉnh trên hoá đơn.";
  }

  return {
    isDraft,
    isAdmin,
    canEdit: canManage && (draftOpen || isSent),
    canSubmitApproval: canManage && draftOpen,
    canApprove: isAdmin && isDraft && approval === "pending",
    canMarkSent: canTransition && isDraft && approval === "approved",
    canReceive: isSent || status === "PARTIAL",
    canCancel: canTransition && (isDraft || isSent) && !hasReceipts && approval !== "pending",
    canClose: canTransition && (status === "PARTIAL" || status === "RECEIVED"),
    invoiceable: status === "PARTIAL" || status === "RECEIVED" || status === "CLOSED",
    canSeeInvoice: isAdmin || isPurchaser || roles.includes("accountant"),
    canPriceRole,
    priceLockReason,
  };
}

/* ── Tiến trình PO (mini stepper) ─────────────────────────────────────────── */

export type PoStepState = "done" | "current" | "todo" | "rejected" | "cancelled" | "skipped";

export interface PoStep {
  key: "created" | "submitted" | "approved" | "sent" | "received" | "closed" | "cancelled";
  label: string;
  state: PoStepState;
  at?: string | null;
  actorId?: string | null;
  note?: string | null;
}

export interface PoStepInput {
  status: string;
  createdAt: string;
  sentAt?: string | null;
  cancelledAt?: string | null;
  actualDeliveryDate?: string | null;
  metadata?: Record<string, unknown> | null;
  /** % SL đã nhận (0–100) để ghi chú bước Nhận hàng. */
  receivedPct?: number;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * Tạo → Gửi duyệt → Duyệt → Gửi NCC → Nhận hàng → Đóng. PO cũ gửi NCC không
 * qua duyệt → 2 bước duyệt "bỏ qua". PO huỷ → bước "Đã huỷ" thay phần còn lại.
 */
export function buildPoSteps(input: PoStepInput): PoStep[] {
  const m = input.metadata ?? {};
  const approval = str(m.approvalStatus);
  const s = input.status;
  const sent = !!input.sentAt || ["SENT", "PARTIAL", "RECEIVED", "CLOSED"].includes(s);
  const received = s === "RECEIVED" || s === "CLOSED";
  const cancelled = s === "CANCELLED";

  const steps: PoStep[] = [
    { key: "created", label: "Tạo PO", state: "done", at: input.createdAt },
  ];

  const submittedAt = str(m.submittedAt);
  steps.push({
    key: "submitted",
    label: "Gửi duyệt",
    state: submittedAt ? "done" : sent ? "skipped" : cancelled ? "todo" : "current",
    at: submittedAt,
    actorId: str(m.submittedBy),
  });

  if (approval === "rejected") {
    steps.push({
      key: "approved",
      label: "Bị từ chối",
      state: "rejected",
      at: str(m.rejectedAt),
      actorId: str(m.rejectedBy),
      note: str(m.rejectedReason),
    });
  } else {
    steps.push({
      key: "approved",
      label: m.autoApproved ? "Duyệt (tự động)" : "Duyệt",
      state:
        approval === "approved"
          ? "done"
          : approval === "pending"
            ? "current"
            : sent
              ? "skipped"
              : "todo",
      at: str(m.approvedAt),
      actorId: str(m.approvedBy),
    });
  }

  if (cancelled) {
    steps.push({
      key: "cancelled",
      label: "Đã huỷ",
      state: "cancelled",
      at: input.cancelledAt ?? null,
      actorId: str(m.cancelledBy),
      note: str(m.cancelledReason),
    });
    return steps;
  }

  steps.push({
    key: "sent",
    label: "Gửi NCC",
    state: sent ? "done" : approval === "approved" ? "current" : "todo",
    at: input.sentAt ?? null,
  });
  steps.push({
    key: "received",
    label: "Nhận hàng",
    state: received ? "done" : sent ? "current" : "todo",
    at: received ? (input.actualDeliveryDate ?? null) : null,
    note:
      s === "PARTIAL" && input.receivedPct !== undefined
        ? `Đã nhận ${input.receivedPct}%`
        : null,
  });
  steps.push({
    key: "closed",
    label: "Đóng",
    state: s === "CLOSED" ? "done" : "todo",
    at: s === "CLOSED" ? str(m.closedAt) : null,
    actorId: s === "CLOSED" ? str(m.closedBy) : null,
    note: s === "CLOSED" ? str(m.closedReason) : null,
  });
  return steps;
}

/* ── Nhập số kiểu VN ─────────────────────────────────────────────────────── */

/**
 * Đọc số người dùng gõ: "1.500.000" → 1500000, "1500000" → 1500000,
 * "12,5" → 12.5, "1.234,56" → 1234.56, "1.5" → 1.5. Rỗng / sai → null.
 */
export function parseVnNumber(raw: string): number | null {
  const s = raw.replace(/[\s₫đ]/gi, "");
  if (s === "") return null;
  let normalized: string;
  if (s.includes(",") && s.includes(".")) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(s) && s.split(",").length > 2
      ? s.replace(/,/g, "")
      : s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, "");
  } else {
    normalized = s;
  }
  if (!/^-?\d*(\.\d+)?$/.test(normalized) || normalized === "" || normalized === "-") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
