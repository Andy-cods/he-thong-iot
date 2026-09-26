import type { Role } from "../types";

/**
 * V1.4 RBAC matrix — 13 entity × 6 action × 4 role.
 *
 * Quy ước:
 * - Action cố định: create | read | update | delete | approve | transition.
 * - Entity là domain-concept (không phải table name) — ví dụ `bomTemplate`
 *   ↔ app.bom_template, `salesOrder` ↔ app.sales_order.
 * - Multi-role (OR): user có nhiều role → hợp quyền của cả nhóm.
 *
 * Khi thêm entity/action mới: cập nhật cả RBAC_MATRIX + type union + test.
 */
export type RbacAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "approve"
  | "transition";

export type RbacEntity =
  | "item"
  | "supplier"
  | "bomTemplate"
  | "bomRevision"
  | "salesOrder"
  | "bomSnapshot"
  | "pr"
  | "po"
  | "wo"
  | "reservation"
  | "eco"
  | "audit"
  | "user"
  | "session"
  | "inventory"
  | "report"
  // V3.8 — Bảng điều hành sản xuất (production board) cho Tổ QC.
  | "productionBoard"
  // V4.0 — Phân hệ Tài chính: thu chi, hoá đơn, thanh toán, công nợ, tài khoản
  // giao dịch. Kế toán CRUD; Cổ đông + Giám đốc (admin) xem.
  | "finance"
  // V4.0 — Phiếu giao hàng / Biên bản giao hàng (BBGH). Chỉ Giám đốc (admin)
  // duyệt; Kho + Thu mua theo dõi và nhận BBGH sau khi giao xong.
  | "deliveryNote"
  // V4.1 Đợt 1a — Xuất kho (phiếu xuất). `create` = xuất vật tư nội bộ;
  // `approve` = xuất bán/trả NCC (chỉ Giám đốc). Tạm thời gate
  // /api/warehouse/issue; Đợt 1b gắn bảng goods_issue.
  | "goodsIssue"
  // V4.1 Đợt 1a — QC nhập kho. `approve` = kết luận Đạt/Không đạt lô nhận;
  // `update` = đặt/nhả HOLD thủ công (MANUAL); `read` = xem màn Chờ QC.
  | "qcInspection"
  // V4.1 Đợt 1b — Phiếu yêu cầu vật tư (material_request). `create` = lập
  // phiếu (planner/operator/admin); `transition` = Kho chuẩn bị / huỷ; giao
  // hàng THẬT phải qua phiếu xuất (`create:goodsIssue`), không đổi trạng thái tay.
  | "materialRequest";

/** Partial vì không phải role nào cũng có action trên mọi entity. */
type Matrix = Record<Role, Partial<Record<RbacEntity, RbacAction[]>>>;

/**
 * Matrix chính — tham chiếu duy nhất cho `can()` + UI nav + API guard.
 * - Admin: full quyền trên mọi entity (bao gồm approve/transition/delete).
 * - Planner: CRUD nghiệp vụ (item/supplier/bom/order/snapshot/WO/PR);
 *   APPROVE PR + ECO; TRANSITION snapshot/WO; READ audit.
 * - Operator: READ base; CREATE receiving qua WO; TRANSITION WO/AO/snapshot
 *   (RESERVED→ISSUED→ASSEMBLED).
 * - Warehouse: READ base; CREATE receiving_event; TRANSITION snapshot
 *   (INBOUND_QC→AVAILABLE) + PO (nhận hàng).
 */
export const RBAC_MATRIX: Matrix = {
  admin: {
    item: ["create", "read", "update", "delete"],
    supplier: ["create", "read", "update", "delete"],
    bomTemplate: ["create", "read", "update", "delete"],
    bomRevision: ["create", "read", "update", "delete", "approve"],
    salesOrder: ["create", "read", "update", "delete", "approve", "transition"],
    bomSnapshot: ["create", "read", "update", "transition"],
    pr: ["create", "read", "update", "delete", "approve"],
    po: ["create", "read", "update", "delete", "approve", "transition"],
    wo: ["create", "read", "update", "delete", "approve", "transition"],
    reservation: ["create", "read", "update", "delete", "transition"],
    eco: ["create", "read", "update", "delete", "approve"],
    audit: ["read"],
    user: ["create", "read", "update", "delete"],
    session: ["read", "delete"],
    inventory: ["create", "read", "update", "delete"],
    // V3.7.61 admin có quyền xem report của bất kỳ user nào ("read").
    // V3.7.62 thêm action `update` cho admin để CRUD KPI targets.
    report: ["create", "read", "update", "delete"],
    // V3.8 — Bảng điều hành sản xuất.
    productionBoard: ["create", "read", "update", "delete"],
    // V4.0 — Giám đốc = admin: toàn quyền Tài chính + duyệt phiếu giao hàng.
    finance: ["create", "read", "update", "delete", "approve"],
    deliveryNote: ["create", "read", "update", "delete", "approve", "transition"],
    // V4.1 Đợt 1a — Giám đốc: xuất bán/trả NCC (approve) + kết luận QC.
    goodsIssue: ["create", "read", "delete", "approve"],
    qcInspection: ["read", "update", "approve"],
    // V4.1 Đợt 1b — toàn quyền phiếu yêu cầu vật tư.
    materialRequest: ["create", "read", "update", "delete", "transition"],
  },
  planner: {
    item: ["create", "read", "update"],
    supplier: ["create", "read", "update"],
    bomTemplate: ["create", "read", "update", "delete"],
    bomRevision: ["create", "read", "update", "approve"],
    salesOrder: ["create", "read", "update", "transition"],
    bomSnapshot: ["create", "read", "transition"],
    // V4.0 — planner MẤT `approve:pr`: bước 2 (Trưởng bộ phận) chuyển sang Kho,
    // bước 3 (Giám đốc) là admin/purchaser. Thiết kế chỉ còn tạo/sửa đề xuất.
    pr: ["create", "read", "update"],
    po: ["create", "read", "update"],
    wo: ["create", "read", "update", "transition"],
    reservation: ["create", "read", "update", "transition"],
    eco: ["create", "read", "update", "approve"],
    audit: ["read"],
    user: ["read"],
    session: ["read"],
    // V3.8 — planner xem bảng sản xuất (read-only).
    productionBoard: ["read"],
    // V4.1 Đợt 1a — planner xem phiếu xuất. KHÔNG có qcInspection: planner
    // mất quyền HOLD/nhả HOLD lô (KHO-12), vẫn giữ `reservation:update`.
    goodsIssue: ["read"],
    // V4.1 Đợt 1b — planner lập + sửa phiếu yêu cầu vật tư (không chuẩn bị/giao).
    materialRequest: ["create", "read", "update"],
  },
  operator: {
    item: ["read"],
    bomTemplate: ["read"],
    bomRevision: ["read"],
    salesOrder: ["read"],
    bomSnapshot: ["read", "transition"],
    // V3.7.55 — Bộ phận Gia công tạo Phiếu MRF GTAM gửi Thu mua duyệt.
    pr: ["create", "read"],
    po: ["read"],
    // V3.7.31 — operator được create wo (quick WO) + create reservation
    // (auto-FIFO ISR). Workflow xưởng: tự tạo WO khi nhận đơn nội bộ.
    wo: ["create", "read", "transition"],
    reservation: ["create", "read", "transition"],
    eco: ["read"],
    audit: ["read"],
    user: ["read"],
    session: ["read"],
    // V3.8 — operator xem bảng sản xuất (read-only).
    productionBoard: ["read"],
    // V4.1 Đợt 1a — operator xem phiếu xuất (vật tư đã giao cho xưởng).
    goodsIssue: ["read"],
    // V4.1 Đợt 1b (D6) — xưởng tự lập phiếu yêu cầu vật tư cho lệnh SX.
    materialRequest: ["create", "read"],
  },
  warehouse: {
    item: ["read"],
    supplier: ["read"],
    bomTemplate: ["read"],
    bomRevision: ["read"],
    salesOrder: ["read"],
    bomSnapshot: ["read", "transition"],
    // V3.7.55 — Bộ phận Kho tạo Phiếu MRF GTAM gửi Thu mua duyệt.
    // V4.0 — Kho LÀ "Trưởng bộ phận" của luồng YCVT: kiểm tra lượng tồn thực
    // tế rồi duyệt bước 2 (dept-approve). Quyền này chuyển từ planner sang.
    pr: ["create", "read", "update", "approve"],
    po: ["read", "update", "transition"],
    wo: ["read"],
    reservation: ["read"],
    eco: ["read"],
    audit: ["read"],
    user: ["read"],
    session: ["read"],
    // V3.7.53 — warehouse có quyền điều chỉnh tồn kho thủ công (manual adjust)
    // qua BOM list popover + receiving + transfer + putaway.
    inventory: ["create", "read", "update"],
    // V3.8 — warehouse xem bảng sản xuất (read-only).
    productionBoard: ["read"],
    // V4.0 — Kho lập phiếu giao hàng + cập nhật quá trình giao nhận, nhưng
    // KHÔNG duyệt (chỉ Giám đốc duyệt — yêu cầu nghiệp vụ V4.0).
    deliveryNote: ["create", "read", "update", "transition"],
    // V4.1 Đợt 1a — Kho xuất vật tư nội bộ (KHÔNG approve: bán/trả NCC phải
    // qua Giám đốc). Kho xem Chờ QC + HOLD/nhả HOLD thủ công, KHÔNG kết luận
    // QC Đạt/Không đạt (thuộc Tổ QC / Giám đốc).
    goodsIssue: ["create", "read"],
    qcInspection: ["read", "update"],
    // V4.1 Đợt 1b — Kho chuẩn bị (PICKING/READY), huỷ/đóng phiếu yêu cầu vật
    // tư; giao hàng bằng phiếu xuất (`create:goodsIssue`). KHÔNG lập phiếu.
    materialRequest: ["read", "update", "transition"],
  },
  // V3.3 — Purchaser (Bộ phận Thu mua): full PR/PO + read supplier/item/BOM
  purchaser: {
    item: ["read"],
    supplier: ["create", "read", "update"],
    bomTemplate: ["read"],
    bomRevision: ["read"],
    salesOrder: ["read"],
    bomSnapshot: ["read"],
    // V3.9 — Thu mua cũng tự đề xuất mua vật tư (create) ngoài duyệt PR.
    pr: ["create", "read", "update", "approve"],
    po: ["create", "read", "update", "transition"],
    wo: ["read"],
    reservation: ["read"],
    eco: ["read"],
    audit: ["read"],
    user: ["read"],
    session: ["read"],
    // V3.8 — purchaser xem bảng sản xuất (read-only).
    productionBoard: ["read"],
    // V4.0 — Thu mua nhận BBGH sau khi giao nhận xong (chỉ đọc + tải file).
    deliveryNote: ["read"],
  },
  // V3.8 — QC/KCS (Tổ kiểm tra chất lượng): toàn quyền Bảng điều hành sản xuất
  // (production board) + read các entity sản xuất để đối chiếu. KHÔNG đụng
  // PR/PO/BOM. Đây là role duy nhất ngoài admin được CRUD bảng sản xuất.
  qc: {
    item: ["read"],
    salesOrder: ["read"],
    bomSnapshot: ["read"],
    wo: ["read"],
    // V3.9 — QC tự đề xuất mua vật tư (dụng cụ đo, tiêu hao QC).
    pr: ["create", "read"],
    audit: ["read"],
    user: ["read"],
    session: ["read"],
    productionBoard: ["create", "read", "update", "delete"],
    // V4.1 Đợt 1a (KHO-12) — Tổ QC kết luận QC nhập kho (Đạt/Không đạt) +
    // HOLD/nhả HOLD thủ công. Trước đây role qc không có quyền kho nào.
    qcInspection: ["read", "update", "approve"],
  },
  // V3.8.2 — Display (kiosk TV): CHỈ đọc bảng sản xuất để chiếu màn hình.
  // Không sửa, không thấy gì khác. Phiên đăng nhập 24h (xem login route).
  display: {
    productionBoard: ["read"],
  },
  // V3.9 — Accountant (Bộ phận Kế toán): tạo + xem YCVT để tải PDF/Excel.
  // KHÔNG duyệt, KHÔNG PO. user/session read để dùng profile + admin hiển thị.
  accountant: {
    pr: ["create", "read"],
    user: ["read"],
    session: ["read"],
    // V4.0 — Kế toán là chủ sở hữu nghiệp vụ phân hệ Tài chính: ghi thu chi,
    // hoá đơn, thanh toán, công nợ, danh mục tài khoản giao dịch. KHÔNG có
    // `approve` (duyệt khoản chi lớn thuộc Giám đốc) và KHÔNG có `delete`
    // (chứng từ đã ghi phải huỷ bằng trạng thái VOID, giữ vết kiểm toán).
    finance: ["create", "read", "update"],
    // Kế toán đọc PO để đối chiếu công nợ nhà cung cấp với đơn mua.
    po: ["read"],
    // Đọc BBGH để đối chiếu chứng từ giao nhận khi thanh toán.
    deliveryNote: ["read"],
  },
  // V4.0 — Shareholder (Cổ đông): READ-ONLY. Chỉ theo dõi Tài chính (thu chi,
  // công nợ, dòng tiền) + tiến độ gia công/sản xuất. KHÔNG thấy BOM, đề xuất
  // vật tư, đơn mua, vật tư, nhà cung cấp — theo quyết định của user.
  shareholder: {
    finance: ["read"],
    productionBoard: ["read"],
    user: ["read"],
    session: ["read"],
  },
};

/** Danh sách entity/action để iterate khi build test hoặc UI. */
export const RBAC_ENTITIES: RbacEntity[] = [
  "item",
  "supplier",
  "bomTemplate",
  "bomRevision",
  "salesOrder",
  "bomSnapshot",
  "pr",
  "po",
  "wo",
  "reservation",
  "eco",
  "audit",
  "user",
  "session",
  "inventory",
  "report",
  "productionBoard",
  "finance",
  "deliveryNote",
  "goodsIssue",
  "qcInspection",
  "materialRequest",
];

export const RBAC_ACTIONS: RbacAction[] = [
  "create",
  "read",
  "update",
  "delete",
  "approve",
  "transition",
];
