"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePrStockCheck } from "@/hooks/usePurchaseRequests";
import { fmtNumVN } from "@/components/procurement/prStockFormat";

/**
 * Kho kiểm tồn ở bước duyệt: mỗi dòng hiện SL đề xuất, tồn KHẢ DỤNG HIỆN TẠI
 * (lô AVAILABLE trừ giữ chỗ, không tính HOLD) và ô "SL cần mua"
 * (0 ≤ x ≤ SL đề xuất; mặc định = max(0, đề xuất − khả dụng)). Giá trị gửi lên
 * dept-approve / quick-approve (`buyQtys`) — server mới ghi approved_qty.
 */
export function PrStockCheckPanel({
  prId,
  onChange,
}: {
  prId: string;
  /** buyQtys = lineId → SL cần mua; valid=false khi có ô ngoài khoảng cho phép. */
  onChange: (buyQtys: Record<string, number>, valid: boolean) => void;
}) {
  const q = usePrStockCheck(prId, true);
  const lines = q.data?.data.lines;
  const [values, setValues] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!lines) return;
    setValues(Object.fromEntries(lines.map((l) => [l.id, String(l.defaultBuyQty)])));
  }, [lines]);

  React.useEffect(() => {
    if (!lines) return;
    const out: Record<string, number> = {};
    let valid = true;
    for (const l of lines) {
      const raw = values[l.id];
      const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw.replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > l.qty + 1e-9) valid = false;
      out[l.id] = Number.isFinite(n) ? n : 0;
    }
    onChange(out, valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, lines]);

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang kiểm tồn kho…
      </div>
    );
  }
  if (q.isError || !lines) {
    return (
      <p className="py-2 text-sm text-rose-600">
        Không tải được tồn kho — vẫn duyệt được, hệ thống sẽ tự tính SL cần mua theo tồn hiện tại.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Tồn khả dụng là số TẠI THỜI ĐIỂM NÀY (đã trừ hàng giữ chỗ/HOLD). Ô “SL cần mua” là phần
        phải mua thêm; phần còn lại Kho xuất từ tồn.
      </p>
      <div className="max-h-[50vh] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-2 py-1.5 text-left">Vật tư</th>
              <th className="px-2 py-1.5 text-right">Đề xuất</th>
              <th className="px-2 py-1.5 text-right">Tồn khả dụng</th>
              <th className="px-2 py-1.5 text-right">SL cần mua</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const raw = values[l.id] ?? "";
              const n = Number(raw.replace(",", "."));
              const bad = raw.trim() === "" || !Number.isFinite(n) || n < 0 || n > l.qty + 1e-9;
              return (
                <tr key={l.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-1.5">
                    <div className="font-medium">{l.name ?? l.sku ?? `Dòng ${l.lineNo}`}</div>
                    {l.sku ? <div className="font-mono text-xs text-zinc-500">{l.sku}</div> : null}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmtNumVN(l.qty)} {l.uom ?? ""}
                  </td>
                  <td
                    className={
                      "px-2 py-1.5 text-right tabular-nums " +
                      (l.available < l.qty ? "text-rose-600" : "text-emerald-600")
                    }
                  >
                    {l.itemId ? fmtNumVN(l.available) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Input
                      inputMode="decimal"
                      value={raw}
                      onChange={(e) => setValues((v) => ({ ...v, [l.id]: e.target.value }))}
                      aria-label={`SL cần mua dòng ${l.lineNo}`}
                      aria-invalid={bad}
                      className={"ml-auto h-8 w-24 text-right tabular-nums " + (bad ? "border-rose-500" : "")}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
