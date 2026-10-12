/**
 * N2 — chia các lô/vị trí FIFO (gợi ý MỘT lần cho TỔNG SL của một vật tư) xuống các dòng phiếu cùng
 * vật tư, theo thứ tự dòng. Tránh lỗi gọi FIFO riêng từng dòng → hai dòng cùng lấy một lô, tổng vượt
 * tồn lô ("lô chỉ còn 3, không đủ xuất 5") dù tổng tồn đủ. THUẦN.
 */
export interface SplitPick {
  lotSerialId: string;
  binId: string;
  qty: number;
  lotCode?: string | null;
  binFullCode?: string;
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function splitPicksAcrossLines<P extends SplitPick>(
  wanted: ReadonlyArray<{ lineId: string; qty: number }>,
  picks: ReadonlyArray<P>,
): Map<string, P[]> {
  const out = new Map<string, P[]>(wanted.map((w) => [w.lineId, []]));
  const pool = picks.map((p) => ({ p, left: p.qty }));
  let k = 0;
  for (const w of wanted) {
    let need = w.qty;
    while (need > 1e-9 && k < pool.length) {
      const cur = pool[k]!;
      const take = r4(Math.min(need, cur.left));
      if (take > 0) out.get(w.lineId)!.push({ ...cur.p, qty: take });
      need = r4(need - take);
      cur.left = r4(cur.left - take);
      if (cur.left <= 1e-9) k += 1;
      if (take <= 0) break;
    }
  }
  return out;
}
