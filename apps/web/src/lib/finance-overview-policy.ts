/**
 * V4.4.2 — Việc 2: công thức THUẦN (không import DB/React) cho 3 ô mới ở
 * Tổng quan Tài chính — "Đang sản xuất", "Dự trù thu", "Dự trù chi". Tách
 * riêng khỏi repo (`server/repos/productionBoard.ts`, `.../purchaseOrders.ts`)
 * theo đúng convention `lib/po-detail.ts`/`lib/procurement-policy.ts`: logic
 * tính toán là hàm thuần, test bằng vitest KHÔNG cần DB; repo chỉ fetch dữ
 * liệu thô rồi gọi hàm ở đây.
 */

/** Trạng thái Bảng sản xuất coi là "đang chạy" cho ô "Đang sản xuất". */
const IN_PRODUCTION_STATUSES = new Set(["QUEUED", "IN_PROGRESS", "QC"]);

export interface BoardValueRow {
  status: string;
  /** Postgres `numeric` → string qua Drizzle; chấp cả number cho test gọn. */
  qtyPlanned: number | string;
  qtyDone: number | string;
  unitPrice: number | string | null;
}

export interface BoardValueBucket {
  value: number;
  itemCount: number;
}

export interface BoardValueSummary {
  /** Σ(qty_planned × unit_price) — mã hàng QUEUED/IN_PROGRESS/QC. */
  inProduction: BoardValueBucket;
  /** Σ(qty_done × unit_price) — mã hàng COMPLETED (hoàn thành, chưa giao). */
  expectedReceivable: BoardValueBucket;
  /** Số mã hàng (2 nhóm trên) CHƯA nhập đơn giá — số liệu trên chưa đủ. */
  missingPriceCount: number;
}

/**
 * "Đang sản xuất" + "Dự trù thu" — 2 trong 3 công thức ô Tổng quan Tài chính.
 * `unit_price` NULL tính giá trị = 0 (không thổi phồng số) nhưng vẫn đếm vào
 * `missingPriceCount` để cảnh báo "số liệu chưa đủ". Mã hàng DELIVERED không
 * tính vào bên nào (đã giao — ra khỏi phạm vi "dự trù").
 */
export function computeBoardValueSummary(rows: readonly BoardValueRow[]): BoardValueSummary {
  let inProductionValue = 0;
  let inProductionCount = 0;
  let expectedReceivableValue = 0;
  let expectedReceivableCount = 0;
  let missingPriceCount = 0;

  for (const r of rows) {
    const isInProduction = IN_PRODUCTION_STATUSES.has(r.status);
    const isCompleted = r.status === "COMPLETED";
    if (!isInProduction && !isCompleted) continue; // DELIVERED/khác — bỏ qua.

    const hasPrice = r.unitPrice !== null && r.unitPrice !== undefined;
    if (!hasPrice) missingPriceCount += 1;
    const price = hasPrice ? Number(r.unitPrice) || 0 : 0;

    if (isInProduction) {
      inProductionValue += (Number(r.qtyPlanned) || 0) * price;
      inProductionCount += 1;
    } else {
      expectedReceivableValue += (Number(r.qtyDone) || 0) * price;
      expectedReceivableCount += 1;
    }
  }

  return {
    inProduction: { value: inProductionValue, itemCount: inProductionCount },
    expectedReceivable: { value: expectedReceivableValue, itemCount: expectedReceivableCount },
    missingPriceCount,
  };
}

export interface ExpectedPayableInput {
  /** `total_amount` của PO SENT/PARTIAL/RECEIVED CHƯA có hoá đơn mua active. */
  openPoAmounts: ReadonlyArray<number | string>;
  /** `total_amount` của hoá đơn mua (direction=IN) đang NHÁP (chưa xác nhận). */
  draftInvoiceAmounts: ReadonlyArray<number | string>;
}

export interface ExpectedPayableSummary {
  poValue: number;
  poCount: number;
  draftInvoiceValue: number;
  draftInvoiceCount: number;
  /** Tổng = poValue + draftInvoiceValue (KHÔNG cộng HĐ đã xác nhận — tránh đếm trùng Công nợ phải trả). */
  value: number;
}

/** "Dự trù chi" — công thức thứ 3. */
export function computeExpectedPayable(input: ExpectedPayableInput): ExpectedPayableSummary {
  const poValue = input.openPoAmounts.reduce<number>((s, v) => s + (Number(v) || 0), 0);
  const draftInvoiceValue = input.draftInvoiceAmounts.reduce<number>(
    (s, v) => s + (Number(v) || 0),
    0,
  );
  return {
    poValue,
    poCount: input.openPoAmounts.length,
    draftInvoiceValue,
    draftInvoiceCount: input.draftInvoiceAmounts.length,
    value: poValue + draftInvoiceValue,
  };
}
