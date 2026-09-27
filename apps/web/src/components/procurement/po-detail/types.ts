import type { PODetailResponse, POLineRow } from "@/hooks/usePurchaseOrders";

/** V4.1 PO-UI: kiểu dùng chung các khối của trang chi tiết PO. */
export type PoDetail = PODetailResponse["data"];
export type PoLine = POLineRow;

/** Form sửa phần đầu PO (DRAFT: tất cả; SENT: Ngày dự kiến + Ghi chú). */
export interface PoHeaderForm {
  expectedEta: string;
  paymentTerms: string;
  deliveryAddress: string;
  notes: string;
}

/** Dòng PO trong chế độ sửa DRAFT (thêm/xoá vật tư, SL, giá). */
export interface EditableLine {
  id?: string;
  itemId: string;
  sku: string;
  itemName: string;
  uom?: string;
  orderedQty: string;
  unitPrice: string;
  taxRate: string;
  notes: string;
  /** V4.1 TM-03 — giữ liên kết snapshot + quy cách DNVT + ETA dòng khi sửa. */
  snapshotLineId: string | null;
  spec: string | null;
  expectedEta: string | null;
}

/** V4.1 TM-04 — VAT 0% hợp lệ (trước đây `|| 8` biến 0 thành 8). */
export function parseTaxRate(v: string): number {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) ? n : 8;
}
