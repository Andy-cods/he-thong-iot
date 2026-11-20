/**
 * Nhập lại BOM (ghi đè / mã mới) + liên kết Bảng sản xuất — hàm THUẦN dùng
 * chung web (preview) + worker (commit). Không đụng DB.
 */

/** Độ dài tối đa cột app.bom_template.code. */
export const BOM_CODE_MAX = 64;

/** Chuẩn hoá chuỗi thành mã BOM (A-Z 0-9 _ -), cắt 60 ký tự. */
function sanitizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Mã BOM mẫu "BOM triển khai" = mã dự án trong file (fallback TK-<batch>). */
export function trienKhaiTemplateCode(projectCode: string | null | undefined, batchId: string): string {
  const base = sanitizeCode(projectCode ?? "");
  return base.length >= 2 ? base : `TK-${batchId.slice(0, 8).toUpperCase()}`;
}

/** Mã BOM đường nhập cổ điển = tên sheet. */
export function sheetBomCode(sheetName: string): string {
  const base = sanitizeCode(sheetName);
  return base.length >= 2 ? base : `BOM-${sheetName}`;
}

/** Chuẩn hoá mã người dùng gõ cho lựa chọn "Tạo BOM mới với mã khác". */
export function sanitizeNewBomCode(raw: string | null | undefined): string | null {
  const s = sanitizeCode(raw ?? "");
  return s.length >= 2 ? s : null;
}

/**
 * Mã trống kế tiếp: `<base>-V2`, `-V3`… (bỏ hậu tố -Vn sẵn có của base).
 * `taken` so khớp không phân biệt hoa/thường.
 */
export function nextFreeBomCode(base: string, taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const t of taken) used.add(t.toUpperCase());
  const root = base.toUpperCase().replace(/-V\d+$/, "").slice(0, BOM_CODE_MAX - 5);
  for (let n = 2; n < 1000; n++) {
    const c = `${root}-V${n}`;
    if (!used.has(c)) return c;
  }
  return `${root}-V${Date.now() % 100000}`;
}

/* ── Bảng sản xuất ─────────────────────────────────────────────────── */

const BOARD_CODE_RE = /([A-Z]\d{6,8}-\d{4,})/i;

/**
 * Mã hàng trên Bảng sản xuất = phần `Z0000002-<số>` của mã BOM (BOM cũ có
 * hậu tố `-BOM`, `-BOM-TRI-N-KHAI`, `-SL1`…). Không khớp mẫu → mã gốc (trim, HOA).
 */
export function normalizeBoardProductCode(code: string): string {
  const m = BOARD_CODE_RE.exec(code ?? "");
  if (m?.[1]) return m[1].toUpperCase();
  return (code ?? "").trim().toUpperCase();
}

/** Tên sản phẩm trên board từ tên BOM: bỏ tiền tố "BOM TRIỂN KHAI —" và mã đứng đầu. */
export function boardProductNameFromBom(name: string | null | undefined, code: string): string {
  const original = (name ?? "").trim();
  let s = original;
  for (let i = 0; i < 2; i++) {
    s = s
      .replace(/^BOM\s+TRI[ỂểEe]N\s+KHAI\s*[—–:\-·|]*\s*/iu, "")
      .replace(/^[A-Z]\d{6,8}-\d{4,}[A-Z0-9_-]*\s*[—–:\-·|]*\s*/i, "")
      .trim();
  }
  return s || original || code;
}

/** ĐVT trên board: mẫu BOM triển khai đếm theo "Bộ", còn lại "Pcs". */
export function boardUomForBom(metadata: unknown): string {
  const t = (metadata as { template?: unknown } | null)?.template;
  return t === "TRIEN_KHAI" ? "Bộ" : "Pcs";
}

/* ── Kết quả import ────────────────────────────────────────────────── */

export const BOM_DUPLICATE_MODES = ["skip", "upsert", "error", "replace", "new_code"] as const;
export type BomDuplicateMode = (typeof BOM_DUPLICATE_MODES)[number];

/** `upsert` (cũ: nối thêm dòng → BOM nhân đôi) giờ = ghi đè. */
export function effectiveDuplicateMode(m: BomDuplicateMode | undefined): "skip" | "error" | "replace" | "new_code" {
  if (!m) return "skip";
  return m === "upsert" ? "replace" : m;
}

export type BomImportOutcomeAction = "created" | "replaced" | "new_code" | "filled" | "skipped";

export interface BomImportOutcome {
  action: BomImportOutcomeAction;
  sheet?: string;
  templateId: string | null;
  templateCode: string;
  linesWritten: number;
  linesRemoved?: number;
  backupRevisionNo?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  /** Mã gốc đã tồn tại (khi action = new_code). */
  conflictCode?: string | null;
  reason?: string | null;
  message: string;
}

const STATUS_VI: Record<string, string> = {
  DRAFT: "Nháp",
  ACTIVE: "Đang dùng",
  OBSOLETE: "Ngừng dùng",
};

export function bomStatusVi(s: string | null | undefined): string {
  return s ? (STATUS_VI[s] ?? s) : "—";
}

/** Câu tiếng Việt mô tả CHÍNH XÁC việc đã làm (màn Kết quả). */
export function describeBomImportOutcome(o: Omit<BomImportOutcome, "message">): string {
  const code = o.templateCode;
  switch (o.action) {
    case "created":
      return `Đã tạo BOM ${code} với ${o.linesWritten} dòng.`;
    case "filled":
      return `Đã ghi ${o.linesWritten} dòng vào BOM ${code} (BOM có sẵn nhưng chưa có dòng).`;
    case "new_code":
      return `Đã tạo BOM mới ${code} với ${o.linesWritten} dòng${o.conflictCode ? ` — BOM ${o.conflictCode} giữ nguyên` : ""}.`;
    case "replaced": {
      const backup = o.linesRemoved && o.linesRemoved > 0
        ? ` (bản cũ ${o.linesRemoved} dòng đã lưu${o.backupRevisionNo ? ` ở phiên bản ${o.backupRevisionNo}` : ""})`
        : "";
      const st = o.previousStatus && o.newStatus && o.previousStatus !== o.newStatus
        ? ` Trạng thái: ${bomStatusVi(o.previousStatus)} → ${bomStatusVi(o.newStatus)}.`
        : "";
      return `Đã thay ${o.linesWritten} dòng của BOM ${code}${backup}.${st}`;
    }
    case "skipped":
      return `Bỏ qua BOM ${code}: ${o.reason ?? "mã đã tồn tại"} — không ghi dòng nào.`;
  }
}

export function makeBomImportOutcome(o: Omit<BomImportOutcome, "message">): BomImportOutcome {
  return { ...o, message: describeBomImportOutcome(o) };
}

/* ── Chặn ghi đè / xoá vĩnh viễn ───────────────────────────────────── */

export type BomRefKind =
  | "stage_move"
  | "delivery_slip"
  | "delivery_slip_line"
  | "eco"
  | "work_order"
  | "legacy_snapshot"
  | "sales_order"
  | "order_snapshot";

export interface BomRefCount {
  kind: BomRefKind;
  count: number;
}

const REF_LABEL: Record<BomRefKind, (n: number) => string> = {
  stage_move: (n) => `${n} bút toán tiến độ (sổ bước)`,
  delivery_slip: (n) => `${n} phiếu giao hàng`,
  delivery_slip_line: (n) => `${n} dòng phiếu giao`,
  eco: (n) => `${n} ECO`,
  work_order: (n) => `${n} lệnh sản xuất`,
  legacy_snapshot: (n) => `${n} dòng snapshot đơn hàng cũ`,
  sales_order: (n) => `${n} đơn hàng`,
  order_snapshot: (n) => `${n} đơn hàng đã tách BOM`,
};

export function bomRefLabel(r: BomRefCount): string {
  return REF_LABEL[r.kind](r.count);
}

export function nonZeroRefs(refs: readonly BomRefCount[]): BomRefCount[] {
  return refs.filter((r) => r.count > 0);
}

/** Câu chặn ghi đè (null = không chặn). */
export function replaceBlockedMessage(code: string, refs: readonly BomRefCount[]): string | null {
  const hit = nonZeroRefs(refs);
  if (hit.length === 0) return null;
  return `Không ghi đè được BOM ${code}: dòng BOM đang được dùng bởi ${hit.map(bomRefLabel).join(", ")}. Xoá dòng sẽ mất lịch sử sản xuất — hãy chọn "Tạo BOM mới với mã khác".`;
}

/** Câu chặn xoá vĩnh viễn (null = không chặn). */
export function hardDeleteBlockedMessage(code: string, refs: readonly BomRefCount[]): string | null {
  const hit = nonZeroRefs(refs);
  if (hit.length === 0) return null;
  return `Không xoá vĩnh viễn được BOM ${code}: đang được dùng bởi ${hit.map(bomRefLabel).join(", ")}. Giữ BOM ở trạng thái Ngừng dùng.`;
}

/**
 * Trạng thái sau khi ghi đè: Ngừng dùng → Nháp (phải Kích hoạt lại mới dùng);
 * Nháp/Đang dùng giữ nguyên.
 */
export function statusAfterReplace(prev: string): string {
  return prev === "OBSOLETE" ? "DRAFT" : prev;
}
