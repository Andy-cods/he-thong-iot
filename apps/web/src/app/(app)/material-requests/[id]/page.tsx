"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Package,
  Truck,
  XCircle,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "PENDING" | "PICKING" | "READY" | "DELIVERED" | "CANCELLED";

interface DetailResp {
  data: {
    id: string;
    requestNo: string;
    status: Status;
    requestedBy: string;
    requestedByName: string | null;
    requestedByUsername: string | null;
    notes: string | null;
    warehouseNotes: string | null;
    createdAt: string;
    pickedAt: string | null;
    readyAt: string | null;
    deliveredAt: string | null;
    lines: Array<{
      id: string;
      lineNo: number;
      itemId: string;
      itemSku: string | null;
      itemName: string | null;
      itemUom: string | null;
      requestedQty: string;
      pickedQty: string;
      deliveredQty: string;
      notes: string | null;
    }>;
  };
}

const STATUS_PILL: Record<Status, { label: string; cls: string; dot: string; icon: React.ElementType }> = {
  PENDING:   { label: "Chờ chuẩn bị",   cls: "bg-amber-50 text-amber-700 ring-amber-200",    dot: "bg-amber-500 animate-pulse",  icon: Clock        },
  PICKING:   { label: "Đang chuẩn bị",  cls: "bg-blue-50 text-blue-700 ring-blue-200",        dot: "bg-blue-500 animate-pulse",   icon: Package      },
  READY:     { label: "Đã sẵn sàng",    cls: "bg-violet-50 text-violet-700 ring-violet-200",  dot: "bg-violet-500",               icon: CheckCircle2 },
  DELIVERED: { label: "Đã giao",        cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500",            icon: Truck        },
  CANCELLED: { label: "Đã huỷ",         cls: "bg-zinc-100 text-zinc-500 ring-zinc-200",       dot: "bg-zinc-400",                 icon: XCircle      },
};

export default function MaterialRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const query = useQuery<DetailResp>({
    queryKey: ["material-request", id],
    queryFn: async () => {
      const res = await fetch(`/api/material-requests/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 10_000,
  });

  const transition = useMutation({
    mutationFn: async (to: Status) => {
      const res = await fetch(`/api/material-requests/${id}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? "Transition failed");
      return body;
    },
    onSuccess: (_, to) => {
      toast.success(`Đã chuyển sang ${STATUS_PILL[to].label}`);
      qc.invalidateQueries({ queryKey: ["material-request", id] });
      qc.invalidateQueries({ queryKey: ["material-requests"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Lỗi chuyển trạng thái");
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Đang tải…
      </div>
    );
  }
  if (query.isError || !query.data?.data) {
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-semibold text-red-700">Không tìm thấy yêu cầu</p>
        <p className="mt-1 text-xs text-red-600">
          {(query.error as Error)?.message ?? "Hoặc bạn không có quyền xem."}
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/material-requests">Về danh sách</Link>
        </Button>
      </div>
    );
  }

  const r = query.data.data;
  const cfg = STATUS_PILL[r.status];

  return (
    <div className="flex h-full flex-col bg-zinc-50/30">
      <header className="border-b border-zinc-200 bg-white px-6 py-5">
        <Link
          href="/material-requests"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-indigo-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Về danh sách yêu cầu
        </Link>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100">
              <FileText className="h-6 w-6 text-indigo-700" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                {r.requestNo}
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500">
                Yêu cầu vật tư từ kho · {r.requestedByName || r.requestedByUsername || "—"}
              </p>
            </div>
          </div>
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset",
            cfg.cls,
          )}>
            <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
            {cfg.label}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-5">
          {/* Timeline */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900 mb-4">Hành trình</h2>
            <div className="space-y-3">
              <TimelineRow icon={FileText} label="Tạo yêu cầu" at={r.createdAt} done />
              <TimelineRow icon={Package} label="Bắt đầu chuẩn bị" at={r.pickedAt} done={!!r.pickedAt} />
              <TimelineRow icon={CheckCircle2} label="Sẵn sàng giao" at={r.readyAt} done={!!r.readyAt} />
              <TimelineRow icon={Truck} label="Đã giao" at={r.deliveredAt} done={!!r.deliveredAt} />
            </div>
          </section>

          {/* Lines table */}
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 bg-zinc-50/60 px-5 py-3">
              <h2 className="text-sm font-semibold text-zinc-900">Linh kiện ({r.lines.length} dòng)</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 w-12">#</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">SKU</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Tên</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Yêu cầu</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Đã chuẩn bị</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Đã giao</th>
                </tr>
              </thead>
              <tbody>
                {r.lines.map((l) => (
                  <tr key={l.id} className="border-b border-zinc-50">
                    <td className="px-5 py-3 text-sm text-zinc-500">{l.lineNo}</td>
                    <td className="px-5 py-3 font-mono text-sm font-semibold text-indigo-600">
                      {l.itemSku ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-sm text-zinc-700">{l.itemName ?? "—"}</td>
                    <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-zinc-800">
                      {Number(l.requestedQty).toLocaleString("vi-VN")}
                      {l.itemUom && <span className="ml-1 text-xs font-normal text-zinc-500">{l.itemUom}</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-blue-700">
                      {Number(l.pickedQty).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-emerald-700">
                      {Number(l.deliveredQty).toLocaleString("vi-VN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Notes */}
          {(r.notes || r.warehouseNotes) && (
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {r.notes && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Ghi chú từ engineer</p>
                  <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">{r.notes}</p>
                </div>
              )}
              {r.warehouseNotes && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Ghi chú từ kho</p>
                  <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">{r.warehouseNotes}</p>
                </div>
              )}
            </section>
          )}

          {/* Actions */}
          <section className="flex flex-wrap items-center justify-end gap-2">
            {r.status === "PENDING" && (
              <>
                <Button
                  variant="outline"
                  className="border-blue-200 text-blue-700 hover:bg-blue-50"
                  onClick={() => transition.mutate("PICKING")}
                  disabled={transition.isPending}
                >
                  <Package className="h-4 w-4" /> Bắt đầu chuẩn bị
                </Button>
                <Button
                  variant="outline"
                  className="border-violet-200 text-violet-700 hover:bg-violet-50"
                  onClick={() => transition.mutate("READY")}
                  disabled={transition.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" /> Đánh dấu sẵn sàng
                </Button>
              </>
            )}
            {r.status === "PICKING" && (
              <Button
                variant="outline"
                className="border-violet-200 text-violet-700 hover:bg-violet-50"
                onClick={() => transition.mutate("READY")}
                disabled={transition.isPending}
              >
                <CheckCircle2 className="h-4 w-4" /> Đánh dấu sẵn sàng
              </Button>
            )}
            {r.status === "READY" && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => transition.mutate("DELIVERED")}
                disabled={transition.isPending}
              >
                <Check className="h-4 w-4" /> Xác nhận đã nhận
              </Button>
            )}
            {(r.status === "PENDING" || r.status === "PICKING") && (
              <Button
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => transition.mutate("CANCELLED")}
                disabled={transition.isPending}
              >
                <XCircle className="h-4 w-4" /> Huỷ yêu cầu
              </Button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  icon: Icon,
  label,
  at,
  done,
}: {
  icon: React.ElementType;
  label: string;
  at: string | null;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg",
        done ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-400",
      )}>
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="flex-1">
        <p className={cn("text-sm font-medium", done ? "text-zinc-900" : "text-zinc-500")}>
          {label}
        </p>
        {at ? (
          <p className="text-xs text-zinc-500">
            {new Date(at).toLocaleString("vi-VN", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </p>
        ) : (
          <p className="text-xs text-zinc-400">Chưa thực hiện</p>
        )}
      </div>
    </div>
  );
}
