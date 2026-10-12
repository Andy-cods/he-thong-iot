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
  recheck = false,
}: {
  prId: string;
  /** Kiểm tồn lại (sổ dòng): giá trị trả ra là "SL cần mua THÊM" theo dòng. */
  recheck?: boolean;
  /** Duyệt Kho: lineId → SL cần mua; Kiểm tồn lại: lineId → SL cần mua thêm. valid=false khi có ô sai. */
  onChange: (qtys: Record<string, number>, valid: boolean) => void;
}) {
  if (recheck) return <RecheckLedgerPanel prId={prId} onChange={onChange} />;
  return <DeptStockPanel prId={prId} onChange={onChange} />;
}

function DeptStockPanel({
  prId,
  onChange,
}: {
  prId: string;
  onChange: (buyQtys: Record<string, number>, valid: boolean) => void;
}) {
  const recheck = false;
  const q = usePrStockCheck(prId, true, false);
  const lines = q.data?.data.lines;
  const [values, setValues] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!lines) return;
    setValues(Object.fromEntries(lines.map((l) => [l.id, String(l.defaultBuyQty ?? 0)])));
  }, [lines]);

  const parsed = React.useCallback(
    (raw: string | undefined) =>
      raw === undefined || raw.trim() === "" ? NaN : Number(raw.replace(",", ".")),
    [],
  );

  // N4 — tồn LŨY KẾ tính lại theo giá trị đang nhập: dòng sau thấy tồn đã trừ phần Kho xuất
  // cho các dòng trước cùng vật tư (theo SL cần mua vừa sửa). Vượt tồn → không cho xác nhận.
  const calc = React.useMemo(() => {
    const rows = new Map<string, { left: number; over: boolean; fromStock: number }>();
    if (!lines) return { rows, overMsg: null as string | null };
    const used = new Map<string, number>();
    let overMsg: string | null = null;
    for (const l of lines) {
      const n = parsed(values[l.id]);
      const buy = Number.isFinite(n) ? n : l.qty;
      const fromStock = l.itemId ? Math.max(0, l.qty - buy) : 0;
      const total = l.stockTotal ?? l.available;
      const left = l.itemId ? Math.max(0, total - (used.get(l.itemId) ?? 0)) : 0;
      const over = fromStock > left + 1e-6;
      if (l.itemId) used.set(l.itemId, (used.get(l.itemId) ?? 0) + fromStock);
      rows.set(l.id, { left, over, fromStock });
      if (over && !overMsg) {
        overMsg = `Dòng ${l.lineNo}: xuất từ kho ${fmtNumVN(fromStock)} nhưng tồn khả dụng chỉ còn ${fmtNumVN(left)} — tăng SL cần mua hoặc giảm phần xuất.`;
      }
    }
    return { rows, overMsg };
  }, [lines, values, parsed]);

  React.useEffect(() => {
    if (!lines) return;
    const out: Record<string, number> = {};
    let valid = true;
    for (const l of lines) {
      const n = parsed(values[l.id]);
      if (!Number.isFinite(n) || n < 0 || n > l.qty + 1e-9) valid = false;
      if (calc.rows.get(l.id)?.over) valid = false;
      out[l.id] = Number.isFinite(n) ? n : 0;
    }
    onChange(out, valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, lines, calc]);

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
        Tồn khả dụng là số TẠI THỜI ĐIỂM NÀY (đã trừ hàng giữ chỗ/HOLD và phần đã dành cho các
        phiếu khác đã qua Kho duyệt). Ô “SL cần mua” là phần phải mua thêm; phần còn lại Kho xuất
        từ tồn.
        {recheck
          ? " Kiểm tồn lại: cột Đề xuất đã trừ phần Kho đã xuất; nếu phải mua thêm, phiếu quay về chờ duyệt cuối."
          : ""}
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
              const row = calc.rows.get(l.id);
              const bad =
                raw.trim() === "" ||
                !Number.isFinite(n) ||
                n < 0 ||
                n > l.qty + 1e-9 ||
                !!row?.over;
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
                      (row?.over || (row?.left ?? 0) < l.qty ? "text-rose-600" : "text-emerald-600")
                    }
                  >
                    {l.itemId ? fmtNumVN(row?.left ?? l.available) : "—"}
                    {l.itemId && l.stockTotal != null && l.stockTotal !== (row?.left ?? l.available) ? (
                      <div className="text-[11px] font-normal text-zinc-500">
                        (tồn khả dụng {fmtNumVN(l.stockTotal)}, dòng trên đã dùng)
                      </div>
                    ) : null}
                    {l.itemId && (l.reservedByOthers ?? 0) > 0 ? (
                      <div className="text-[11px] font-normal text-amber-600">
                        đã dành cho phiếu khác: {fmtNumVN(l.reservedByOthers)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {/* C3 — dòng nhập tay (chưa có vật tư danh mục) không xuất kho được: phải mua đủ. */}
                    {!l.itemId ? (
                      <div className="mb-0.5 text-[11px] text-zinc-500">Dòng nhập tay — mua đủ</div>
                    ) : null}
                    <Input
                      inputMode="decimal"
                      disabled={!l.itemId}
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
      {calc.overMsg ? (
        <p role="alert" className="text-sm text-rose-600">
          {calc.overMsg}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Kiểm tồn lại theo SỔ DÒNG: mỗi dòng hiện Đề xuất · Đã xuất · Đã mua/đã về · Còn phải đáp ứng ·
 * Tồn khả dụng (đã trừ phần phiếu khác giữ và hàng PO của chính phiếu chưa xuất) · ô "SL cần mua
 * thêm" (0 ≤ x ≤ còn phải đáp ứng). Phần còn lại (còn phải đáp ứng − mua thêm) Kho xuất từ tồn.
 */
function RecheckLedgerPanel({
  prId,
  onChange,
}: {
  prId: string;
  onChange: (addQtys: Record<string, number>, valid: boolean) => void;
}) {
  const q = usePrStockCheck(prId, true, true);
  const lines = q.data?.data.lines;
  const [values, setValues] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!lines) return;
    setValues(
      Object.fromEntries(lines.filter((l) => l.itemId).map((l) => [l.id, String(l.defaultAddQty ?? 0)])),
    );
  }, [lines]);

  const parse = (raw: string | undefined) =>
    raw === undefined || raw.trim() === "" ? NaN : Number(raw.replace(",", "."));

  const calc = React.useMemo(() => {
    const rows = new Map<string, { left: number; over: boolean; fromStock: number }>();
    if (!lines) return { rows, overMsg: null as string | null };
    const used = new Map<string, number>();
    const firstAvail = new Map<string, number>();
    let overMsg: string | null = null;
    for (const l of lines) {
      if (!l.itemId) continue;
      if (!firstAvail.has(l.itemId)) firstAvail.set(l.itemId, l.available);
      const n = parse(values[l.id]);
      const add = Number.isFinite(n) ? n : 0;
      const fromStock = Math.max(0, (l.stillNeeded ?? 0) - add);
      const left = Math.max(0, (firstAvail.get(l.itemId) ?? 0) - (used.get(l.itemId) ?? 0));
      const over = fromStock > left + 1e-6;
      used.set(l.itemId, (used.get(l.itemId) ?? 0) + fromStock);
      rows.set(l.id, { left, over, fromStock });
      if (over && !overMsg) {
        overMsg = `Dòng ${l.lineNo}: xuất từ kho ${fmtNumVN(fromStock)} nhưng tồn khả dụng chỉ còn ${fmtNumVN(left)} — tăng SL cần mua thêm.`;
      }
    }
    return { rows, overMsg };
  }, [lines, values]);

  React.useEffect(() => {
    if (!lines) return;
    const out: Record<string, number> = {};
    let valid = true;
    for (const l of lines) {
      if (!l.itemId) continue;
      const n = parse(values[l.id]);
      if (!Number.isFinite(n) || n < 0 || n > (l.stillNeeded ?? 0) + 1e-9) valid = false;
      if (calc.rows.get(l.id)?.over) valid = false;
      out[l.id] = Number.isFinite(n) ? n : 0;
    }
    onChange(out, valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, lines, calc]);

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang tính sổ dòng…
      </div>
    );
  }
  if (q.isError || !lines) {
    return (
      <p className="py-2 text-sm text-rose-600">
        {(q.error as Error | null)?.message ?? "Không tải được dữ liệu kiểm tồn lại."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        “Còn phải đáp ứng” = Đề xuất − max(Đã xuất, Đã về đạt QC). Hàng PO đã về được tính một lần —
        không mua lại. Phần không mua thêm sẽ do Kho xuất từ tồn khả dụng.
      </p>
      <div className="max-h-[50vh] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-2 py-1.5 text-left">Vật tư</th>
              <th className="px-2 py-1.5 text-right">Đề xuất</th>
              <th className="px-2 py-1.5 text-right">Đã xuất</th>
              <th className="px-2 py-1.5 text-right">Đã mua / đã về</th>
              <th className="px-2 py-1.5 text-right">Còn phải đáp ứng</th>
              <th className="px-2 py-1.5 text-right">Khả dụng</th>
              <th className="px-2 py-1.5 text-right">Cần mua thêm</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const raw = values[l.id] ?? "";
              const n = Number(raw.replace(",", "."));
              const row = calc.rows.get(l.id);
              const bad =
                !!l.itemId &&
                (raw.trim() === "" ||
                  !Number.isFinite(n) ||
                  n < 0 ||
                  n > (l.stillNeeded ?? 0) + 1e-9 ||
                  !!row?.over);
              return (
                <tr key={l.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-1.5">
                    <div className="font-medium">{l.name ?? l.sku ?? `Dòng ${l.lineNo}`}</div>
                    {l.sku ? <div className="font-mono text-xs text-zinc-500">{l.sku}</div> : null}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmtNumVN(l.qty)} {l.uom ?? ""}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumVN(l.issuedQty ?? 0)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmtNumVN(l.orderedEffective ?? 0)} / {fmtNumVN(l.receivedOk ?? 0)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                    {l.itemId ? fmtNumVN(l.stillNeeded ?? 0) : "—"}
                  </td>
                  <td
                    className={
                      "px-2 py-1.5 text-right tabular-nums " +
                      (row?.over ? "text-rose-600" : "text-emerald-600")
                    }
                  >
                    {l.itemId ? fmtNumVN(row?.left ?? l.available) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {!l.itemId ? (
                      <div className="text-[11px] text-zinc-500">Dòng nhập tay — theo dõi PO</div>
                    ) : (
                      <Input
                        inputMode="decimal"
                        value={raw}
                        onChange={(e) => setValues((v) => ({ ...v, [l.id]: e.target.value }))}
                        aria-label={`SL cần mua thêm dòng ${l.lineNo}`}
                        aria-invalid={bad}
                        className={"ml-auto h-8 w-24 text-right tabular-nums " + (bad ? "border-rose-500" : "")}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {calc.overMsg ? (
        <p role="alert" className="text-sm text-rose-600">
          {calc.overMsg}
        </p>
      ) : null}
    </div>
  );
}
