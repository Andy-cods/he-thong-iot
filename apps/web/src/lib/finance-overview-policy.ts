/**
 * V4.4.2 — Việc 2: công thức THUẦN (không import DB/React) cho 3 ô mới ở
 * Tổng quan Tài chính — "Đang sản xuất", "Dự trù thu", "Dự trù chi". Tách
 * riêng khỏi repo (`server/repos/productionBoard.ts`, `.../purchaseOrders.ts`)
 * theo đúng convention `lib/po-detail.ts`/`lib/procurement-policy.ts`: logic
 * tính toán là hàm thuần, test bằng vitest KHÔNG cần DB; repo chỉ fetch dữ
 * liệu thô rồi gọi hàm ở đây.
 *
 * TASK-20261001 — gộp "Đang sản xuất" + "Dự trù thu" cũ thành 1 ô "Dự trù
 * thu" duy nhất (2 dòng chia nhỏ: Đang gia công / Đã xong chờ giao); bỏ
 * QUEUED khỏi phạm vi tính (mã hàng CHƯA bắt đầu gia công — chưa đủ chắc chắn
 * để tính vào dự trù thu). Thêm công thức "Dự trù chi" phần (a) — công nợ
 * phải trả sắp đến hạn nhóm theo NHÀ CUNG CẤP × mốc hạn.
 */

/**
 * Trạng thái Bảng sản xuất coi là "đang gia công" cho ô Dự trù thu (dùng
 * qty_planned). KHÔNG gồm QUEUED (chưa bắt đầu — chưa đủ chắc chắn) lẫn
 * DELIVERED (đã giao, ra khỏi phạm vi dự trù).
 */
const IN_PROGRESS_STATUSES = new Set(["IN_PROGRESS", "QC"]);
/** Trạng thái coi là "đã xong chờ giao" (dùng qty_done). */
const COMPLETED_STATUS = "COMPLETED";

/**
 * V4.5 QA-D P1-01 — giá trị 1 dòng (qty × unit_price) vượt ngưỡng này coi là
 * "bất thường" (vd gõ nhầm thêm số 0 vào đơn giá) → BỎ QUA khỏi tổng hiển thị
 * (không cộng số vô nghĩa vào ô "Dự trù thu") + đếm riêng để UI cảnh báo "N
 * dòng có giá bất thường". Độc lập với cap nhập liệu ở
 * `lib/production-board-policy.ts` (BOARD_UNIT_PRICE_MAX × BOARD_QTY_MAX vẫn
 * có thể nhân ra > ngưỡng này, và dữ liệu cũ trước khi có cap vẫn cần lọc).
 */
export const ABNORMAL_LINE_VALUE_THRESHOLD = 10_000_000_000; // 10 tỷ ₫/dòng

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
  /**
   * TASK-20261001 — "Dự trù thu" GỘP (Đang gia công + Đã xong chờ giao).
   * `value`/`itemCount` = tổng 2 nhóm con bên dưới.
   */
  expectedReceivable: BoardValueBucket & {
    /** Σ(qty_planned × unit_price) — mã hàng IN_PROGRESS/QC. */
    inProgress: BoardValueBucket;
    /** Σ(qty_done × unit_price) — mã hàng COMPLETED (hoàn thành, chưa giao). */
    completed: BoardValueBucket;
  };
  /** Số mã hàng (2 nhóm trên) CHƯA nhập đơn giá — số liệu trên chưa đủ. */
  missingPriceCount: number;
  /**
   * V4.5 QA-D P1-01 — số dòng có giá trị (qty × unit_price) vượt
   * `ABNORMAL_LINE_VALUE_THRESHOLD`, bị LOẠI khỏi tổng trên (không cộng số
   * vô nghĩa) — UI hiện cảnh báo "N dòng có giá bất thường" thay vì im lặng.
   */
  abnormalCount: number;
}

/**
 * "Dự trù thu" — Σ giá trị các mã hàng ĐANG GIA CÔNG (IN_PROGRESS/QC, dùng
 * qty_planned) + ĐÃ XONG chờ giao (COMPLETED, dùng qty_done). `unit_price`
 * NULL tính giá trị = 0 (không thổi phồng số) nhưng vẫn đếm vào
 * `missingPriceCount` để cảnh báo "số liệu chưa đủ". Mã hàng QUEUED (chưa bắt
 * đầu) và DELIVERED (đã giao) không tính vào bên nào. Dòng có giá trị vượt
 * ngưỡng bất thường (V4.5 QA-D P1-01) bị loại khỏi tổng, đếm riêng.
 */
export function computeBoardValueSummary(rows: readonly BoardValueRow[]): BoardValueSummary {
  let inProgressValue = 0;
  let inProgressCount = 0;
  let completedValue = 0;
  let completedCount = 0;
  let missingPriceCount = 0;
  let abnormalCount = 0;

  for (const r of rows) {
    const isInProgress = IN_PROGRESS_STATUSES.has(r.status);
    const isCompleted = r.status === COMPLETED_STATUS;
    if (!isInProgress && !isCompleted) continue; // QUEUED/DELIVERED/khác — bỏ qua.

    const hasPrice = r.unitPrice !== null && r.unitPrice !== undefined;
    if (!hasPrice) missingPriceCount += 1;
    const price = hasPrice ? Number(r.unitPrice) || 0 : 0;
    const qty = isInProgress ? Number(r.qtyPlanned) || 0 : Number(r.qtyDone) || 0;
    const lineValue = qty * price;

    if (lineValue > ABNORMAL_LINE_VALUE_THRESHOLD) {
      abnormalCount += 1;
      continue; // bỏ qua khỏi tổng — không cộng số vô nghĩa.
    }

    if (isInProgress) {
      inProgressValue += lineValue;
      inProgressCount += 1;
    } else {
      completedValue += lineValue;
      completedCount += 1;
    }
  }

  return {
    expectedReceivable: {
      value: inProgressValue + completedValue,
      itemCount: inProgressCount + completedCount,
      inProgress: { value: inProgressValue, itemCount: inProgressCount },
      completed: { value: completedValue, itemCount: completedCount },
    },
    missingPriceCount,
    abnormalCount,
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

/** "Dự trù chi" phần (b) — khoản sắp chi KHÔNG có công nợ (PO chưa HĐ + HĐ nháp). */
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

/**
 * TASK-20261001 — "Dự trù chi" phần (a): công nợ phải trả SẮP ĐẾN HẠN, nhóm
 * theo NHÀ CUNG CẤP × mốc hạn tính từ hôm nay. 6 mốc theo yêu cầu nghiệp vụ
 * (KHÁC bucket "CURRENT/1-30/31-60/61-90/90+" của `getPayablesAging()` dùng
 * cho KPI "Công nợ phải trả" tổng — ô Dự trù chi cần mốc mịn hơn để lên kế
 * hoạch dòng tiền gần).
 */
export const PAYABLE_DUE_BUCKETS = [
  "OVERDUE",
  "0-30",
  "31-45",
  "46-60",
  "61-90",
  "90+",
] as const;
export type PayableDueBucket = (typeof PAYABLE_DUE_BUCKETS)[number];

export const PAYABLE_DUE_BUCKET_LABELS: Record<PayableDueBucket, string> = {
  OVERDUE: "Quá hạn",
  "0-30": "≤ 30 ngày",
  "31-45": "31–45 ngày",
  "46-60": "46–60 ngày",
  "61-90": "61–90 ngày",
  "90+": "> 90 ngày",
};

export interface PayableRawRow {
  /** null khi HĐ không gắn NCC (dữ liệu cũ) — nhóm vào "(Không rõ NCC)" theo `supplierName`. */
  supplierId: string | null;
  supplierName: string;
  /** ISO yyyy-mm-dd; null = chưa có hạn (coi như cần theo dõi sớm — xem `classifyPayableDueBucket`). */
  dueDate: string | null;
  outstandingAmount: number | string;
}

export interface PayableBucketRow {
  supplierId: string | null;
  supplierName: string;
  bucket: PayableDueBucket;
  amount: number;
  invoiceCount: number;
}

export interface PayableSupplierTotal {
  supplierId: string | null;
  supplierName: string;
  total: number;
  invoiceCount: number;
}

export interface PayablesBySupplierBucketSummary {
  /** 1 dòng / (NCC, mốc hạn) có dư nợ > 0 — dùng vẽ bảng NCC × mốc hạn. */
  rows: PayableBucketRow[];
  /** Tổng theo NCC (mọi mốc hạn) — sắp giảm dần, dùng xếp hạng "nợ nhiều nhất". */
  totalBySupplier: PayableSupplierTotal[];
  /** Tổng theo mốc hạn (mọi NCC). */
  totalByBucket: Record<PayableDueBucket, number>;
  /** Σ mốc OVERDUE + "0-30" — phần cộng vào tổng "Dự trù chi" (cần chi SỚM). */
  dueSoonAmount: number;
  /** Tổng toàn bộ công nợ phải trả còn nợ (mọi mốc hạn) — hiện ở Sheet chi tiết. */
  grandTotal: number;
}

/**
 * Phân loại mốc hạn theo số ngày còn lại tới `dueDate` (âm = đã quá hạn).
 * `dueDate` null (hoá đơn chưa ghi hạn) → xếp vào "0-30" thận trọng (không
 * ẩn khoản nợ khỏi tầm nhìn gần — tốt hơn là rơi vào "90+" và bị bỏ quên).
 */
export function classifyPayableDueBucket(dueDate: string | null, today: string): PayableDueBucket {
  if (!dueDate) return "0-30";
  const days = daysUntil(dueDate, today);
  if (days < 0) return "OVERDUE";
  if (days <= 30) return "0-30";
  if (days <= 45) return "31-45";
  if (days <= 60) return "46-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function daysUntil(dueDateIso: string, todayIso: string): number {
  const due = Date.parse(`${dueDateIso}T00:00:00Z`);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  return Math.round((due - today) / 86_400_000);
}

/**
 * Nhóm công nợ phải trả còn nợ theo (NHÀ CUNG CẤP, mốc hạn) — hàm THUẦN, repo
 * chỉ fetch HĐ mua (direction=IN) đã xác nhận (status UNPAID/PARTIAL/OVERDUE
 * — KHÔNG gồm DRAFT) còn dư nợ (`total_amount - paid_amount`) rồi gọi hàm
 * này. `today` truyền vào (KHÔNG dùng `new Date()` trong hàm thuần) để test
 * xác định được.
 */
export function groupPayablesBySupplierAndBucket(
  rows: readonly PayableRawRow[],
  today: string,
): PayablesBySupplierBucketSummary {
  const bucketMap = new Map<string, PayableBucketRow>();
  const supplierMap = new Map<string, PayableSupplierTotal>();
  const totalByBucket: Record<PayableDueBucket, number> = {
    OVERDUE: 0,
    "0-30": 0,
    "31-45": 0,
    "46-60": 0,
    "61-90": 0,
    "90+": 0,
  };
  let dueSoonAmount = 0;
  let grandTotal = 0;

  for (const r of rows) {
    const amount = Number(r.outstandingAmount) || 0;
    if (amount <= 0) continue; // HĐ đã trả hết (sai số làm tròn) — bỏ qua.

    const bucket = classifyPayableDueBucket(r.dueDate, today);
    const supplierKey = r.supplierId ?? `__noid__:${r.supplierName}`;
    const bucketKey = `${supplierKey}::${bucket}`;

    const existingBucket = bucketMap.get(bucketKey);
    if (existingBucket) {
      existingBucket.amount += amount;
      existingBucket.invoiceCount += 1;
    } else {
      bucketMap.set(bucketKey, {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        bucket,
        amount,
        invoiceCount: 1,
      });
    }

    const existingSupplier = supplierMap.get(supplierKey);
    if (existingSupplier) {
      existingSupplier.total += amount;
      existingSupplier.invoiceCount += 1;
    } else {
      supplierMap.set(supplierKey, {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        total: amount,
        invoiceCount: 1,
      });
    }

    totalByBucket[bucket] += amount;
    grandTotal += amount;
    if (bucket === "OVERDUE" || bucket === "0-30") dueSoonAmount += amount;
  }

  return {
    rows: Array.from(bucketMap.values()).sort((a, b) => b.amount - a.amount),
    totalBySupplier: Array.from(supplierMap.values()).sort((a, b) => b.total - a.total),
    totalByBucket,
    dueSoonAmount,
    grandTotal,
  };
}
