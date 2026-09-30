import { actionLabel, prettifyUnknownCode } from "@/lib/status";
import type { RbacEntity } from "@iot/shared";

/**
 * V4.1 AD-02/AD-10 — danh mục loại đối tượng ghi trong `app.audit_event.object_type`.
 *
 * - `label`: nhãn tiếng Việt cho bộ lọc trang Nhật ký hệ thống (trước chỉ 6/37 loại).
 * - `entity`: entity RBAC tương ứng. Người KHÔNG phải admin chỉ được xem lịch sử
 *   của MỘT chứng từ cụ thể (có objectId) nếu đọc được chính chứng từ đó — ví dụ
 *   tab "Lịch sử" của lệnh SX. Loại không có `entity` → chỉ admin.
 *
 * Khi thêm `writeAudit({ objectType: "..." })` mới: bổ sung vào đây.
 */
export interface AuditObjectTypeDef {
  code: string;
  label: string;
  entity?: RbacEntity;
}

export const AUDIT_OBJECT_TYPES: AuditObjectTypeDef[] = [
  // Đăng nhập / phân quyền
  { code: "session", label: "Phiên đăng nhập" },
  { code: "login_failed", label: "Đăng nhập sai" },
  { code: "user_account", label: "Tài khoản" },
  { code: "user_permission_override", label: "Quyền riêng user" },
  // Danh mục
  { code: "item", label: "Vật tư", entity: "item" },
  { code: "item_supplier", label: "Vật tư – NCC", entity: "item" },
  { code: "item_barcode", label: "Mã vạch vật tư", entity: "item" },
  { code: "supplier", label: "Nhà cung cấp", entity: "supplier" },
  { code: "import_batch", label: "Nhập dữ liệu Excel", entity: "item" },
  // Thiết kế / BOM
  { code: "bom_template", label: "BOM", entity: "bomTemplate" },
  { code: "bom_line", label: "Dòng BOM", entity: "bomTemplate" },
  { code: "bom_revision", label: "Phiên bản BOM", entity: "bomRevision" },
  { code: "bom_sheet", label: "Sheet BOM", entity: "bomTemplate" },
  { code: "bom_sheet_material_row", label: "Sheet BOM – vật liệu", entity: "bomTemplate" },
  { code: "bom_sheet_process_row", label: "Sheet BOM – công đoạn", entity: "bomTemplate" },
  { code: "bom_snapshot_line", label: "Dòng snapshot BOM", entity: "bomSnapshot" },
  { code: "eco_change", label: "ECO", entity: "eco" },
  { code: "sales_order", label: "Đơn hàng bán", entity: "salesOrder" },
  // Sản xuất
  { code: "work_order", label: "Lệnh sản xuất", entity: "wo" },
  { code: "wo_progress_log", label: "Tiến độ lệnh SX", entity: "wo" },
  { code: "assembly_scan", label: "Quét lắp ráp", entity: "wo" },
  { code: "reservation", label: "Giữ vật tư", entity: "reservation" },
  { code: "reservation_batch", label: "Giữ vật tư (lô)", entity: "reservation" },
  { code: "qc_check", label: "Kiểm tra QC", entity: "wo" },
  { code: "qc_check_item", label: "Hạng mục QC", entity: "wo" },
  // Thu mua
  { code: "purchase_request", label: "Đề xuất vật tư", entity: "pr" },
  { code: "purchase_order", label: "Đơn mua (PO)", entity: "po" },
  { code: "material_request", label: "Yêu cầu vật tư", entity: "materialRequest" },
  // Kho
  { code: "receiving_event", label: "Nhận hàng", entity: "po" },
  { code: "inbound_receipt_line", label: "Dòng nhận hàng", entity: "po" },
  { code: "lot_serial", label: "Lô / serial", entity: "inventory" },
  { code: "location_bin", label: "Vị trí kho", entity: "inventory" },
  { code: "goods_issue", label: "Phiếu xuất kho", entity: "goodsIssue" },
  { code: "warehouse_issue_request", label: "Yêu cầu xuất kho", entity: "inventory" },
  { code: "delivery_note", label: "Phiếu giao hàng", entity: "deliveryNote" },
  // Tài chính
  { code: "fin_transaction", label: "Thu chi", entity: "finance" },
  { code: "fin_invoice", label: "Hoá đơn", entity: "finance" },
  { code: "fin_payment", label: "Thanh toán", entity: "finance" },
  { code: "fin_account", label: "Tài khoản tiền", entity: "finance" },
  { code: "fin_category", label: "Danh mục thu chi", entity: "finance" },
];

const BY_CODE = new Map(AUDIT_OBJECT_TYPES.map((t) => [t.code, t]));

/** V4.4 A14 — thiếu entry → prettify thay vì render thẳng key thô (xem lib/status.ts). */
export function auditObjectLabel(code: string): string {
  return BY_CODE.get(code)?.label ?? prettifyUnknownCode(code);
}

/**
 * Entity RBAC dùng để quyết định người không phải admin có được xem lịch sử 1
 * chứng từ hay không. `null` = không cho (chỉ admin).
 */
export function auditObjectEntity(code: string): RbacEntity | null {
  return BY_CODE.get(code)?.entity ?? null;
}

/**
 * Truy vấn nhật ký của người KHÔNG có quyền `read:audit` chỉ hợp lệ khi thu hẹp
 * về đúng 1 chứng từ: 1 loại đối tượng + objectId. Trả entity cần kiểm quyền đọc,
 * hoặc `null` nếu truy vấn quá rộng / loại đối tượng không cho xem.
 */
export function scopedAuditEntity(q: {
  entity?: string[] | undefined;
  objectId?: string | undefined;
}): RbacEntity | null {
  if (!q.objectId) return null;
  if (!q.entity || q.entity.length !== 1) return null;
  return auditObjectEntity(q.entity[0]!);
}

/** Các action có trong enum `audit_action` kèm nhãn tiếng Việt cho bộ lọc. */
/** V4.1 UI-27 (Đợt 6B): nhãn lấy từ `ACTION_LABELS` (lib/status) — 1 nguồn cho Nhật ký/hoạt động. */
export const AUDIT_ACTION_OPTIONS: Array<{ code: string; label: string }> = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "APPROVE",
  "TRANSITION",
  "CANCEL",
  "RECEIVE",
  "ISSUE",
  "RESERVE",
  "CONVERT",
  "RELEASE",
  "POST",
  "UPLOAD",
  "COMMIT",
  "SNAPSHOT",
  "WO_START",
  "WO_PAUSE",
  "WO_RESUME",
  "WO_COMPLETE",
  "QC_CHECK",
  "ECO_SUBMIT",
  "ECO_APPROVE",
  "ECO_APPLY",
  "ECO_REJECT",
].map((code) => ({ code, label: actionLabel(code) }));
