"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parseDims, stageIndex, stagesFor, type BomCategory } from "@iot/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import type { StageBuckets } from "@/lib/bom-stage-ledger";
import { useSuppliersList } from "@/hooks/useSuppliers";
import {
  slipExportUrl,
  slipPdfUrl,
  useCreateDeliverySlip,
  type SlipKind,
} from "@/hooks/useDeliverySlips";
import { DeliverySlipPaper, type PaperRow } from "./DeliverySlipPaper";

export interface SlipTarget {
  id: string;
  name: string;
  category: BomCategory;
  buckets: StageBuckets | null;
  positionCode: string | null;
  surfaceTreatment: string | null;
  dimsText: string | null;
}

const KINDS: Record<SlipKind, { from: string; to: string; title: string; fromLabel: string }> = {
  SURFACE: { from: "MACHINING", to: "SURFACE", title: "Gửi nhà thầu phụ", fromLabel: "Gia công" },
  ASSEMBLY: { from: "QC", to: "ASSEMBLY", title: "Giao bộ phận lắp ráp", fromLabel: "QC" },
};
const ASSEMBLY_RECIPIENT = "BỘ PHẬN LẮP RÁP — XƯỞNG GTAM";
const INPUT =
  "h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

interface RowState {
  include: boolean;
  qty: string;
  price: string;
}

/** Lý do dòng không giao được (null = giao được). */
function blockReason(t: SlipTarget, kind: SlipKind): string | null {
  const k = KINDS[kind];
  if (!t.buckets) return "Chưa tải được số liệu bước";
  if (kind === "SURFACE" && t.category !== "GTAM") return "Chỉ chi tiết GTAM mới gửi xử lý bề mặt";
  if ((t.buckets[k.from] ?? 0) <= 5e-5) return `Chưa có hàng ở bước ${k.fromLabel}`;
  return null;
}

export function DeliverySlipDialog({
  open,
  onOpenChange,
  kind,
  templateId,
  templateCode,
  targets,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: SlipKind;
  templateId: string;
  templateCode: string;
  targets: SlipTarget[];
  onDone?: () => void;
}) {
  const k = KINDS[kind];
  const mut = useCreateDeliverySlip(templateId);
  const [rows, setRows] = React.useState<Record<string, RowState>>({});
  const [supplierId, setSupplierId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const suppliersQuery = useSuppliersList({ q: search || undefined, pageSize: 50, isActive: true });
  const suppliers = suppliersQuery.data?.data ?? [];
  // Giữ NCC đã chọn trong danh sách dù tìm kiếm đổi.
  const [picked, setPicked] = React.useState<{ id: string; name: string; address: string | null } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const next: Record<string, RowState> = {};
    for (const t of targets) {
      const blocked = blockReason(t, kind);
      next[t.id] = {
        include: !blocked,
        qty: blocked ? "" : String(t.buckets![k.from] ?? 0),
        price: "",
      };
    }
    setRows(next);
    setSupplierId("");
    setPicked(null);
    setSearch("");
    setNotes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  const patch = (id: string, p: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id]!, ...p } }));

  const items: Array<{ t: SlipTarget; qty: number; price: number | null }> = [];
  let invalid = 0;
  for (const t of targets) {
    const r = rows[t.id];
    if (!r || !r.include || blockReason(t, kind)) continue;
    const qty = Number(r.qty);
    const max = t.buckets![k.from] ?? 0;
    if (!(qty > 0) || qty > max + 5e-5) {
      invalid++;
      continue;
    }
    items.push({ t, qty, price: r.price.trim() !== "" && Number(r.price) >= 0 ? Number(r.price) : null });
  }

  const recipient = kind === "SURFACE" ? (picked?.name ?? "") : ASSEMBLY_RECIPIENT;
  const address = kind === "SURFACE" ? (picked?.address ?? null) : null;
  const canSubmit =
    items.length > 0 && invalid === 0 && !mut.isPending && (kind === "ASSEMBLY" || !!supplierId);

  const paperRows: PaperRow[] = items.map(({ t, qty, price }, i) => {
    const dims = parseDims(t.dimsText);
    // Còn = chưa tới bước đích sau phiếu này (đợt n do server tính khi gửi).
    const codes = stagesFor(t.category);
    const ti = stageIndex(t.category, k.to);
    const total = codes.reduce((a, c) => a + (t.buckets![c] ?? 0), 0);
    let reached = 0;
    for (let j = ti; j < codes.length; j++) reached += t.buckets![codes[j]!] ?? 0;
    const remaining = Math.max(0, Math.round((total - reached - qty) * 1e4) / 1e4);
    return {
      stt: i + 1,
      name: t.name,
      l: dims?.l ?? null,
      w: dims?.w ?? null,
      h: dims?.h ?? null,
      spec: kind === "SURFACE" ? t.surfaceTreatment : null,
      code: t.positionCode,
      mgmt: templateCode,
      qty,
      recv: null,
      price: kind === "SURFACE" ? price : null,
      note: remaining > 0 ? `Đợt n · còn ${formatNumber(remaining)}` : "Đợt n",
    };
  });

  const today = new Date();
  const dateText = `Ngày ${String(today.getDate()).padStart(2, "0")} tháng ${String(
    today.getMonth() + 1,
  ).padStart(2, "0")} năm ${today.getFullYear()}`;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const res = await mut.mutateAsync({
        kind,
        supplierId: kind === "SURFACE" ? supplierId : null,
        notes: notes.trim() || null,
        lines: items.map(({ t, qty, price }) => ({
          lineId: t.id,
          qty,
          unitPrice: kind === "SURFACE" ? price : null,
        })),
      });
      const { slip } = res.data;
      toast.success(`Đã lập phiếu ${slip.slipNo}`, {
        duration: 15000,
        action: {
          label: "Tải Excel",
          onClick: () => window.open(slipExportUrl(slip.id), "_blank"),
        },
        cancel: {
          label: "In PDF",
          onClick: () => window.open(slipPdfUrl(slip.id), "_blank"),
        },
      });
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message || "Không lập được phiếu giao.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{k.title}</DialogTitle>
          <DialogDescription>
            Lập phiếu giao hàng và chuyển bước {k.fromLabel} → {kind === "SURFACE" ? "Bề mặt·NTP" : "Lắp ráp"} ngay.
            Giao từng phần được; phần còn lại để đợt sau.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[68vh] gap-4 overflow-y-auto md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-3">
            {kind === "SURFACE" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500">Nhà thầu phụ nhận hàng (bắt buộc)</label>
                <input
                  className={`${INPUT} w-full`}
                  placeholder="Tìm nhà thầu phụ…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  className={`${INPUT} w-full`}
                  value={supplierId}
                  aria-label="Nhà thầu phụ"
                  onChange={(e) => {
                    const s = suppliers.find((x) => x.id === e.target.value);
                    setSupplierId(e.target.value);
                    setPicked(s ? { id: s.id, name: s.name, address: s.address } : null);
                  }}
                >
                  <option value="">— Chọn nhà thầu phụ —</option>
                  {picked && !suppliers.some((s) => s.id === picked.id) && (
                    <option value={picked.id}>{picked.name}</option>
                  )}
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/50">
                Bên nhận: <b>{ASSEMBLY_RECIPIENT}</b> (không đơn giá)
              </div>
            )}
            <div className="space-y-1.5">
              {targets.map((t) => {
                const r = rows[t.id];
                const reason = blockReason(t, kind);
                if (!r) return null;
                const max = t.buckets?.[k.from] ?? 0;
                const q = Number(r.qty);
                const bad = r.include && !reason && (!(q > 0) || q > max + 5e-5);
                return (
                  <div
                    key={t.id}
                    className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${
                      reason
                        ? "border-zinc-100 bg-zinc-50 opacity-60 dark:border-zinc-800 dark:bg-zinc-800/40"
                        : "border-zinc-200 dark:border-zinc-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={r.include && !reason}
                      disabled={!!reason}
                      onChange={(e) => patch(t.id, { include: e.target.checked })}
                      aria-label={`Giao ${t.name}`}
                    />
                    <span className="min-w-0 flex-1 basis-32 truncate text-sm font-medium" title={t.name}>
                      {t.name}
                    </span>
                    {reason ? (
                      <span className="text-[11px] text-zinc-500">{reason}</span>
                    ) : (
                      <>
                        <input
                          type="number"
                          min={0}
                          max={max}
                          step="any"
                          value={r.qty}
                          aria-label="Số lượng giao"
                          onChange={(e) => patch(t.id, { qty: e.target.value })}
                          className={`${INPUT} w-20 text-right font-mono ${bad ? "border-red-400 text-red-600" : ""}`}
                        />
                        <span className="text-[11px] text-zinc-500">tối đa {formatNumber(max)}</span>
                        {kind === "SURFACE" && (
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={r.price}
                            placeholder="Đơn giá"
                            aria-label="Đơn giá"
                            onChange={(e) => patch(t.id, { price: e.target.value })}
                            className={`${INPUT} w-24 text-right font-mono`}
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <input
              className={`${INPUT} w-full`}
              placeholder="Ghi chú phiếu (tuỳ chọn)"
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div>
            <DeliverySlipPaper
              slipNo="GT-PG…(cấp khi gửi)"
              dateText={dateText}
              recipient={recipient}
              address={address}
              rows={paperRows}
              showPrice={kind === "SURFACE"}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Huỷ
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {mut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Gửi phiếu ({items.length} dòng)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
