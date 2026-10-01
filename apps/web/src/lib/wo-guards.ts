/**
 * V4.1 Đợt 4 — Luật THUẦN cho Lệnh sản xuất (không import DB → test được).
 *
 * Dùng chung server (repo workOrders / woProgressLog / assemblies) + client
 * (ẩn nút). Mọi thông báo lỗi tiếng Việt, hiển thị thẳng cho người dùng.
 */

import { statusLabel } from "@/lib/status";

export type WoStatus =
  | "DRAFT"
  | "QUEUED"
  | "RELEASED"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

/**
 * State machine WO.
 *
 * V4.1 SX-06: BỎ DRAFT → IN_PROGRESS. DRAFT = Yêu cầu SX chờ Bộ phận Gia công
 * duyệt (→ RELEASED qua /approve); trước đây planner gọi thẳng /start là bỏ
 * qua bước duyệt. DRAFT → RELEASED chỉ đi qua route /approve (kiểm vai trò).
 */
export const WO_ALLOWED_TRANSITIONS: Record<WoStatus, WoStatus[]> = {
  DRAFT: ["QUEUED", "RELEASED", "CANCELLED"],
  QUEUED: ["IN_PROGRESS", "CANCELLED"],
  RELEASED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["PAUSED", "COMPLETED", "CANCELLED"],
  PAUSED: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** V4.1 UI-07 (Đợt 6B): nhãn lấy từ nguồn chung `lib/status` (domain "wo"). */
export const WO_STATUS_LABEL_VI: Record<WoStatus, string> = {
  DRAFT: statusLabel("wo", "DRAFT"),
  QUEUED: statusLabel("wo", "QUEUED"),
  RELEASED: statusLabel("wo", "RELEASED"),
  IN_PROGRESS: statusLabel("wo", "IN_PROGRESS"),
  PAUSED: statusLabel("wo", "PAUSED"),
  COMPLETED: statusLabel("wo", "COMPLETED"),
  CANCELLED: statusLabel("wo", "CANCELLED"),
};

export function isWoTransitionAllowed(from: WoStatus, to: WoStatus): boolean {
  return (WO_ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

const EPS = 1e-9;

/** V4.2 PROD-01 — lý do hoàn thành thiếu sản lượng phải ≥ 3 ký tự. */
export const WO_COMPLETE_REASON_MIN_LENGTH = 3;

export interface WoCompleteShortfall {
  good: number;
  planned: number;
  /** > 0 — số lượng còn thiếu so với kế hoạch. */
  missing: number;
}

/**
 * V4.5 QA-C P1-1 — 1 dòng vật tư BOM chưa xuất đủ cho lệnh (so `required` —
 * tính từ `work_order.material_requirements`/BOM — với `alreadyIssued` —
 * ISR COMPLETED gắn `wo_id`, xem `lib/wo-material-plan.ts`). `work_order_line`
 * (dòng linh kiện kiểu cũ) không còn được ghi bởi bất kỳ route tạo lệnh nào
 * (`work-orders/from-bom-line`, `work-orders/lsx`) nên không dùng được để
 * chặn hoàn thành nữa — thay bằng kiểm tra trực tiếp trên material-plan.
 */
export interface WoMaterialShortageLine {
  itemId: string;
  sku: string | null;
  name: string | null;
  uom: string | null;
  required: number;
  issued: number;
  /** > 0 — số lượng chưa xuất đủ so với nhu cầu BOM. */
  missing: number;
}

/**
 * V4.5 QA-C P1-1 — lọc các dòng vật tư BOM chưa xuất đủ từ bảng kế hoạch vật
 * tư (`buildMaterialPlanRows`/`getWoMaterialPlan`). THUẦN — không đụng DB.
 */
export function getWoMaterialShortageLines(
  rows: Array<{
    itemId: string;
    sku: string | null;
    name: string | null;
    uom: string | null;
    required: number | string;
    alreadyIssued: number | string;
  }>,
): WoMaterialShortageLine[] {
  const out: WoMaterialShortageLine[] = [];
  for (const r of rows) {
    const required = Number(r.required) || 0;
    const issued = Number(r.alreadyIssued) || 0;
    const missing = required - issued;
    if (missing > EPS) {
      out.push({ itemId: r.itemId, sku: r.sku, name: r.name, uom: r.uom, required, issued, missing });
    }
  }
  return out;
}

/** Dòng chuỗi tiếng Việt ngắn gọn cho 1 dòng vật tư thiếu (dùng trong thông báo/ghi chú). */
export function formatWoMaterialShortageLine(l: WoMaterialShortageLine): string {
  const label = l.name || l.sku || l.itemId;
  const uom = l.uom ? ` ${l.uom}` : "";
  return `${label} (thiếu ${l.missing}${uom})`;
}

/**
 * V4.2 PROD-01 — SL đạt (good_qty) so với kế hoạch (planned_qty). Trả về
 * thông tin thiếu nếu `good < planned` (dùng để UI hiện hộp xác nhận "Đạt X /
 * kế hoạch Y — hoàn thành thiếu Z?"), `null` nếu đã đủ/vượt kế hoạch — không
 * cần xác nhận thêm, giữ nguyên hành vi cũ.
 */
export function getWoCompleteShortfall(input: {
  goodQty: number | string | null | undefined;
  plannedQty: number | string | null | undefined;
}): WoCompleteShortfall | null {
  const good = Number(input.goodQty ?? 0);
  const planned = Number(input.plannedQty ?? 0);
  if (!Number.isFinite(good) || !Number.isFinite(planned)) return null;
  const missing = planned - good;
  if (missing <= EPS) return null;
  return { good, planned, missing };
}

/**
 * V4.1 SX-04 (+ V4.2 PROD-01): điều kiện hoàn thành WO.
 *  - Phải đang sản xuất (IN_PROGRESS).
 *  - SL đạt (good_qty) > 0 — trước đây WO 0 dòng (LSX / từ dòng BOM) hoàn
 *    thành ngay cả khi chưa báo sản lượng nào.
 *  - WO kiểu cũ có dòng linh kiện: mọi dòng completed ≥ required.
 *  - V4.2 PROD-01: nếu `good_qty < planned_qty` (hoàn thành thiếu sản lượng)
 *    bắt buộc `completeReason` ≥ `WO_COMPLETE_REASON_MIN_LENGTH` ký tự —
 *    không chặn hoàn thành (chính sách vẫn cho phép hoàn thành sớm/thiếu),
 *    chỉ bắt xác nhận + ghi lý do. Đạt ≥ kế hoạch thì không cần lý do, hành vi
 *    y hệt trước khi có PROD-01 (backward-compatible: caller không truyền
 *    `plannedQty` → bỏ qua bước kiểm tra này hoàn toàn).
 *  - V4.5 QA-C P1-1: `lines` (`work_order_line`) không còn được route tạo lệnh
 *    nào ghi dữ liệu nữa (luôn rỗng trong thực tế) nên không còn chặn được gì
 *    — giữ tham số để không phá API hiện có nhưng không còn ý nghĩa thực tế.
 *    Thay vào đó, nếu caller truyền `materialShortage` (tính từ material-plan
 *    thật — xem `getWoMaterialShortageLines`) và còn dòng chưa xuất đủ, áp
 *    dụng CÙNG cơ chế với thiếu sản lượng: không chặn cứng, chỉ bắt xác nhận
 *    + lý do ≥ `WO_COMPLETE_REASON_MIN_LENGTH` ký tự. Không truyền
 *    `materialShortage` → bỏ qua kiểm tra này hoàn toàn (vd lệnh không có
 *    BOM/vật tư — `getWoMaterialShortageLines` trả mảng rỗng tự nhiên).
 *
 * V4.1 Q2: sau này thêm bước nhập kho thành phẩm (PROD_IN) — hiện TẠM ẨN.
 */
export function checkWoCompletable(input: {
  status: WoStatus;
  goodQty: number | string | null | undefined;
  plannedQty?: number | string | null | undefined;
  completeReason?: string | null;
  lines: Array<{
    requiredQty: number | string;
    completedQty: number | string;
  }>;
  /** V4.5 QA-C P1-1 — dòng vật tư BOM chưa xuất đủ (rỗng/undefined = bỏ qua). */
  materialShortage?: WoMaterialShortageLine[];
}): GuardResult {
  if (input.status !== "IN_PROGRESS") {
    return {
      ok: false,
      reason: `Lệnh đang "${WO_STATUS_LABEL_VI[input.status] ?? input.status}" — chỉ hoàn thành được lệnh đang sản xuất.`,
    };
  }
  const good = Number(input.goodQty ?? 0);
  if (!Number.isFinite(good) || good <= EPS) {
    return {
      ok: false,
      reason:
        "Chưa có sản lượng đạt — báo cáo tiến độ (SL đạt > 0) trước khi hoàn thành lệnh.",
    };
  }
  const incomplete = input.lines.filter(
    (l) => Number(l.completedQty) + EPS < Number(l.requiredQty),
  ).length;
  if (incomplete > 0) {
    return {
      ok: false,
      reason: `Còn ${incomplete} dòng linh kiện chưa đủ số lượng — chưa hoàn thành được lệnh.`,
    };
  }
  const shortfall =
    input.plannedQty !== undefined
      ? getWoCompleteShortfall({ goodQty: input.goodQty, plannedQty: input.plannedQty })
      : null;
  const materialShortage = (input.materialShortage ?? []).filter((l) => l.missing > EPS);
  if (shortfall || materialShortage.length > 0) {
    const reason = (input.completeReason ?? "").trim();
    if (reason.length < WO_COMPLETE_REASON_MIN_LENGTH) {
      const parts: string[] = [];
      if (shortfall) {
        parts.push(
          `Đạt ${shortfall.good} / kế hoạch ${shortfall.planned} — hoàn thành thiếu ${shortfall.missing}`,
        );
      }
      if (materialShortage.length > 0) {
        parts.push(
          `Vật tư chưa xuất đủ: ${materialShortage.map(formatWoMaterialShortageLine).join(", ")}`,
        );
      }
      return {
        ok: false,
        reason: `${parts.join(". ")}. Nhập lý do (tối thiểu ${WO_COMPLETE_REASON_MIN_LENGTH} ký tự) để xác nhận hoàn thành.`,
      };
    }
  }
  return { ok: true };
}

/**
 * V4.1 SX-13: điều kiện ghi nhật ký tiến độ.
 *  - WO đã hoàn thành / huỷ: không ghi gì nữa.
 *  - Báo sản lượng (PROGRESS_REPORT có SL): WO phải đang chạy / tạm dừng.
 */
export function checkProgressLoggable(input: {
  status: WoStatus;
  stepType: string;
  qtyCompleted: number;
  qtyScrap: number;
}): GuardResult {
  if (input.status === "COMPLETED" || input.status === "CANCELLED") {
    return {
      ok: false,
      reason: `Lệnh đã "${WO_STATUS_LABEL_VI[input.status]}" — không ghi nhận tiến độ được nữa.`,
    };
  }
  const hasQty = input.qtyCompleted > 0 || input.qtyScrap > 0;
  if (
    input.stepType === "PROGRESS_REPORT" &&
    hasQty &&
    input.status !== "IN_PROGRESS" &&
    input.status !== "PAUSED"
  ) {
    return {
      ok: false,
      reason: "Lệnh chưa bắt đầu sản xuất — bấm \"Bắt đầu sản xuất\" trước khi báo sản lượng.",
    };
  }
  return { ok: true };
}

/**
 * V4.1 SX-14: SL đạt/phế của WO = SL THÀNH PHẨM. Chỉ cộng vào header khi
 * báo tiến độ cho thành phẩm (không chọn dòng linh kiện). Báo cho dòng linh
 * kiện (WO kiểu cũ) chỉ cộng `work_order_line.completed_qty`.
 */
export function progressAffectsHeader(input: {
  stepType: string;
  workOrderLineId?: string | null;
}): boolean {
  return input.stepType === "PROGRESS_REPORT" && !input.workOrderLineId;
}

/** V4.1 SX-07: chỉ xoá vĩnh viễn được lệnh Nháp/Đã huỷ. */
export function isWoDeletable(status: WoStatus): boolean {
  return status === "DRAFT" || status === "CANCELLED";
}

/** V4.1 SX-22: quét lắp ráp (trừ kho) chỉ khi lệnh đã duyệt / đang chạy. */
export function isWoScannable(status: WoStatus): boolean {
  return status === "RELEASED" || status === "QUEUED" || status === "IN_PROGRESS";
}

/**
 * V4.1 SX-20: ngày kết thúc kế hoạch không trước ngày bắt đầu. Nhận chuỗi
 * `YYYY-MM-DD` (so sánh chuỗi an toàn với định dạng ISO ngày).
 */
export function checkPlannedDates(
  start: string | null | undefined,
  end: string | null | undefined,
): GuardResult {
  const s = (start ?? "").slice(0, 10);
  const e = (end ?? "").slice(0, 10);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (s && !re.test(s)) return { ok: false, reason: "Ngày bắt đầu không hợp lệ." };
  if (e && !re.test(e)) return { ok: false, reason: "Ngày kết thúc không hợp lệ." };
  if (s && e && e < s) {
    return { ok: false, reason: "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu." };
  }
  return { ok: true };
}
