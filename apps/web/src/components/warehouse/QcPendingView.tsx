"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Search, ShieldCheck, XCircle } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/useSession";
import {
  useDecideQc,
  useQcPendingList,
  type QcFilter,
  type QcPendingRow,
} from "@/hooks/useInboundQc";
import { cn } from "@/lib/utils";

/**
 * V4.1 Đợt 1a — `<QcPendingView>` màn "Chờ QC nhập kho".
 *
 * Dùng ở 2 nơi: tab Nhập/Xuất kho `?mode=qc` (Kho/Giám đốc) và trang
 * `/qc-inbound` (Tổ QC). Liệt kê dòng phiếu nhập Chờ kiểm + Không đạt; người
 * có `approve:qcInspection` bấm Đạt / Không đạt (Không đạt bắt buộc lý do).
 * Kho (chỉ `read`) xem được để biết hàng nào đang bị giữ.
 */

const FILTERS: Array<{ value: QcFilter; label: string }> = [
  { value: "PENDING", label: "Chờ kiểm" },
  { value: "FAIL", label: "Không đạt" },
  { value: "ALL", label: "Tất cả" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function QcPendingView({ className }: { className?: string }) {
  const { data: session } = useSession();
  const canDecide = can(session?.roles ?? [], "approve", "qcInspection");

  const [filter, setFilter] = React.useState<QcFilter>("PENDING");
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQcPendingList(filter, q);
  const decide = useDecideQc();
  const [dialog, setDialog] = React.useState<{
    row: QcPendingRow;
    result: "PASS" | "FAIL";
  } | null>(null);
  const [notes, setNotes] = React.useState("");

  const rows = list.data?.data ?? [];
  const counts = list.data?.meta;

  const openDialog = (row: QcPendingRow, result: "PASS" | "FAIL") => {
    setNotes("");
    setDialog({ row, result });
  };

  const submit = async () => {
    if (!dialog) return;
    const trimmed = notes.trim();
    if (dialog.result === "FAIL" && trimmed.length < 3) return;
    try {
      await decide.mutateAsync({
        lineId: dialog.row.lineId,
        result: dialog.result,
        notes: trimmed || null,
      });
      setDialog(null);
    } catch {
      // toast lỗi đã do hook hiển thị
    }
  };

  return (
    <div className={cn("flex flex-col gap-4 p-3 sm:p-6", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
            Chờ QC nhập kho
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Hàng nhận bị giữ (HOLD) cho tới khi QC kết luận Đạt — chưa xuất,
            chưa giữ chỗ, chưa lắp ráp được.
            {!canDecide ? " Chỉ Tổ QC / Giám đốc được kết luận." : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            Chờ kiểm: <strong className="tabular-nums">{counts?.pending ?? "…"}</strong>
          </span>
          <span className="rounded-md bg-red-50 px-2 py-1 font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
            Không đạt: <strong className="tabular-nums">{counts?.failed ?? "…"}</strong>
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Lọc trạng thái QC"
          className="inline-flex h-9 items-center rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800"
        >
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex h-7 items-center rounded-md px-3 text-xs font-semibold transition-colors",
                filter === f.value
                  ? "bg-white text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã hàng, tên, phiếu nhập, PO, mã lô…"
            className="h-9 pl-9"
            aria-label="Tìm dòng chờ QC"
          />
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {list.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Đang tải…
          </div>
        ) : list.isError ? (
          <div className="p-6 text-sm text-red-700 dark:text-red-400">
            {(list.error as Error)?.message ?? "Không tải được danh sách chờ QC."}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {filter === "FAIL"
              ? "Không có lô nào QC không đạt."
              : "Không có hàng nào đang chờ QC."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-3 py-2">Phiếu nhập / PO</th>
                  <th scope="col" className="px-3 py-2">Mã hàng</th>
                  <th scope="col" className="px-3 py-2 text-right">SL</th>
                  <th scope="col" className="px-3 py-2">Lô · Vị trí</th>
                  <th scope="col" className="px-3 py-2">Nhận lúc</th>
                  <th scope="col" className="px-3 py-2">Trạng thái</th>
                  <th scope="col" className="px-3 py-2 text-right">Kết luận</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.lineId}
                    className="border-t border-zinc-100 align-top dark:border-zinc-800"
                  >
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                        {r.receiptNo}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {r.poNo ?? "—"}
                        {r.supplierName ? ` · ${r.supplierName}` : ""}
                      </div>
                    </td>
                    <td className="max-w-[16rem] px-3 py-2">
                      <code className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                        {r.sku}
                      </code>
                      <div className="truncate text-[11px] text-zinc-600 dark:text-zinc-400" title={r.itemName}>
                        {r.itemName}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.receivedQty.toLocaleString("vi-VN")}{" "}
                      <span className="text-[11px] text-zinc-500">{r.uom}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="font-mono">{r.lotCode ?? "(không mã lô)"}</div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {r.binCode ?? "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {fmtDate(r.receivedAt)}
                      {r.receivedByUsername ? (
                        <div className="text-[11px] text-zinc-500">bởi {r.receivedByUsername}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.qcStatus === "FAIL" ? (
                        <>
                          <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
                            <XCircle className="h-3 w-3" aria-hidden />
                            Không đạt
                          </span>
                          {r.qcNotes ? (
                            <div className="mt-1 max-w-[14rem] text-[11px] text-zinc-600 dark:text-zinc-400">
                              {r.qcNotes}
                            </div>
                          ) : null}
                          {r.qcCheckedByUsername ? (
                            <div className="text-[11px] text-zinc-500">
                              {r.qcCheckedByUsername} · {fmtDate(r.qcCheckedAt)}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                          Chờ kiểm
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canDecide ? (
                        <div className="inline-flex gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => openDialog(r, "PASS")}
                            disabled={decide.isPending}
                            className="h-8 bg-emerald-600 px-3 text-xs hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            Đạt
                          </Button>
                          {r.qcStatus === "PENDING" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openDialog(r, "FAIL")}
                              disabled={decide.isPending}
                              className="h-8 px-3 text-xs text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                            >
                              <XCircle className="h-3.5 w-3.5" aria-hidden />
                              Không đạt
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-[11px] text-zinc-400">Chờ Tổ QC</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {dialog?.result === "PASS" ? "Xác nhận QC Đạt" : "Ghi QC Không đạt"}
            </DialogTitle>
            <DialogDescription>
              {dialog ? (
                <>
                  <code className="font-mono">{dialog.row.sku}</code> · SL{" "}
                  {dialog.row.receivedQty.toLocaleString("vi-VN")} {dialog.row.uom}
                  {dialog.row.lotCode ? ` · lô ${dialog.row.lotCode}` : ""} ·{" "}
                  {dialog.row.receiptNo}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {dialog?.result === "PASS"
                ? "Lô sẽ chuyển sang Sẵn dùng — Kho xuất được, giữ chỗ được cho lệnh sản xuất."
                : "Lô bị giữ (QC không đạt), giữ chỗ trên lô sẽ được nhả. Kho + Thu mua nhận thông báo để xử lý với NCC."}
            </p>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300" htmlFor="qc-notes">
              {dialog?.result === "FAIL" ? "Lý do không đạt (bắt buộc)" : "Ghi chú (tuỳ chọn)"}
            </label>
            <Textarea
              id="qc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={
                dialog?.result === "FAIL"
                  ? "VD: sai kích thước, gỉ sét, thiếu CO/CQ…"
                  : "VD: đã đo kiểm 5/5 mẫu đạt"
              }
            />
            {dialog?.result === "FAIL" && notes.trim().length > 0 && notes.trim().length < 3 ? (
              <p className="text-[11px] text-red-600">Lý do tối thiểu 3 ký tự.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Huỷ
            </Button>
            <Button
              onClick={submit}
              disabled={
                decide.isPending ||
                (dialog?.result === "FAIL" && notes.trim().length < 3)
              }
              className={
                dialog?.result === "PASS"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-red-600 hover:bg-red-700"
              }
            >
              {decide.isPending
                ? "Đang ghi…"
                : dialog?.result === "PASS"
                  ? "Xác nhận Đạt"
                  : "Ghi Không đạt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
