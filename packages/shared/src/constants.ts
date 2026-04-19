/** Đơn vị đo — khớp enum `uom` trong Drizzle schema. */
export const UOMS = [
  "PCS",
  "SET",
  "KG",
  "G",
  "M",
  "MM",
  "CM",
  "L",
  "ML",
  "HOUR",
  "PAIR",
  "BOX",
  "ROLL",
  "SHEET",
] as const;
export type Uom = (typeof UOMS)[number];

/** Loại item — khớp enum `item_type`. */
export const ITEM_TYPES = [
  "RAW",
  "PURCHASED",
  "FABRICATED",
  "SUB_ASSEMBLY",
  "FG",
  "CONSUMABLE",
  "TOOL",
  "PACKAGING",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** Nhãn tiếng Việt cho UI. */
export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  RAW: "Nguyên liệu thô",
  PURCHASED: "Mua ngoài",
  FABRICATED: "Gia công",
  SUB_ASSEMBLY: "Cụm bán thành phẩm",
  FG: "Thành phẩm",
  CONSUMABLE: "Vật tư phụ",
  TOOL: "Dụng cụ",
  PACKAGING: "Bao bì / đóng gói",
};

export const ITEM_STATUSES = ["ACTIVE", "OBSOLETE", "DRAFT"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  ACTIVE: "Đang dùng",
  OBSOLETE: "Ngừng dùng",
  DRAFT: "Nháp",
};

export const UOM_LABELS: Record<Uom, string> = {
  PCS: "Cái",
  SET: "Bộ",
  KG: "Kilogram",
  G: "Gram",
  M: "Mét",
  MM: "Milimét",
  CM: "Xentimét",
  L: "Lít",
  ML: "Mililít",
  HOUR: "Giờ",
  PAIR: "Đôi",
  BOX: "Hộp",
  ROLL: "Cuộn",
  SHEET: "Tấm",
};

export const BARCODE_TYPES = [
  "EAN13",
  "EAN8",
  "CODE128",
  "CODE39",
  "QR",
  "DATAMATRIX",
] as const;
export type BarcodeType = (typeof BARCODE_TYPES)[number];

export const BARCODE_SOURCES = ["vendor", "internal"] as const;
export type BarcodeSource = (typeof BARCODE_SOURCES)[number];

export const IMPORT_DUPLICATE_MODES = ["skip", "upsert", "error"] as const;
export type ImportDuplicateMode = (typeof IMPORT_DUPLICATE_MODES)[number];

export const IMPORT_STATUSES = [
  "queued",
  "parsing",
  "preview_ready",
  "committing",
  "done",
  "failed",
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const ROLE_LABELS = {
  admin: "Quản trị hệ thống",
  planner: "Kế hoạch / BOM",
  warehouse: "Thủ kho",
  operator: "Công nhân xưởng",
} as const;

/** BullMQ queue names (đồng bộ giữa web và worker). */
export const QUEUE_NAMES = {
  ITEM_IMPORT: "item-import",
  ITEM_IMPORT_COMMIT: "item-import-commit",
  BOM_IMPORT_COMMIT: "bom-import-commit",
  ASSEMBLY_SCAN_SYNC: "assembly-scan-sync",
  ECO_APPLY_BATCH: "eco-apply-batch",
} as const;

/**
 * Tên cookie auth (single source of truth, dùng chung cả middleware edge
 * lẫn server runtime). Tránh hardcode ở nhiều chỗ gây mismatch giữa
 * `lib/auth.ts` và `lib/auth-edge.ts`.
 */
export const AUTH_COOKIE_NAME = "iot_session";
export const REFRESH_COOKIE_NAME = "iot_refresh";

/** Giới hạn an toàn. */
export const LIMITS = {
  FILE_UPLOAD_MAX_BYTES: 20 * 1024 * 1024,
  PASSWORD_MIN_LENGTH: 10,
  LOGIN_MAX_FAILURES_BEFORE_LOCK: 5,
  LOCK_DURATION_MS: 15 * 60 * 1000,
  REQUEST_ID_HEADER: "x-request-id",
} as const;
