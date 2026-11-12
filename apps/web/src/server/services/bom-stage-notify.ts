import type { Role } from "@iot/shared";
import type { NotifyPlan, NotifyTarget } from "@/server/services/notification-plans";

/**
 * BOM V5 — thông báo bàn giao bước cho BỘ PHẬN PHỤ TRÁCH BƯỚC KẾ TIẾP.
 * THUẦN (không DB): ánh xạ bước → vai trò + soạn nội dung. Gộp 1 thông báo /
 * 1 hành động / 1 vai trò (không theo từng dòng); actor bị loại bởi
 * assignRecipients (plan.actorUserId). Đảo bút toán KHÔNG gọi module này.
 */

export const MAX_CODES = 3;

export interface HandoffLine {
  lineId: string;
  /** Mã dòng hiển thị (positionCode, fallback tên). */
  label: string;
  qty: number;
}

interface Actor {
  actorUserId: string | null;
  actorUsername?: string | null;
}

export interface StageHandoffRule {
  roles: readonly Role[];
  /** n = số dòng. */
  phrase: (n: number) => string;
}

/** Bước ĐÍCH (chuyển thủ công) → vai trò nhận + câu. */
export const STAGE_HANDOFF: Readonly<Record<string, StageHandoffRule>> = {
  PO: { roles: ["purchaser"], phrase: (n) => `${n} dòng cần đặt hàng` },
  ORDER: { roles: ["purchaser"], phrase: (n) => `${n} dòng cần đặt hàng` },
  VENDOR: { roles: ["purchaser"], phrase: (n) => `${n} dòng đang gia công tại NCC — theo dõi` },
  RECEIVED: { roles: ["warehouse", "qc"], phrase: (n) => `${n} dòng hàng về, chờ QC` },
  STOCK: { roles: ["warehouse", "qc"], phrase: (n) => `${n} dòng hàng về, chờ QC` },
  MACHINING: { roles: ["operator"], phrase: (n) => `${n} dòng có phôi, sẵn sàng gia công` },
  SURFACE: {
    roles: ["warehouse"],
    phrase: (n) => `${n} dòng chuyển sang bề mặt/NTP — chuẩn bị xuất`,
  },
  QC: { roles: ["qc"], phrase: (n) => `${n} dòng chờ QC` },
  ASSEMBLY: { roles: ["operator", "planner"], phrase: (n) => `${n} dòng sẵn sàng lắp ráp` },
};

const fmtQty = (n: number) =>
  (Math.round(n * 10000) / 10000).toLocaleString("vi-VN", { maximumFractionDigits: 4 });

/** "BL1, BL2, BL3, +k" — loại trùng, giữ thứ tự. */
export function summarizeCodes(labels: readonly string[], max = MAX_CODES): string {
  const uniq = [...new Set(labels.filter(Boolean))];
  if (uniq.length <= max) return uniq.join(", ");
  return `${uniq.slice(0, max).join(", ")}, +${uniq.length - max}`;
}

export function bomGridLink(templateId: string): string {
  return `/bom/${templateId}/grid`;
}

/** Link ứng viên: lưới BOM, rồi /engineering cho vai trò (qc) không vào được /bom. */
const linksFor = (templateId: string): string[] => [bomGridLink(templateId), "/engineering"];

function target(r: Role, templateId: string, title: string, message: string): NotifyTarget {
  return { kind: "role", role: r, title, message, links: linksFor(templateId), category: "action" };
}

const distinctCount = (items: readonly { lineId: string }[]) =>
  new Set(items.map((x) => x.lineId)).size;

/* ── Chuyển bước thủ công (single / bulk) ─────────────────────────────── */

export interface StageMoveItem extends HandoffLine {
  /** Bước đích của lần chuyển. */
  toStage: string;
}

export interface ManualMoveCtx extends Actor {
  templateId: string;
  templateCode: string;
  moves: readonly StageMoveItem[];
}

/** null = không có ai cần báo (bước đích không có bộ phận phụ trách). */
export function planStageMoved(ctx: ManualMoveCtx): NotifyPlan | null {
  const groups = new Map<string, StageMoveItem[]>();
  for (const m of ctx.moves) {
    if (!STAGE_HANDOFF[m.toStage]) continue;
    const arr = groups.get(m.toStage) ?? [];
    arr.push(m);
    groups.set(m.toStage, arr);
  }
  // role → (bước đích → các dòng)
  const perRole = new Map<Role, Map<string, StageMoveItem[]>>();
  for (const [stage, items] of groups) {
    for (const r of STAGE_HANDOFF[stage]!.roles) {
      const byStage = perRole.get(r) ?? new Map<string, StageMoveItem[]>();
      byStage.set(stage, items);
      perRole.set(r, byStage);
    }
  }
  if (perRole.size === 0) return null;

  const targets: NotifyTarget[] = [];
  for (const [r, byStage] of perRole) {
    const stages = [...byStage.keys()];
    const all = stages.flatMap((s) => byStage.get(s)!);
    const phrases = stages.map((s) => {
      const items = byStage.get(s)!;
      return { text: STAGE_HANDOFF[s]!.phrase(distinctCount(items)), items };
    });
    // PO + ORDER (cùng câu) → coi như 1 nhóm với tổng số dòng.
    const sameWording =
      new Set(stages.map((s) => STAGE_HANDOFF[s]!.phrase(0))).size === 1;
    let title: string;
    let message: string;
    if (phrases.length === 1) {
      title = `BOM ${ctx.templateCode}: ${phrases[0]!.text}`;
      message = summarizeCodes(all.map((x) => x.label));
    } else if (sameWording) {
      title = `BOM ${ctx.templateCode}: ${STAGE_HANDOFF[stages[0]!]!.phrase(distinctCount(all))}`;
      message = summarizeCodes(all.map((x) => x.label));
    } else {
      title = `BOM ${ctx.templateCode}: ${distinctCount(all)} dòng chuyển bước`;
      message = phrases
        .map((p) => `${p.text}: ${summarizeCodes(p.items.map((x) => x.label))}`)
        .join("; ");
    }
    targets.push(target(r, ctx.templateId, title, message));
  }
  return {
    eventType: "BOM_STAGE_HANDOFF",
    entityType: "bom_template",
    entityId: ctx.templateId,
    entityCode: ctx.templateCode,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets,
  };
}

/* ── Phiếu giao ───────────────────────────────────────────────────────── */

export interface SlipNotifyCtx extends Actor {
  templateId: string;
  templateCode: string;
  slipId: string;
  slipNo: string;
  lines: readonly HandoffLine[];
  /** Tên NCC/NTP (SURFACE). */
  supplierName?: string | null;
}

const totals = (lines: readonly HandoffLine[]) => ({
  n: distinctCount(lines),
  qty: lines.reduce((s, l) => s + l.qty, 0),
  codes: summarizeCodes(lines.map((l) => l.label)),
});

function slipPlan(
  ctx: SlipNotifyCtx,
  roles: readonly Role[],
  title: string,
  message: string,
): NotifyPlan {
  return {
    eventType: "BOM_STAGE_HANDOFF",
    entityType: "delivery_slip",
    entityId: ctx.slipId,
    entityCode: ctx.slipNo,
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    targets: roles.map((r) => target(r, ctx.templateId, title, message)),
  };
}

/** Tạo phiếu SURFACE (gửi NTP) → Kho chuẩn bị xuất. */
export function planSlipSurfaceCreated(ctx: SlipNotifyCtx): NotifyPlan {
  const t = totals(ctx.lines);
  const who = ctx.supplierName?.trim() || "nhà thầu phụ";
  return slipPlan(
    ctx,
    ["warehouse"],
    `BOM ${ctx.templateCode}: chuẩn bị xuất ${t.n} món gửi ${who}`,
    `Chuẩn bị xuất ${t.n} món (${fmtQty(t.qty)} cái) gửi ${who} — phiếu ${ctx.slipNo}. ${t.codes}`,
  );
}

/** Nhận hàng về phiếu SURFACE → QC. `lines` = các dòng + SL nhận lần này. */
export function planSlipSurfaceReceived(ctx: SlipNotifyCtx): NotifyPlan {
  const t = totals(ctx.lines);
  const who = ctx.supplierName?.trim() || "nhà thầu phụ";
  return slipPlan(
    ctx,
    ["qc"],
    `BOM ${ctx.templateCode}: hàng về từ ${who}, chờ QC`,
    `${fmtQty(t.qty)} cái về từ ${who} (phiếu ${ctx.slipNo}) — chờ QC. ${t.codes}`,
  );
}

/** Tạo phiếu ASSEMBLY → Vận hành + Kế hoạch. */
export function planSlipAssemblyCreated(ctx: SlipNotifyCtx): NotifyPlan {
  const t = totals(ctx.lines);
  return slipPlan(
    ctx,
    ["operator", "planner"],
    `BOM ${ctx.templateCode}: ${t.n} món sẵn sàng lắp ráp`,
    `${t.n} món (${fmtQty(t.qty)} cái) sẵn sàng lắp ráp — phiếu ${ctx.slipNo}. ${t.codes}`,
  );
}
