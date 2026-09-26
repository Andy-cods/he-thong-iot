"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Factory,
  FileText,
  Loader2,
  Package,
  PackageCheck,
  Truck,
  XCircle,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { can } from "@iot/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { GoodsIssuePanel } from "@/components/warehouse/GoodsIssuePanel";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

/**
 * V3.3 — Chi tiết phiếu yêu cầu vật tư.
 *
 * V4.1 Đợt 1b (Q3/KHO-04/KHO-17/KHO-25):
 *  - Giao vật tư CHỈ bằng "Lập phiếu xuất kho" (trừ tồn + chứng từ PX), giao
 *    từng phần được → trạng thái "Giao một phần" (PARTIAL). Bỏ nút "Xác nhận
 *    đã nhận" (trước đây chỉ đổi trạng thái, KHÔNG trừ tồn).
 *  - Danh sách phiếu xuất đã lập; nút "Đóng phiếu" khi đang giao dở.
 *  - Nút hiện theo quyền RBAC matrix (không hiện cho người không làm được).
 */

type Status = "PENDING" | "PICKING" | "READY" | "PARTIAL" | "DELIVERED" | "CANCELLED";

interface GoodsIssueSummary {
  id: string;
  issueNo: string;
  totalQty: string;
  notes: string | null;
  issuedAt: string;
  issuedByName: string | null;
  lines: Array<{
    id: string;
    sku: string | null;
    lotCode: string | null;
    binCode: string | null;
    qty: string;
  }>;
}

interface DetailResp {
  data: {
    id: string;
    requestNo: string;
    status: Status;
    requestedBy: string;
    requestedByName: string | null;
    requestedByUsername: string | null;
    woId: string | null;
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
      /** V4.1 Đợt 1b — SL còn phải giao + "Khả dụng" (issuable_qty). */
      remainingQty: string;
      issuableQty: string;
      notes: string | null;
    }>;
    goodsIssues: GoodsIssueSummary[];
  };
}

const STATUS_PILL: Record<Status, { label: string; cls: string; dot: string; icon: React.ElementType }> = {
  PENDING:   { label: "Chờ chuẩn bị",   cls: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800",    dot: "bg-amber-500 animate-pulse",  icon: Clock        },
  PICKING:   { label: "Đang chuẩn bị",  cls: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:ring-blue-800",        dot: "bg-blue-500 animate-pulse",   icon: Package      },
  READY:     { label: "Đã sẵn sàng",    cls: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:ring-violet-800",  dot: "bg-violet-500",               icon: CheckCircle2 },
  PARTIAL:   { label: "Giao một phần",  cls: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:ring-sky-800",                  dot: "bg-sky-500",                  icon: PackageCheck },
  DELIVERED: { label: "Đã giao",        cls: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800", dot: "bg-emerald-500",            icon: Truck        },
  CANCELLED: { label: "Đã huỷ",         cls: "bg-zinc-100 text-zinc-500 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700",       dot: "bg-zinc-400",                 icon: XCircle      },
};

const ISSUABLE_STATUSES: Status[] = ["PENDING", "PICKING", "READY", "PARTIAL"];

function fmtDateTime(at: string): string {
  return new Date(at).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

type TransitionInput = Status | { to: Status; warehouseNotes?: string | null };

export default function MaterialRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const { data: session } = useSession();
  const roles = session?.roles ?? [];
  // V4.1 Đợt 1b — nút theo quyền RBAC matrix.
  const canTransition = can(roles, "transition", "materialRequest");
  const canIssue = can(roles, "create", "goodsIssue");
  // Link sang tab Kho chỉ cho người vào được /warehouse (admin, warehouse).
  const canOpenWarehouse = roles.includes("admin") || roles.includes("warehouse");
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [closeNote, setCloseNote] = React.useState("");

  const query = useQuery<DetailResp>({
    queryKey: ["material-request", id],
    queryFn: async () => {
      const res = await fetch(`/api/material-requests/${id}`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? "Không tải được phiếu yêu cầu");
      return body as DetailResp;
    },
    staleTime: 10_000,
  });

  const transition = useMutation({
    mutationFn: async (input: TransitionInput) => {
      const payload = typeof input === "string" ? { to: input } : input;
      const res = await fetch(`/api/material-requests/${id}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? "Không chuyển được trạng thái");
      return body;
    },
    onSuccess: (_, input) => {
      const to = typeof input === "string" ? input : input.to;
      toast.success(`Đã chuyển sang ${STATUS_PILL[to].label}`);
      setCloseOpen(false);
      qc.invalidateQueries({ queryKey: ["material-request", id] });
      qc.invalidateQueries({ queryKey: ["material-requests"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Lỗi chuyển trạng thái");
      qc.invalidateQueries({ queryKey: ["material-request", id] });
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Đang tải…
      </div>
    );
  }
  if (query.isError || !query.data?.data) {
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950/40">
        <p className="text-sm font-semibold text-red-700 dark:text-red-400">Không tìm thấy yêu cầu</p>
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          {(query.error as Error)?.message ?? "Hoặc bạn không có quyền xem."}
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/material-requests">Về danh sách</Link>
        </Button>
      </div>
    );
  }

  const r = query.data.data;
  const deliveredAny = r.lines.some((l) => Number(l.deliveredQty) > 0);
  // Phiếu huỷ khi đã giao dở = "đóng phiếu" → nhãn rõ nghĩa hơn "Đã huỷ".
  const cfg =
    r.status === "CANCELLED" && deliveredAny
      ? { ...STATUS_PILL.CANCELLED, label: "Đã đóng (giao một phần)" }
      : STATUS_PILL[r.status] ?? STATUS_PILL.PENDING;
  const isRequester = session?.id === r.requestedBy;
  const issuable = ISSUABLE_STATUSES.includes(r.status);
  const canCancel =
    (canTransition && ["PENDING", "PICKING", "READY"].includes(r.status)) ||
    (r.status === "PENDING" && isRequester);
  const showActions =
    (issuable && canIssue) ||
    canCancel ||
    (canTransition && r.status !== "DELIVERED" && r.status !== "CANCELLED");

  return (
    <div className="flex h-full flex-col bg-zinc-50/30 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-4 py-5 md:px-6 dark:border-zinc-800 dark:bg-zinc-900">
        <Link
          href="/material-requests"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Về danh sách yêu cầu
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/50">
              <FileText className="h-6 w-6 text-indigo-700 dark:text-indigo-400" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {r.requestNo}
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                Yêu cầu vật tư từ kho · {r.requestedByName || r.requestedByUsername || "—"}
                {r.woId ? (
                  <>
                    {" · "}
                    <Link
                      href={`/work-orders/${r.woId}`}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      <Factory className="h-3.5 w-3.5" aria-hidden /> Lệnh sản xuất
                    </Link>
                  </>
                ) : null}
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

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-4xl space-y-5">
          {/* Timeline */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 mb-4 dark:text-zinc-50">Hành trình</h2>
            <div className="space-y-3">
              <TimelineRow icon={FileText} label="Tạo yêu cầu" at={r.createdAt} done />
              <TimelineRow icon={Package} label="Bắt đầu chuẩn bị" at={r.pickedAt} done={!!r.pickedAt} />
              <TimelineRow icon={CheckCircle2} label="Sẵn sàng giao" at={r.readyAt} done={!!r.readyAt} />
              <TimelineRow
                icon={PackageCheck}
                label={`Phiếu xuất kho (${r.goodsIssues.length})`}
                at={r.goodsIssues[0]?.issuedAt ?? null}
                done={r.goodsIssues.length > 0}
              />
              <TimelineRow icon={Truck} label="Đã giao đủ" at={r.deliveredAt} done={!!r.deliveredAt} />
            </div>
          </section>

          {/* Lines table */}
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 bg-zinc-50/60 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-800/60">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Linh kiện ({r.lines.length} dòng)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 w-12 dark:text-zinc-500">#</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">SKU</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Tên</th>
                    <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Yêu cầu</th>
                    <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Đã giao</th>
                    <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Còn lại</th>
                    {issuable && (
                      <th
                        className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
                        title="Chỉ lô đã QC đạt, trừ phần giữ chỗ cho lệnh sản xuất"
                      >
                        Khả dụng
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {r.lines.map((l) => (
                    <tr key={l.id} className="border-b border-zinc-50 dark:border-zinc-800/60">
                      <td className="px-5 py-3 text-sm text-zinc-500 dark:text-zinc-400">{l.lineNo}</td>
                      <td className="px-5 py-3 font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                        {l.itemSku ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-sm text-zinc-700 dark:text-zinc-300">{l.itemName ?? "—"}</td>
                      <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        {Number(l.requestedQty).toLocaleString("vi-VN")}
                        {l.itemUom && <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">{l.itemUom}</span>}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-sm text-emerald-700 dark:text-emerald-400">
                        {Number(l.deliveredQty).toLocaleString("vi-VN")}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-sm text-zinc-700 dark:text-zinc-300">
                        {Number(l.remainingQty).toLocaleString("vi-VN")}
                      </td>
                      {issuable && (
                        <td
                          className={cn(
                            "px-5 py-3 text-right font-mono text-sm",
                            Number(l.issuableQty) + 1e-6 < Number(l.remainingQty)
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-zinc-500 dark:text-zinc-400",
                          )}
                        >
                          {Number(l.issuableQty).toLocaleString("vi-VN")}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* V4.1 Đợt 1b — Phiếu xuất kho đã lập cho phiếu yêu cầu này */}
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 bg-zinc-50/60 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-800/60">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Phiếu xuất kho ({r.goodsIssues.length})
              </h2>
            </div>
            {r.goodsIssues.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                Chưa xuất lần nào. Kho giao vật tư bằng nút &quot;Lập phiếu xuất kho&quot;.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {r.goodsIssues.map((gi) => (
                  <li key={gi.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {canOpenWarehouse ? (
                        <Link
                          href={`/warehouse?tab=goods-issues&id=${gi.id}`}
                          className="font-mono text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          {gi.issueNo}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          {gi.issueNo}
                        </span>
                      )}
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {fmtDateTime(gi.issuedAt)}
                        {gi.issuedByName ? ` · ${gi.issuedByName}` : ""}
                      </span>
                      <span className="ml-auto font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        {Number(gi.totalQty).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      {gi.lines
                        .map(
                          (gl) =>
                            `${gl.sku ?? "—"} · lô ${gl.lotCode ?? "—"} @ ${gl.binCode ?? "—"}: ${Number(gl.qty).toLocaleString("vi-VN")}`,
                        )
                        .join("  |  ")}
                    </p>
                    {gi.notes ? (
                      <p className="mt-0.5 text-xs italic text-zinc-500 dark:text-zinc-400">{gi.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Notes */}
          {(r.notes || r.warehouseNotes) && (
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {r.notes && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Ghi chú người yêu cầu</p>
                  <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap dark:text-zinc-300">{r.notes}</p>
                </div>
              )}
              {r.warehouseNotes && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Ghi chú từ kho</p>
                  <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap dark:text-zinc-300">{r.warehouseNotes}</p>
                </div>
              )}
            </section>
          )}

          {/* Actions — V4.1 Đợt 1b: hiện theo quyền; giao hàng CHỈ qua phiếu xuất */}
          {showActions && (
            <section className="flex flex-wrap items-center justify-end gap-2">
              {canTransition && r.status === "PENDING" && (
                <Button
                  variant="outline"
                  className="border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40"
                  onClick={() => transition.mutate("PICKING")}
                  disabled={transition.isPending}
                >
                  <Package className="h-4 w-4" /> Bắt đầu chuẩn bị
                </Button>
              )}
              {canTransition && (r.status === "PENDING" || r.status === "PICKING") && (
                <Button
                  variant="outline"
                  className="border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950/40"
                  onClick={() => transition.mutate("READY")}
                  disabled={transition.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" /> Đánh dấu sẵn sàng
                </Button>
              )}
              {canTransition && r.status === "READY" && (
                <Button
                  variant="outline"
                  className="border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40"
                  onClick={() => transition.mutate("PICKING")}
                  disabled={transition.isPending}
                >
                  <Package className="h-4 w-4" /> Quay lại chuẩn bị
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                  onClick={() => {
                    if (window.confirm(`Huỷ phiếu yêu cầu ${r.requestNo}?`)) {
                      transition.mutate("CANCELLED");
                    }
                  }}
                  disabled={transition.isPending}
                >
                  <XCircle className="h-4 w-4" /> Huỷ yêu cầu
                </Button>
              )}
              {canTransition && r.status === "PARTIAL" && (
                <Button
                  variant="outline"
                  className="border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  onClick={() => {
                    setCloseNote("");
                    setCloseOpen(true);
                  }}
                  disabled={transition.isPending}
                >
                  <XCircle className="h-4 w-4" /> Đóng phiếu (không giao tiếp)
                </Button>
              )}
              {canIssue && issuable && (
                <GoodsIssuePanel requestId={r.id} requestNo={r.requestNo} lines={r.lines} />
              )}
            </section>
          )}
        </div>
      </div>

      {/* V4.1 Đợt 1b — đóng phiếu đang giao dở (PARTIAL → CANCELLED) */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Đóng phiếu {r.requestNo}?</DialogTitle>
            <DialogDescription>
              Phiếu đã giao một phần. Đóng phiếu = phần còn lại KHÔNG giao nữa.
              Các phiếu xuất đã lập giữ nguyên (tồn đã trừ không hoàn lại).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label
              htmlFor="mr-close-note"
              className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Lý do đóng (bắt buộc, ghi vào ghi chú kho)
            </label>
            <Textarea
              id="mr-close-note"
              rows={3}
              maxLength={500}
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              placeholder="VD: xưởng không cần thêm, đã thay bằng mã khác…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloseOpen(false)}>
              Không đóng
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={transition.isPending || closeNote.trim().length < 3}
              onClick={() =>
                transition.mutate({
                  to: "CANCELLED",
                  warehouseNotes: [
                    r.warehouseNotes,
                    `Đóng phiếu khi giao một phần: ${closeNote.trim()}`,
                  ]
                    .filter(Boolean)
                    .join("\n"),
                })
              }
            >
              {transition.isPending ? "Đang đóng…" : "Đóng phiếu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
      )}>
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="flex-1">
        <p className={cn("text-sm font-medium", done ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-400")}>
          {label}
        </p>
        {at ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{fmtDateTime(at)}</p>
        ) : (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Chưa thực hiện</p>
        )}
      </div>
    </div>
  );
}
