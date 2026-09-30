/**
 * V4.1 UI-07/08 (Đợt 6B, X2) — NGUỒN DUY NHẤT nhãn tiếng Việt + tông màu cho
 * mọi trạng thái nghiệp vụ. Trước đây ~45 file tự khai báo map riêng → cùng
 * 1 trạng thái hiện 3 chữ khác nhau ("Hoạt động" / "Đang dùng" / "Active") và
 * "Đã huỷ" khi đỏ khi xám.
 *
 * Quy ước tông (chỉ 6 tông, map sang lớp Tailwind DUY NHẤT ở `TONE_CLASSES`):
 *   neutral  — Nháp, Hàng đợi, Đã đóng, **Đã huỷ / Ngừng dùng** (kèm gạch ngang, KHÔNG đỏ)
 *   info     — Chờ duyệt, Đã gửi, Đã duyệt (chờ bước tiếp)
 *   progress — Đang xử lý / đang chạy (indigo = màu thương hiệu)
 *   success  — Hoàn tất, Đạt, Đã nhận đủ, Đang dùng
 *   warning  — Tạm dừng, Quá hạn, Giữ QC, Một phần cần chú ý
 *   danger   — Từ chối, Không đạt, Hết hạn, Lỗi
 *
 * File THUẦN (không React) → dùng được cả server (xuất Excel) lẫn test.
 */

export type StatusTone = "neutral" | "info" | "progress" | "success" | "warning" | "danger";

export const STATUS_TONES: readonly StatusTone[] = [
  "neutral",
  "info",
  "progress",
  "success",
  "warning",
  "danger",
] as const;

export interface StatusDef {
  /** Nhãn tiếng Việt đầy đủ. */
  label: string;
  tone: StatusTone;
  /** Nhãn ngắn cho ô chật (bảng SX, thẻ nhỏ). Không có → dùng `label`. */
  short?: string;
  /** Trạng thái kết thúc KHÔNG thành (huỷ / ngừng) → hiển thị gạch ngang nhạt. */
  void?: boolean;
}

const d = (label: string, tone: StatusTone, extra: Omit<StatusDef, "label" | "tone"> = {}): StatusDef => ({
  label,
  tone,
  ...extra,
});

/** "Đã huỷ" dùng chung — neutral + gạch ngang (quy ước Đợt 6). */
const CANCELLED = d("Đã huỷ", "neutral", { short: "Huỷ", void: true });

export const STATUS_DEFS = {
  /** BOM template (bom_status). Chốt 1 cách gọi với Vật tư: Đang dùng / Ngừng dùng. */
  bom: {
    DRAFT: d("Nháp", "neutral"),
    ACTIVE: d("Đang dùng", "success"),
    OBSOLETE: d("Ngừng dùng", "neutral", { void: true }),
  },
  /** Bản phát hành BOM (bom_revision_status). */
  bomRevision: {
    DRAFT: d("Nháp", "neutral"),
    RELEASED: d("Đã phát hành", "success"),
    SUPERSEDED: d("Đã thay thế", "neutral"),
  },
  /** Vật tư (item_status) — dùng cả cho cờ is_active qua `activeStatusCode`. */
  item: {
    DRAFT: d("Nháp", "neutral"),
    ACTIVE: d("Đang dùng", "success"),
    OBSOLETE: d("Ngừng dùng", "neutral", { void: true }),
    INACTIVE: d("Ngừng dùng", "neutral", { void: true }),
  },
  /** Nhà cung cấp (is_active) — cùng cách gọi với Vật tư. */
  supplier: {
    ACTIVE: d("Đang dùng", "success"),
    INACTIVE: d("Ngừng dùng", "neutral", { void: true }),
  },
  /** Tài khoản người dùng (is_active) — thay "Active/Disabled". */
  user: {
    ACTIVE: d("Hoạt động", "success"),
    INACTIVE: d("Vô hiệu hoá", "neutral", { void: true }),
  },
  /** Đề xuất vật tư / yêu cầu mua (purchase_request_status). */
  pr: {
    DRAFT: d("Nháp", "neutral"),
    SUBMITTED: d("Chờ duyệt", "info"),
    APPROVED: d("Đã duyệt", "success"),
    CONVERTED: d("Đã chuyển PO", "success"),
    REJECTED: d("Từ chối", "danger"),
  },
  /** Đơn đặt hàng (purchase_order_status). */
  po: {
    DRAFT: d("Nháp", "neutral"),
    SENT: d("Đã gửi NCC", "info", { short: "Đã gửi" }),
    PARTIAL: d("Nhận một phần", "progress", { short: "Một phần" }),
    RECEIVED: d("Đã nhận đủ", "success"),
    CANCELLED,
    CLOSED: d("Đã đóng", "neutral"),
  },
  /** Trục duyệt PO (metadata.approvalStatus) — tách khỏi trạng thái PO. */
  poApproval: {
    pending: d("Chờ duyệt", "info"),
    approved: d("Đã duyệt", "success"),
    rejected: d("Từ chối", "danger"),
  },
  /** Lệnh sản xuất (work_order_status). DRAFT = chờ Bộ phận Gia công duyệt. */
  wo: {
    DRAFT: d("Chờ duyệt", "info"),
    QUEUED: d("Hàng đợi", "neutral"),
    RELEASED: d("Đã duyệt", "info"),
    IN_PROGRESS: d("Đang sản xuất", "progress", { short: "Đang SX" }),
    PAUSED: d("Tạm dừng", "warning"),
    COMPLETED: d("Hoàn thành", "success"),
    CANCELLED,
  },
  /** Bảng sản xuất (production_board_status). */
  board: {
    QUEUED: d("Sắp gia công", "neutral", { short: "Sắp GC" }),
    IN_PROGRESS: d("Đang gia công", "progress", { short: "Đang GC" }),
    QC: d("Kiểm tra QC", "info", { short: "QC" }),
    COMPLETED: d("Hoàn thành", "success", { short: "Xong" }),
    DELIVERED: d("Đã giao", "neutral"),
  },
  /** Đơn hàng bán (sales_order_status). */
  salesOrder: {
    DRAFT: d("Nháp", "neutral"),
    CONFIRMED: d("Đã xác nhận", "info"),
    SNAPSHOTTED: d("Đã chốt BOM", "info"),
    IN_PROGRESS: d("Đang sản xuất", "progress", { short: "Đang SX" }),
    FULFILLED: d("Hoàn tất", "success"),
    CLOSED: d("Đã đóng", "neutral"),
    CANCELLED,
  },
  /** Lệnh lắp ráp (assembly_order_status). */
  assembly: {
    DRAFT: d("Nháp", "neutral"),
    PICKING: d("Đang soạn hàng", "progress"),
    ASSEMBLING: d("Đang lắp ráp", "progress"),
    COMPLETED: d("Hoàn thành", "success"),
    CANCELLED,
  },
  /** Phiếu yêu cầu vật tư — Kho chuẩn bị (material_request.status). */
  mr: {
    PENDING: d("Chờ chuẩn bị", "info", { short: "Chờ" }),
    PICKING: d("Đang chuẩn bị", "progress", { short: "Chuẩn bị" }),
    READY: d("Đã sẵn sàng", "success", { short: "Sẵn sàng" }),
    PARTIAL: d("Giao một phần", "progress", { short: "Một phần" }),
    DELIVERED: d("Đã giao", "success"),
    CANCELLED,
  },
  /** Yêu cầu xuất kho (issue_request.status). */
  issueRequest: {
    PENDING: d("Chờ duyệt", "info"),
    APPROVED: d("Đã duyệt", "info"),
    COMPLETED: d("Đã xuất kho", "success"),
    REJECTED: d("Từ chối", "danger"),
  },
  /** Biên bản giao hàng (delivery_note.status). */
  deliveryNote: {
    DRAFT: d("Nháp", "neutral"),
    PENDING_APPROVAL: d("Chờ Giám đốc duyệt", "info", { short: "Chờ duyệt" }),
    CONFIRMED: d("Đã duyệt", "success"),
    REJECTED: d("Từ chối", "danger"),
  },
  /** Lô / serial tồn kho (lot_status). */
  lot: {
    AVAILABLE: d("Sẵn dùng", "success"),
    HOLD: d("Giữ QC", "warning"),
    CONSUMED: d("Đã dùng hết", "neutral"),
    EXPIRED: d("Hết hạn", "danger"),
  },
  /** Kết quả QC nhận hàng (receiving qc). */
  receiptQc: {
    PENDING: d("Chờ kiểm", "info"),
    OK: d("Đạt", "success"),
    NG: d("Không đạt", "danger"),
  },
  /** Dòng vật tư sheet BOM (material_row_status). */
  materialRow: {
    PLANNED: d("Đã lên kế hoạch", "neutral"),
    ORDERED: d("Đã đặt", "info"),
    DELIVERED: d("Đã giao về", "progress"),
    QC_PASS: d("Đạt QC", "success"),
    CANCELLED,
  },
  /** Phiếu thu/chi (fin_transaction_status). */
  finTxn: {
    DRAFT: d("Nháp", "neutral"),
    POSTED: d("Đã ghi sổ", "success"),
    VOID: CANCELLED,
  },
  /** Hoá đơn (fin_invoice_status). */
  invoice: {
    DRAFT: d("Nháp", "neutral"),
    UNPAID: d("Chưa trả", "info"),
    PARTIAL: d("Trả một phần", "progress"),
    PAID: d("Đã trả", "success"),
    OVERDUE: d("Quá hạn", "warning"),
    CANCELLED,
  },
  /** Đợt thanh toán (fin_payment: có/không huỷ). */
  payment: {
    ACTIVE: d("Đã ghi nhận", "success"),
    VOID: CANCELLED,
  },
  /** Lần nhập Excel (import job). */
  importJob: {
    queued: d("Đang chờ", "neutral"),
    parsing: d("Đang đọc file", "progress"),
    preview_ready: d("Chờ xác nhận", "info"),
    committing: d("Đang ghi", "progress"),
    done: d("Hoàn tất", "success"),
    failed: d("Thất bại", "danger"),
  },
} as const satisfies Record<string, Record<string, StatusDef>>;

export type StatusDomain = keyof typeof STATUS_DEFS;
export type StatusCode<D extends StatusDomain> = keyof (typeof STATUS_DEFS)[D] & string;

/**
 * Tra nhãn + tông. Mã lạ (dữ liệu mới chưa khai báo) KHÔNG làm vỡ UI: trả về
 * chính mã đó với tông neutral.
 */
export function getStatus(domain: StatusDomain, code: string | null | undefined): StatusDef {
  if (!code) return { label: "—", tone: "neutral" };
  const table = STATUS_DEFS[domain] as Record<string, StatusDef>;
  return table[code] ?? { label: code, tone: "neutral" };
}

/** Chỉ lấy nhãn — cho select, xuất Excel, chuỗi thông báo. */
export function statusLabel(domain: StatusDomain, code: string | null | undefined): string {
  return getStatus(domain, code).label;
}

/** Danh sách mã + nhãn theo đúng thứ tự khai báo — dùng dựng chip lọc / select. */
export function statusOptions<D extends StatusDomain>(
  domain: D,
): Array<{ code: StatusCode<D>; label: string; tone: StatusTone }> {
  return Object.entries(STATUS_DEFS[domain] as Record<string, StatusDef>).map(([code, def]) => ({
    code: code as StatusCode<D>,
    label: def.label,
    tone: def.tone,
  }));
}

/** Cờ is_active → mã trạng thái cho domain item/supplier/user. */
export function activeStatusCode(isActive: boolean | null | undefined): "ACTIVE" | "INACTIVE" {
  return isActive === false ? "INACTIVE" : "ACTIVE";
}

/**
 * Lớp Tailwind cho từng tông — nơi DUY NHẤT gắn màu trạng thái.
 * pill = nền + chữ + viền ring; dot = chấm tròn; text = chỉ màu chữ; bar = thanh tiến độ.
 */
export const TONE_CLASSES: Record<StatusTone, { pill: string; dot: string; text: string; bar: string }> = {
  neutral: {
    pill: "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700",
    dot: "bg-zinc-400",
    text: "text-zinc-600 dark:text-zinc-400",
    bar: "bg-zinc-400",
  },
  info: {
    pill: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:ring-sky-800",
    dot: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-400",
    bar: "bg-sky-500",
  },
  progress: {
    pill: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800",
    dot: "bg-indigo-500",
    text: "text-indigo-700 dark:text-indigo-300",
    bar: "bg-indigo-500",
  },
  success: {
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bar: "bg-emerald-500",
  },
  warning: {
    pill: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  danger: {
    pill: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-800",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    bar: "bg-red-500",
  },
};

// ---------------------------------------------------------------------------
// Nhãn hành động (nhật ký / hoạt động gần đây) + loại thông báo
// ---------------------------------------------------------------------------

/** V4.1 UI-27: mã hành động audit → tiếng Việt (Nhật ký, lọc, hoạt động). */
export const ACTION_LABELS: Record<string, string> = {
  CREATE: "Tạo",
  UPDATE: "Sửa",
  DELETE: "Xoá",
  LOGIN: "Đăng nhập",
  LOGOUT: "Đăng xuất",
  APPROVE: "Duyệt",
  TRANSITION: "Đổi trạng thái",
  CANCEL: "Huỷ",
  RECEIVE: "Nhận hàng",
  ISSUE: "Xuất kho",
  RESERVE: "Giữ hàng",
  CONVERT: "Chuyển đổi",
  RELEASE: "Phát hành",
  POST: "Ghi sổ",
  UPLOAD: "Tải lên",
  COMMIT: "Chốt nhập",
  SNAPSHOT: "Chốt BOM",
  WO_START: "Bắt đầu SX",
  WO_PAUSE: "Tạm dừng SX",
  WO_RESUME: "Tiếp tục SX",
  WO_COMPLETE: "Hoàn tất SX",
  QC_CHECK: "Kiểm QC",
  ECO_SUBMIT: "Gửi ECO",
  ECO_APPROVE: "Duyệt ECO",
  ECO_APPLY: "Áp dụng ECO",
  ECO_REJECT: "Từ chối ECO",
};

export function actionLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return ACTION_LABELS[code] ?? code;
}

/** V4.1 UI-27: loại đối tượng (object_type / entity) → tiếng Việt. */
export const ENTITY_LABELS: Record<string, string> = {
  bom: "BOM",
  bom_template: "BOM",
  bom_revision: "bản phát hành BOM",
  bom_snapshot: "bản chốt BOM",
  bom_snapshot_line: "dòng BOM",
  bom_line: "dòng BOM",
  bom_sheet: "sheet BOM",
  work_order: "lệnh sản xuất",
  work_order_line: "dòng lệnh sản xuất",
  purchase_order: "đơn đặt hàng",
  purchase_request: "đề xuất vật tư",
  inbound_receipt: "phiếu nhập",
  assembly_work_order: "lệnh lắp ráp",
  item: "vật tư",
  user: "người dùng",
  user_account: "người dùng",
  session: "phiên đăng nhập",
  reservation: "giữ hàng",
  inventory_lot_serial: "lô hàng",
  inventory_txn: "giao dịch kho",
  qc_check: "kiểm tra QC",
  eco_change: "ECO",
  sales_order: "đơn hàng",
  supplier: "nhà cung cấp",
  material_request: "phiếu yêu cầu vật tư",
  issue_request: "yêu cầu xuất kho",
  goods_issue: "phiếu xuất kho",
  delivery_note: "biên bản giao hàng",
  production_board: "bảng sản xuất",
  fin_transaction: "phiếu thu chi",
  fin_invoice: "hoá đơn",
  fin_payment: "thanh toán",
  fin_account: "nguồn tiền",
  import_batch: "lô nhập Excel",
};

export function entityLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return ENTITY_LABELS[code] ?? code.replace(/_/g, " ");
}

/** V4.1 UI-27: loại thông báo (notification.event_type) → nhãn chip tiếng Việt. */
export const NOTIF_TYPE_LABELS: Record<string, string> = {
  PR_SUBMITTED: "Đề xuất mới",
  PR_DEPT_APPROVED: "Kho đã duyệt",
  PR_APPROVED: "Đề xuất được duyệt",
  PR_REJECTED: "Đề xuất bị từ chối",
  PR_PENDING_REMINDER: "Nhắc duyệt",
  PR_GOODS_ISSUED: "Vật tư đã xuất kho",
  PR_COMPLETED: "Đề xuất hoàn tất",
  PR_APPROVED_NO_PO_REMINDER: "Nhắc lên PO",
  PO_SENT: "PO đã gửi",
  PO_RECEIVED_PARTIAL: "PO nhận một phần",
  PO_RECEIVED_FULL: "PO nhận đủ",
  PO_CREATED_FROM_PR: "PO mới từ đề xuất",
  PO_SUBCONTRACT_DRAFT: "PO gia công chờ chốt",
  PO_APPROVAL_REQUESTED: "PO chờ duyệt",
  PO_APPROVED: "PO được duyệt",
  PO_APPROVAL_REJECTED: "PO bị từ chối",
  PO_PRICE_UPDATED: "PO đổi giá",
  PO_CANCELLED: "PO bị huỷ",
  PO_CLOSED: "PO đã đóng",
  PO_INVOICE_DRAFT: "HĐ mua chờ xác nhận",
  PO_INVOICE_CONFIRMED: "HĐ mua đã ghi nợ",
  WO_RELEASED: "Lệnh SX mới",
  WO_COMPLETED: "Lệnh SX hoàn thành",
  WO_REQUEST_SUBMITTED: "Yêu cầu SX mới",
  WO_APPROVED: "Lệnh SX được duyệt",
  WO_REJECTED: "Lệnh SX bị từ chối",
  WO_STARTED: "Lệnh SX bắt đầu",
  WO_CANCELLED: "Lệnh SX bị huỷ",
  MATERIAL_REQUEST_NEW: "Yêu cầu vật tư mới",
  MATERIAL_REQUEST_PICKING: "Đang chuẩn bị",
  MATERIAL_REQUEST_READY: "Đã chuẩn bị xong",
  MATERIAL_REQUEST_DELIVERED: "Đã giao đủ",
  MATERIAL_REQUEST_CANCELLED: "Yêu cầu vật tư bị huỷ",
  MATERIAL_REQUEST_ISSUED: "Đã giao một phần",
  ISSUE_REQUEST_NEW: "Yêu cầu xuất kho",
  ISSUE_REQUEST_APPROVED: "Xuất kho được duyệt",
  ISSUE_REQUEST_REJECTED: "Xuất kho bị từ chối",
  DELIVERY_NOTE_CREATED: "BBGH mới",
  DELIVERY_NOTE_CONFIRMED: "BBGH đã duyệt",
  DELIVERY_NOTE_REJECTED: "BBGH bị từ chối",
  FIN_INVOICE_DUE_SOON: "Hoá đơn sắp đến hạn",
  FIN_INVOICE_OVERDUE: "Hoá đơn quá hạn",
  FIN_PAYMENT_RECORDED: "Đã ghi nhận thanh toán",
  FIN_RECEIVABLE_OVERDUE: "Công nợ phải thu quá hạn",
  QC_RECEIPT_PENDING: "Hàng chờ QC",
  QC_RECEIPT_PASSED: "QC đạt",
  QC_RECEIPT_FAILED: "QC không đạt",
  STOCKTAKE_SUBMITTED: "Kiểm kê chờ duyệt",
  STOCKTAKE_APPROVED: "Kiểm kê đã duyệt",
  STOCKTAKE_REJECTED: "Kiểm kê bị trả lại",
};

/** Mã lạ → "Thông báo" (không bao giờ lộ mã thô kiểu `PR_PENDING_REMINDER`). */
export function notifTypeLabel(code: string | null | undefined): string {
  if (!code) return "Thông báo";
  return NOTIF_TYPE_LABELS[code] ?? "Thông báo";
}
