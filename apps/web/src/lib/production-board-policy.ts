import {
  boardProductNameFromBom,
  boardUomForBom,
  normalizeBoardProductCode,
  type Role,
} from "@iot/shared";

/**
 * V4.4.2 — Việc 2 (Tổng quan Tài chính: đơn giá bán mã hàng Bảng sản xuất).
 *
 * Hàm quyền DUY NHẤT quyết định ai thấy/nhập được đơn giá bán + "Giá trị"
 * (SL × đơn giá) của mã hàng trên Bảng sản xuất — dùng CẢ server (lọc field
 * JSON API, `GET /api/production-board`, `GET .../history`) lẫn client (ẩn/
 * hiện ô nhập trong `BoardItemDialog`, cột "Giá trị" trong bảng quản lý).
 *
 * Phạm vi: admin (Giám đốc) + accountant (Kế toán) + purchaser (Thu mua).
 * QC, planner, operator, warehouse, display (TV xưởng), shareholder KHÔNG
 * thấy giá — kể cả khi họ có quyền đọc/sửa `productionBoard` (vd QC toàn
 * quyền CRUD bảng nhưng không phải vai "xem tài chính đơn hàng").
 *
 * Lưu ý: accountant hiện KHÔNG có quyền entity `productionBoard` trong RBAC
 * matrix (không vào được /production-board) — hàm này vẫn liệt kê accountant
 * vì được dùng ở ngữ cảnh khác (Tổng quan Tài chính tổng hợp số liệu phía
 * server, không đi qua guard productionBoard).
 */
const ORDER_VALUE_ROLES: ReadonlySet<Role> = new Set<Role>([
  "admin",
  "accountant",
  "purchaser",
]);

export function canSeeOrderValue(roles: readonly Role[] | null | undefined): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.some((r) => ORDER_VALUE_ROLES.has(r));
}

/**
 * V4.5 QA-C P2-1/QA-D P1-01 — giới hạn hợp lý cho đơn giá bán + SL kế hoạch
 * trên Bảng sản xuất. Trước đây không giới hạn: 1 dòng gõ nhầm (vd thêm vài
 * số 0 vào đơn giá, 999.999.999.999đ × 99.999) làm ô "Đang sản xuất" ở Tổng
 * quan Tài chính nhảy lên mức phi thực tế (~99.999 nghìn tỷ tỷ đồng), không
 * cảnh báo. Dùng CHUNG cho zod schema (API tạo/sửa mã hàng) + input UI
 * (`max` attribute, xem `BoardItemDialog.tsx`).
 */
export const BOARD_UNIT_PRICE_MAX = 10_000_000_000; // 10 tỷ ₫/đơn vị
export const BOARD_QTY_MAX = 10_000_000; // 10 triệu đơn vị

export const BOARD_UNIT_PRICE_MAX_MESSAGE = `Đơn giá tối đa ${BOARD_UNIT_PRICE_MAX.toLocaleString("vi-VN")} ₫.`;
export const BOARD_QTY_MAX_MESSAGE = `Số lượng tối đa ${BOARD_QTY_MAX.toLocaleString("vi-VN")}.`;

/**
 * V4.5 QA-C P2-2 — mã hàng Bảng sản xuất trùng `productCode` (+ `rfqNo`)
 * không bị chặn, tạo 2 dòng tiến độ riêng cho cùng 1 mã. THUẦN (không đụng
 * DB) → repo (`server/repos/productionBoard.ts`) chỉ query ứng viên CÙNG
 * `productCode` (narrow, rẻ) rồi gọi hàm ở đây để quyết định trùng hay không
 * — giữ đúng convention "logic thuần test vitest, repo chỉ fetch+ghép".
 */
export interface BoardItemIdentity {
  productCode: string;
  rfqNo: string | null;
}

/**
 * Coi 2 mã hàng là TRÙNG khi cùng `productCode` (so khớp y hệt sau khi trim —
 * mã hàng là code nội bộ, không phải tên tự do nên không cần bỏ dấu/fuzzy
 * như `lib/item-dedupe.ts`) VÀ cùng `rfqNo` (rỗng/null coi là cùng 1 giá trị
 * "không có RFQ" — 2 mã hàng cùng code nhưng khác RFQ là 2 đơn hàng khác
 * nhau, không phải trùng).
 */
export function isSameBoardItemIdentity(a: BoardItemIdentity, b: BoardItemIdentity): boolean {
  const codeA = a.productCode.trim();
  const codeB = b.productCode.trim();
  if (!codeA || !codeB || codeA !== codeB) return false;
  const rfqA = a.rfqNo?.trim() || null;
  const rfqB = b.rfqNo?.trim() || null;
  return rfqA === rfqB;
}

/** Tìm ứng viên trùng đầu tiên trong danh sách (vd kết quả query theo productCode). */
export function findDuplicateBoardItem<T extends BoardItemIdentity>(
  target: BoardItemIdentity,
  candidates: readonly T[],
): T | null {
  return candidates.find((c) => isSameBoardItemIdentity(target, c)) ?? null;
}

/* ── Sắp xếp dòng đang mở (chưa hoàn thành) ─────────────────────────────── */

const OPEN_STATUS_ORDER: Record<string, number> = { IN_PROGRESS: 0, QC: 1, QUEUED: 2 };

export interface BoardSortable {
  isPinned: boolean;
  deadline: string | null;
  status: string;
  seq: number;
}

/**
 * Dòng mở trên board: ghim lên đầu → hạn GẦN NHẤT trước (quá hạn tự nổi lên)
 * → dòng CHƯA CÓ hạn xếp sau dòng có hạn (đã gắn pill vàng "Chưa có ngày
 * giao" để QC điền, không đẩy hàng gấp xuống trên TV) → trạng thái → STT.
 * Hạn dạng YYYY-MM-DD nên so chuỗi = so ngày.
 */
export function compareOpenBoardRows(a: BoardSortable, b: BoardSortable): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  if (a.deadline !== b.deadline) {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline < b.deadline ? -1 : 1;
  }
  const so = (OPEN_STATUS_ORDER[a.status] ?? 9) - (OPEN_STATUS_ORDER[b.status] ?? 9);
  if (so !== 0) return so;
  return a.seq - b.seq;
}

/* ── Đồng bộ Bảng sản xuất khi BOM được kích hoạt ────────────────────────── */

export interface BoardRowLite {
  id: string;
  productCode: string;
  rfqNo: string | null;
  productName: string;
  customer: string | null;
  qtyPlanned: string;
  status: string;
  deadline: string | null;
  bomTemplateId: string | null;
}

export interface BomForBoard {
  id: string;
  code: string;
  name: string;
  targetQty: string | number;
  metadata: unknown;
}

/** Thông tin tuỳ chọn nhập ở hộp "Kích hoạt BOM" (bỏ trống = không đổi). */
export interface BoardActivationExtras {
  deadline?: string | null;
  rfqNo?: string | null;
  customer?: string | null;
}

export type BoardSyncPlan =
  | {
      action: "create";
      values: {
        productCode: string;
        productName: string;
        qtyPlanned: number;
        uom: string;
        deadline: string | null;
        rfqNo: string | null;
        customer: string | null;
        bomTemplateId: string;
      };
    }
  | {
      action: "update";
      itemId: string;
      patch: Partial<Pick<BoardRowLite, "productName" | "deadline" | "rfqNo" | "customer" | "bomTemplateId">> & {
        qtyPlanned?: number;
      };
      history: Array<{ field: string; oldValue: string | null; newValue: string | null }>;
    }
  | { action: "none"; itemId: string };

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/**
 * THUẦN — quyết định tạo mới / gắn liên kết / cập nhật dòng board cho BOM vừa
 * kích hoạt. `candidates` = dòng có thể liên quan (repo lọc thô theo mã), sắp
 * mới-cập-nhật trước.
 *  - Không nhân đôi: đã có dòng CHƯA GIAO cùng mã chuẩn hoá (hoặc đã gắn BOM
 *    này) → dùng dòng đó: gắn `bom_template_id` (gắn lại sang BOM mới nhất nếu
 *    đang trỏ BOM khác cùng mã), còn "Chờ GC" thì cập nhật tên + SL theo BOM.
 *  - Trường tuỳ chọn người dùng nhập lúc kích hoạt → ghi đè.
 *  - Không có → tạo "Chờ GC", hạn trống (trừ khi đã nhập).
 */
export function planBoardSyncFromBom(
  bom: BomForBoard,
  candidates: readonly BoardRowLite[],
  extras: BoardActivationExtras = {},
): BoardSyncPlan {
  const norm = normalizeBoardProductCode(bom.code);
  const productName = boardProductNameFromBom(bom.name, bom.code).slice(0, 2000);
  const qty = Math.min(Math.max(Number(bom.targetQty) || 0, 0), BOARD_QTY_MAX);
  const deadline = clean(extras.deadline);
  const rfqNo = clean(extras.rfqNo);
  const customer = clean(extras.customer);

  const open = candidates.filter(
    (c) =>
      c.status !== "DELIVERED" &&
      (c.bomTemplateId === bom.id || normalizeBoardProductCode(c.productCode) === norm),
  );
  const row = open.find((c) => c.bomTemplateId === bom.id) ?? open[0];

  if (!row) {
    return {
      action: "create",
      values: {
        productCode: norm,
        productName,
        qtyPlanned: qty,
        uom: boardUomForBom(bom.metadata),
        deadline,
        rfqNo,
        customer,
        bomTemplateId: bom.id,
      },
    };
  }

  const patch: Extract<BoardSyncPlan, { action: "update" }>["patch"] = {};
  const history: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  if (row.bomTemplateId !== bom.id) {
    patch.bomTemplateId = bom.id;
    history.push({ field: "bom_link", oldValue: row.bomTemplateId, newValue: bom.code });
  }
  if (row.status === "QUEUED") {
    if (row.productName !== productName) {
      patch.productName = productName;
      history.push({ field: "product_name", oldValue: row.productName, newValue: productName });
    }
    if (Number(row.qtyPlanned) !== qty) {
      patch.qtyPlanned = qty;
      history.push({ field: "qty_planned", oldValue: String(row.qtyPlanned), newValue: String(qty) });
    }
  }
  if (deadline && deadline !== row.deadline) {
    patch.deadline = deadline;
    history.push({ field: "deadline", oldValue: row.deadline, newValue: deadline });
  }
  if (rfqNo && rfqNo !== row.rfqNo) {
    patch.rfqNo = rfqNo;
    history.push({ field: "rfq_no", oldValue: row.rfqNo, newValue: rfqNo });
  }
  if (customer && customer !== row.customer) {
    patch.customer = customer;
    history.push({ field: "customer", oldValue: row.customer, newValue: customer });
  }
  if (history.length === 0) return { action: "none", itemId: row.id };
  return { action: "update", itemId: row.id, patch, history };
}
