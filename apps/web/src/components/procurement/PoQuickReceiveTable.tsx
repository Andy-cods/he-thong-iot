"use client";

import * as React from "react";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { BarcodeScanInput } from "@/components/ui/BarcodeScanInput";
import { cn } from "@/lib/utils";
import { uuidv7 } from "@/lib/uuid-v7";
import {
  usePOForReceiving,
  useSubmitReceivingEvent,
  type POReceivingLine,
  type ReceivingEventInput,
} from "@/hooks/useReceivingEvents";

/**
 * V3 PoQuickReceiveTable — flow nhận hàng nhanh trong PO detail.
 *
 * Khác `/receiving/[poId]/page.tsx` (form đầy đủ với lot/qc per line):
 *   - Quick mode dành cho trường hợp hàng về đủ + OK (default qcStatus=PENDING,
 *     warehouse hậu kiểm sau).
 *   - Tickbox per-line + auto-fill qty = remaining.
 *   - Barcode scan đầu trang: scan SKU → tự tick line tương ứng + +1 qty
 *     (capped ở `remaining`).
 *
 * Backend tái dùng POST `/api/receiving/events` (atomic 7-table).
 *
 * Performance:
 *   - `React.useMemo` cho lines map by SKU (lookup O(1) khi scan).
 *   - `useReducer` cho input state — batch update không re-render từng line.
 *   - Scan flash visual qua BarcodeScanInput không re-render table.
 */

type LineState = {
  ticked: boolean;
  /** qty user input — string để giữ nguyên ô empty/typed. */
  qty: string;
};

type Action =
  | { type: "init"; lines: POReceivingLine[] }
  | { type: "tick"; lineId: string; remaining: number }
  | { type: "untick"; lineId: string }
  | { type: "set-qty"; lineId: string; qty: string }
  | {
      type: "scan-increment";
      lineId: string;
      remaining: number;
    }
  | { type: "reset" };

function reducer(
  state: Record<string, LineState>,
  action: Action,
): Record<string, LineState> {
  switch (action.type) {
    case "init": {
      const next: Record<string, LineState> = {};
      for (const ln of action.lines) {
        next[ln.id] = state[ln.id] ?? { ticked: false, qty: "" };
      }
      return next;
    }
    case "tick": {
      const cur = state[action.lineId] ?? { ticked: false, qty: "" };
      return {
        ...state,
        [action.lineId]: {
          ticked: true,
          // Auto-fill remaining nếu chưa có qty, hoặc đang trống.
          qty: cur.qty.trim() === "" ? String(action.remaining) : cur.qty,
        },
      };
    }
    case "untick": {
      const cur = state[action.lineId] ?? { ticked: false, qty: "" };
      return {
        ...state,
        [action.lineId]: { ticked: false, qty: cur.qty },
      };
    }
    case "set-qty": {
      const cur = state[action.lineId] ?? { ticked: false, qty: "" };
      return {
        ...state,
        [action.lineId]: { ...cur, qty: action.qty },
      };
    }
    case "scan-increment": {
      const cur = state[action.lineId] ?? { ticked: false, qty: "" };
      const currentQty = Number(cur.qty);
      const safeQty = Number.isFinite(currentQty) && currentQty > 0
        ? currentQty
        : 0;
      const nextQty = Math.min(action.remaining, safeQty + 1);
      return {
        ...state,
        [action.lineId]: { ticked: true, qty: String(nextQty) },
      };
    }
    case "reset": {
      const next: Record<string, LineState> = {};
      for (const k of Object.keys(state)) {
        next[k] = { ticked: false, qty: "" };
      }
      return next;
    }
    default:
      return state;
  }
}

export interface PoQuickReceiveTableProps {
  poId: string;
  /** Cho phép disable từ parent (vd PO chưa duyệt). */
  readOnly?: boolean;
  className?: string;
}

export function PoQuickReceiveTable({
  poId,
  readOnly,
  className,
}: PoQuickReceiveTableProps) {
  const { data: po, isLoading, isError } = usePOForReceiving(poId);
  const submit = useSubmitReceivingEvent();
  const [state, dispatch] = React.useReducer(reducer, {});

  // Init state khi data về.
  React.useEffect(() => {
    if (po?.lines) {
      dispatch({ type: "init", lines: po.lines });
    }
  }, [po?.lines]);

  // Lookup map SKU → line cho barcode scan O(1).
  const skuMap = React.useMemo(() => {
    const m = new Map<string, POReceivingLine>();
    if (po?.lines) {
      for (const ln of po.lines) {
        if (ln.sku) m.set(ln.sku.toUpperCase(), ln);
      }
    }
    return m;
  }, [po?.lines]);

  const handleScan = React.useCallback(
    (code: string) => {
      const ln = skuMap.get(code.toUpperCase());
      if (!ln) {
        toast.warning("Không tìm thấy SKU", {
          description: `Mã '${code}' không có trong PO này.`,
        });
        return;
      }
      if (ln.remainingQty <= 0) {
        toast.info("Line đã đủ", {
          description: `${ln.sku} đã nhận đủ ${ln.orderedQty}.`,
        });
        return;
      }
      dispatch({
        type: "scan-increment",
        lineId: ln.id,
        remaining: ln.remainingQty,
      });
      toast.success("Đã ghi nhận", {
        description: `${ln.sku} +1`,
        duration: 1500,
      });
    },
    [skuMap],
  );

  const tickedCount = React.useMemo(
    () => Object.values(state).filter((s) => s.ticked).length,
    [state],
  );

  const handleSave = React.useCallback(async () => {
    if (!po) return;
    const events: ReceivingEventInput[] = [];
    const errors: string[] = [];

    for (const ln of po.lines) {
      const s = state[ln.id];
      if (!s?.ticked) continue;
      const qty = Number(s.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push(`Dòng ${ln.lineNo} (${ln.sku}): số lượng phải > 0`);
        continue;
      }
      if (qty > ln.remainingQty) {
        errors.push(
          `Dòng ${ln.lineNo} (${ln.sku}): nhận ${qty} > còn ${ln.remainingQty}`,
        );
        continue;
      }
      events.push({
        id: uuidv7(),
        scanId: uuidv7(),
        poCode: po.poCode,
        sku: ln.sku,
        qty,
        lotNo: null,
        qcStatus: "PENDING",
        scannedAt: new Date().toISOString(),
        rawCode: null,
        metadata: { source: "po-quick-receive" },
      });
    }

    if (errors.length > 0) {
      toast.error("Có lỗi cần sửa", {
        description: errors.slice(0, 3).join(" · "),
      });
      return;
    }
    if (events.length === 0) {
      toast.warning("Chưa tick line nào");
      return;
    }

    try {
      const res = await submit.mutateAsync(events);
      const ack = res.data.acked.length;
      const rej = res.data.rejected.length;
      if (rej > 0) {
        toast.warning(`Ghi nhận ${ack}/${events.length} dòng`, {
          description: `Có ${rej} dòng bị từ chối — xem console.`,
        });
      } else {
        toast.success(`Đã ghi nhận ${ack} dòng`);
      }
      dispatch({ type: "reset" });
    } catch (err) {
      toast.error("Lưu thất bại", {
        description: (err as Error).message,
      });
    }
  }, [po, state, submit]);

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-zinc-500">Đang tải dữ liệu PO…</div>
    );
  }
  if (isError || !po) {
    return (
      <div className="p-6 text-sm text-red-600">
        Không tải được dữ liệu PO.
      </div>
    );
  }

  const allReceived = po.lines.every((ln) => ln.remainingQty <= 0);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <BarcodeScanInput
          onScan={handleScan}
          disabled={readOnly || allReceived}
          hint="Scanner USB sẽ tự gửi Enter sau khi quét — Tab này nhận tự động."
          className="w-full sm:max-w-md"
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-500">
            Đã chọn:{" "}
            <span className="font-semibold text-zinc-900">{tickedCount}</span>{" "}
            dòng
          </span>
          <Button
            type="button"
            onClick={handleSave}
            disabled={
              readOnly ||
              tickedCount === 0 ||
              submit.isPending
            }
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {submit.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Lưu nhận hàng
          </Button>
        </div>
      </div>

      {allReceived ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Tất cả dòng đã nhận đủ.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-12 px-3 py-2 text-left">#</th>
              <th className="w-12 px-3 py-2 text-left">Tick</th>
              <th className="px-3 py-2 text-left">Vật tư</th>
              <th className="px-3 py-2 text-right">Đặt</th>
              <th className="px-3 py-2 text-right">Đã nhận</th>
              <th className="px-3 py-2 text-right">Còn lại</th>
              <th className="px-3 py-2 text-right">SL nhận lần này</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((ln) => {
              const s = state[ln.id] ?? { ticked: false, qty: "" };
              const qty = Number(s.qty);
              const overShot =
                Number.isFinite(qty) && qty > 0 && qty > ln.remainingQty;
              const isDone = ln.remainingQty <= 0;
              return (
                <tr
                  key={ln.id}
                  className={cn(
                    "border-t border-zinc-100",
                    s.ticked && "bg-indigo-50/40",
                    isDone && "opacity-50",
                  )}
                >
                  <td className="px-3 py-2 text-zinc-500">{ln.lineNo}</td>
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={s.ticked}
                      disabled={readOnly || isDone}
                      onCheckedChange={(v) => {
                        if (v === true) {
                          dispatch({
                            type: "tick",
                            lineId: ln.id,
                            remaining: ln.remainingQty,
                          });
                        } else {
                          dispatch({ type: "untick", lineId: ln.id });
                        }
                      }}
                      aria-label={`Tick dòng ${ln.lineNo} ${ln.sku}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-zinc-500">
                      {ln.sku}
                    </span>
                    {ln.itemName ? (
                      <span className="ml-1 text-zinc-700">{ln.itemName}</span>
                    ) : null}
                    {ln.uom ? (
                      <span className="ml-2 text-xs text-zinc-400">
                        ({ln.uom})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {ln.orderedQty.toLocaleString("vi-VN")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {ln.receivedQty.toLocaleString("vi-VN")}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      ln.remainingQty > 0
                        ? "text-orange-700"
                        : "text-zinc-400",
                    )}
                  >
                    {ln.remainingQty.toLocaleString("vi-VN")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={ln.remainingQty}
                      step={1}
                      value={s.qty}
                      onChange={(e) =>
                        dispatch({
                          type: "set-qty",
                          lineId: ln.id,
                          qty: e.target.value,
                        })
                      }
                      disabled={!s.ticked || readOnly || isDone}
                      className={cn(
                        "ml-auto h-8 w-24 text-right tabular-nums",
                        overShot &&
                          "border-red-400 ring-1 ring-red-200 focus-visible:ring-red-300",
                      )}
                      aria-label={`Số lượng nhận lần này dòng ${ln.lineNo}`}
                    />
                    {overShot ? (
                      <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-red-600">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        Vượt còn lại
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        Lưu ý: chế độ nhanh sẽ ghi <span className="font-medium">qcStatus = Chờ kiểm</span>.
        Cần lot/serial chi tiết hoặc QC gắn ngay → dùng{" "}
        <a
          href={`/receiving/${poId}`}
          className="text-indigo-600 underline hover:text-indigo-800"
        >
          màn hình nhận hàng đầy đủ
        </a>
        .
      </p>
    </div>
  );
}
