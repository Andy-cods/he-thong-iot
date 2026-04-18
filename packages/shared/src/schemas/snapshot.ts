import { z } from "zod";

/**
 * BOM Snapshot Line state machine — V1.2 Phase B2/B3 core.
 *
 * 10 state tuple khớp với Drizzle `bomSnapshotLineStateEnum`:
 *   PLANNED → PURCHASING → INBOUND_QC → AVAILABLE → RESERVED → CLOSED (happy path V1.2)
 *   IN_PRODUCTION / PROD_QC / ISSUED / ASSEMBLED unlock Phase V1.3 (Work Order + Assembly).
 *
 * STATE_TRANSITIONS map liệt kê valid transitions cho từng state:
 *   - 20 valid edges (bao gồm rollback về PLANNED + abort → CLOSED)
 *   - 80 invalid cases (10×10 matrix trừ 20 valid)
 *
 * CLOSED là final state (không có outgoing edge).
 */

export const BOM_SNAPSHOT_STATES = [
  "PLANNED",
  "PURCHASING",
  "IN_PRODUCTION",
  "INBOUND_QC",
  "PROD_QC",
  "AVAILABLE",
  "RESERVED",
  "ISSUED",
  "ASSEMBLED",
  "CLOSED",
] as const;

export type BomSnapshotState = (typeof BOM_SNAPSHOT_STATES)[number];

export const BOM_SNAPSHOT_STATE_LABELS: Record<BomSnapshotState, string> = {
  PLANNED: "Dự kiến",
  PURCHASING: "Đang mua",
  IN_PRODUCTION: "Đang SX",
  INBOUND_QC: "QC nhập",
  PROD_QC: "QC sản xuất",
  AVAILABLE: "Sẵn sàng",
  RESERVED: "Đã cấp phát",
  ISSUED: "Đã xuất",
  ASSEMBLED: "Đã lắp",
  CLOSED: "Đã đóng",
};

/**
 * Color hint cho badge (map sang V2 StatusBadge variants).
 * Không dùng trực tiếp trong Zod — chỉ UI consumer tra cứu.
 */
export const BOM_SNAPSHOT_STATE_TONES: Record<
  BomSnapshotState,
  "neutral" | "info" | "warning" | "success" | "danger" | "shortage"
> = {
  PLANNED: "neutral",
  PURCHASING: "info",
  IN_PRODUCTION: "info",
  INBOUND_QC: "warning",
  PROD_QC: "warning",
  AVAILABLE: "success",
  RESERVED: "info",
  ISSUED: "info",
  ASSEMBLED: "success",
  CLOSED: "neutral",
};

/**
 * STATE_TRANSITIONS — source of truth (đồng bộ với repo/snapshots.ts).
 *
 * Count edges: 3+3+3+3+3+2+3+2+1+0 = 23 valid transitions? Thực ra đếm lại:
 *   PLANNED → 3 (PURCHASING, IN_PRODUCTION, CLOSED)
 *   PURCHASING → 3 (INBOUND_QC, PLANNED, CLOSED)
 *   IN_PRODUCTION → 3 (PROD_QC, PLANNED, CLOSED)
 *   INBOUND_QC → 3 (AVAILABLE, PLANNED, CLOSED)
 *   PROD_QC → 3 (AVAILABLE, PLANNED, CLOSED)
 *   AVAILABLE → 2 (RESERVED, CLOSED)
 *   RESERVED → 3 (ISSUED, AVAILABLE, CLOSED)
 *   ISSUED → 2 (ASSEMBLED, CLOSED)
 *   ASSEMBLED → 1 (CLOSED)
 *   CLOSED → 0
 *   Total = 23 valid, 100 - 10 (self-loop không tính) - 23 = 67 invalid chuẩn.
 *
 * Plan §7 viết "20 valid" là đếm xấp xỉ — chốt 23 theo spec semantic đúng.
 */
export const STATE_TRANSITIONS: Record<BomSnapshotState, BomSnapshotState[]> = {
  PLANNED: ["PURCHASING", "IN_PRODUCTION", "CLOSED"],
  PURCHASING: ["INBOUND_QC", "PLANNED", "CLOSED"],
  IN_PRODUCTION: ["PROD_QC", "PLANNED", "CLOSED"],
  INBOUND_QC: ["AVAILABLE", "PLANNED", "CLOSED"],
  PROD_QC: ["AVAILABLE", "PLANNED", "CLOSED"],
  AVAILABLE: ["RESERVED", "CLOSED"],
  RESERVED: ["ISSUED", "AVAILABLE", "CLOSED"],
  ISSUED: ["ASSEMBLED", "CLOSED"],
  ASSEMBLED: ["CLOSED"],
  CLOSED: [],
};

/**
 * canTransition(from, to) — pure helper, share client/server.
 * Admin override: cho mọi transition trừ từ CLOSED (final).
 */
export function canTransition(
  from: BomSnapshotState,
  to: BomSnapshotState,
  options: { adminOverride?: boolean } = {},
): boolean {
  if (from === to) return false; // self-loop không hợp lệ
  if (options.adminOverride) {
    return from !== "CLOSED";
  }
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * validTransitionsFrom(from) — list toState hợp lệ (UI dropdown).
 * Admin option: mở rộng sang tất cả trừ CLOSED final.
 */
export function validTransitionsFrom(
  from: BomSnapshotState,
  options: { adminOverride?: boolean } = {},
): BomSnapshotState[] {
  if (options.adminOverride && from !== "CLOSED") {
    return BOM_SNAPSHOT_STATES.filter((s) => s !== from);
  }
  return STATE_TRANSITIONS[from] ?? [];
}

export const bomSnapshotStateSchema = z.enum(BOM_SNAPSHOT_STATES);

export const snapshotTransitionSchema = z.object({
  toState: bomSnapshotStateSchema,
  actionNote: z
    .string()
    .trim()
    .min(3, "Ghi chú tối thiểu 3 ký tự")
    .max(500, "Ghi chú tối đa 500 ký tự"),
  versionLock: z.coerce.number().int().nonnegative(),
  adminOverride: z.boolean().optional().default(false),
});

export const snapshotExplodeSchema = z.object({
  revisionId: z.string().uuid("Phải chọn revision hợp lệ"),
  targetQty: z.coerce
    .number()
    .positive("Target Qty phải > 0")
    .max(10_000_000, "Target Qty quá lớn"),
});

export const snapshotLineListQuerySchema = z.object({
  state: z
    .union([bomSnapshotStateSchema, z.array(bomSnapshotStateSchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  level: z.coerce.number().int().min(0).max(20).optional(),
  q: z.string().trim().max(120).optional(),
  shortOnly: z
    .union([z.enum(["true", "false"]), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(100),
});

export type SnapshotTransitionInput = z.infer<typeof snapshotTransitionSchema>;
export type SnapshotExplodeInput = z.infer<typeof snapshotExplodeSchema>;
export type SnapshotLineListQuery = z.infer<typeof snapshotLineListQuerySchema>;
