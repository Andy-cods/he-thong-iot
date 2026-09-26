/**
 * V4.1 Đợt 4 — Luật THUẦN cho Lệnh sản xuất (không import DB → test được).
 *
 * Dùng chung server (repo workOrders / woProgressLog / assemblies) + client
 * (ẩn nút). Mọi thông báo lỗi tiếng Việt, hiển thị thẳng cho người dùng.
 */

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

export const WO_STATUS_LABEL_VI: Record<WoStatus, string> = {
  DRAFT: "Chờ duyệt",
  QUEUED: "Hàng đợi",
  RELEASED: "Đã duyệt",
  IN_PROGRESS: "Đang sản xuất",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

export function isWoTransitionAllowed(from: WoStatus, to: WoStatus): boolean {
  return (WO_ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

const EPS = 1e-9;

/**
 * V4.1 SX-04: điều kiện hoàn thành WO.
 *  - Phải đang sản xuất (IN_PROGRESS).
 *  - SL đạt (good_qty) > 0 — trước đây WO 0 dòng (LSX / từ dòng BOM) hoàn
 *    thành ngay cả khi chưa báo sản lượng nào.
 *  - WO kiểu cũ có dòng linh kiện: mọi dòng completed ≥ required.
 *
 * V4.1 Q2: sau này thêm bước nhập kho thành phẩm (PROD_IN) — hiện TẠM ẨN.
 */
export function checkWoCompletable(input: {
  status: WoStatus;
  goodQty: number | string | null | undefined;
  lines: Array<{
    requiredQty: number | string;
    completedQty: number | string;
  }>;
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
