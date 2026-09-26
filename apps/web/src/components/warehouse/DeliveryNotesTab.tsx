"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { FileText, Loader2, Plus, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/useSession";

/**
 * V4.0 Wave 3 Phase D — Tab "Phiếu giao hàng" (BBGH) trong hub Kho.
 *
 * Luồng: 1 warehouse_issue_request COMPLETED với reason=sales|return (xuất
 * bán/trả NCC) → Kho tạo phiếu giao hàng DRAFT → gửi (submit) → CHỈ Giám đốc
 * (admin) duyệt (CONFIRMED = BBGH chính thức) hoặc từ chối. Xuất nội bộ SX
 * (reason=production/manual/...) KHÔNG cần BBGH, không hiện ở đây.
 */

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ Giám đốc duyệt",
  CONFIRMED: "BBGH đã duyệt",
  REJECTED: "Bị từ chối",
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  PENDING_APPROVAL:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  CONFIRMED:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  REJECTED: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
};

interface DeliveryNoteRow {
  id: string;
  noteNo: string;
  status: string;
  recipientName: string;
  deliveryResult: string;
  issueRequestNo: string | null;
  deliveredByName: string | null;
  createdAt: string;
}

interface EligibleIssueRequest {
  id: string;
  requestNo: string;
  reason: string;
  reference: string | null;
  totalQty: string;
  createdAt: string;
}

export function DeliveryNotesTab() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isAdmin = session?.roles.includes("admin") ?? false;
  const [showCreate, setShowCreate] = React.useState(false);
  // V4.1 AD-05: link thông báo trỏ về ?tab=delivery-notes&id=… → cuộn tới phiếu.
  const focusId = useSearchParams()?.get("id") ?? null;

  const { data, isLoading, refetch } = useQuery<{ data: DeliveryNoteRow[] }>({
    queryKey: ["delivery-notes", "list"],
    queryFn: async () => {
      const res = await fetch("/api/warehouse/delivery-notes?pageSize=50");
      return res.json();
    },
    staleTime: 15_000,
  });

  const rows = data?.data ?? [];

  React.useEffect(() => {
    if (!focusId || rows.length === 0) return;
    document
      .getElementById(`delivery-note-${focusId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, rows.length]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["delivery-notes"] });
    void refetch();
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50/30 p-4 dark:bg-zinc-950/30 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
            <FileText className="h-4 w-4" /> Phiếu giao hàng / BBGH
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Xuất bán / trả hàng NCC — chỉ Giám đốc được phê duyệt thành BBGH
            chính thức.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Làm mới
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Tạo phiếu giao hàng
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          <Loader2 className="h-3 w-3 animate-spin" /> Đang tải…
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Chưa có phiếu giao hàng nào. Tạo từ 1 yêu cầu xuất kho đã hoàn tất
          (xuất bán / trả NCC).
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <DeliveryNoteRowItem
              key={r.id}
              row={r}
              isAdmin={isAdmin}
              highlighted={r.id === focusId}
              onChanged={invalidate}
            />
          ))}
        </ul>
      )}

      {showCreate ? (
        <CreateDeliveryNoteDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

function DeliveryNoteRowItem({
  row,
  isAdmin,
  highlighted,
  onChanged,
}: {
  row: DeliveryNoteRow;
  isAdmin: boolean;
  highlighted?: boolean;
  onChanged: () => void;
}) {
  const [acting, setActing] = React.useState(false);

  const handleSubmit = async () => {
    setActing(true);
    try {
      const res = await fetch(
        `/api/warehouse/delivery-notes/${row.id}/submit`,
        { method: "POST" },
      );
      const json = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!res.ok) {
        toast.error(json?.error?.message ?? "Lỗi gửi phiếu");
        return;
      }
      toast.success(`Đã gửi ${row.noteNo} chờ Giám đốc duyệt.`);
      onChanged();
    } finally {
      setActing(false);
    }
  };

  const handleApprove = async () => {
    if (!window.confirm(`Duyệt BBGH ${row.noteNo}?`)) return;
    setActing(true);
    try {
      const res = await fetch(
        `/api/warehouse/delivery-notes/${row.id}/approve`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      const json = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!res.ok) {
        toast.error(json?.error?.message ?? "Lỗi duyệt");
        return;
      }
      toast.success(`Đã duyệt BBGH ${row.noteNo}.`);
      onChanged();
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    const reason = window.prompt(`Lý do từ chối ${row.noteNo}?`);
    if (!reason || !reason.trim()) return;
    setActing(true);
    try {
      const res = await fetch(
        `/api/warehouse/delivery-notes/${row.id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!res.ok) {
        toast.error(json?.error?.message ?? "Lỗi từ chối");
        return;
      }
      toast.success(`Đã từ chối ${row.noteNo}.`);
      onChanged();
    } finally {
      setActing(false);
    }
  };

  return (
    <li
      id={`delivery-note-${row.id}`}
      className={cn(
        "rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900",
        highlighted && "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-zinc-950",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-sm font-bold text-indigo-900 dark:text-indigo-300">
              {row.noteNo}
            </code>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                STATUS_BADGE[row.status] ?? STATUS_BADGE.DRAFT,
              )}
            >
              {STATUS_LABEL[row.status] ?? row.status}
            </span>
            {row.issueRequestNo ? (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {row.issueRequestNo}
              </span>
            ) : null}
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
              {new Date(row.createdAt).toLocaleString("vi-VN")}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Bên nhận:{" "}
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              {row.recipientName}
            </span>
            {row.deliveredByName ? (
              <>
                {" "}
                · Người giao:{" "}
                <span className="font-medium">{row.deliveredByName}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {row.status === "DRAFT" ? (
            <Button size="sm" variant="outline" disabled={acting} onClick={handleSubmit}>
              Gửi duyệt
            </Button>
          ) : null}
          {row.status === "PENDING_APPROVAL" && isAdmin ? (
            <>
              <Button size="sm" disabled={acting} onClick={handleApprove}>
                Duyệt
              </Button>
              <Button size="sm" variant="destructive" disabled={acting} onClick={handleReject}>
                Từ chối
              </Button>
            </>
          ) : null}
          {row.status === "PENDING_APPROVAL" && !isAdmin ? (
            <span className="text-[11px] italic text-zinc-500 dark:text-zinc-400">
              Chờ Giám đốc duyệt
            </span>
          ) : null}
          <a
            href={`/api/warehouse/delivery-notes/${row.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <FileText className="h-3.5 w-3.5" /> PDF
          </a>
        </div>
      </div>
    </li>
  );
}

function CreateDeliveryNoteDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { data, isLoading } = useQuery<{ data: EligibleIssueRequest[] }>({
    queryKey: ["issue-request", "completed-eligible-for-dn"],
    queryFn: async () => {
      const res = await fetch(
        "/api/warehouse/issue-request?status=COMPLETED&pageSize=100",
      );
      return res.json();
    },
    staleTime: 10_000,
  });

  const [issueRequestId, setIssueRequestId] = React.useState("");
  const [recipientName, setRecipientName] = React.useState("");
  const [recipientAddress, setRecipientAddress] = React.useState("");
  const [recipientContactName, setRecipientContactName] = React.useState("");
  const [recipientPhone, setRecipientPhone] = React.useState("");
  const [vehiclePlate, setVehiclePlate] = React.useState("");
  const [carrierName, setCarrierName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const eligible = (data?.data ?? []).filter((r) =>
    ["sales", "return"].includes(r.reason),
  );

  const handleCreate = async () => {
    if (!issueRequestId) {
      toast.error("Chọn yêu cầu xuất kho nguồn.");
      return;
    }
    if (!recipientName.trim()) {
      toast.error("Nhập tên bên nhận.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/warehouse/delivery-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueRequestId,
          recipientName: recipientName.trim(),
          recipientAddress: recipientAddress.trim() || null,
          recipientContactName: recipientContactName.trim() || null,
          recipientPhone: recipientPhone.trim() || null,
          vehiclePlate: vehiclePlate.trim() || null,
          carrierName: carrierName.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: { noteNo: string }; error?: { message?: string } }
        | null;
      if (!res.ok || !json?.data) {
        toast.error(json?.error?.message ?? "Không tạo được phiếu");
        return;
      }
      toast.success(`Đã tạo phiếu giao hàng ${json.data.noteNo}.`);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-dialog flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
        <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-50">
          <Truck className="h-4 w-4" /> Tạo phiếu giao hàng
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Chỉ áp dụng cho yêu cầu xuất kho đã hoàn tất (COMPLETED) với lý do
          xuất bán / trả hàng NCC.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Yêu cầu xuất kho nguồn
            </label>
            {isLoading ? (
              <p className="text-xs text-zinc-500">Đang tải…</p>
            ) : eligible.length === 0 ? (
              <p className="text-xs italic text-zinc-500 dark:text-zinc-400">
                Không có yêu cầu xuất kho nào đủ điều kiện (COMPLETED +
                reason=sales/return, chưa có phiếu giao hàng).
              </p>
            ) : (
              <select
                className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={issueRequestId}
                onChange={(e) => setIssueRequestId(e.target.value)}
              >
                <option value="">— Chọn —</option>
                {eligible.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.requestNo} · {r.reason} · SL {Number(r.totalQty).toLocaleString("vi-VN")}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Tên bên nhận *
            </label>
            <Input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Tên khách hàng / nhà cung cấp nhận trả hàng"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Địa chỉ nhận hàng
            </label>
            <Input
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Người đại diện nhận
              </label>
              <Input
                value={recipientContactName}
                onChange={(e) => setRecipientContactName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                SĐT liên hệ
              </label>
              <Input
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Biển số xe
              </label>
              <Input
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Người vận chuyển
              </label>
              <Input
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Tạo phiếu
          </Button>
        </div>
      </div>
    </div>
  );
}
