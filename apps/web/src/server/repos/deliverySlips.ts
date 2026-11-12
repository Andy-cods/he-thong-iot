import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  bomLine,
  bomTemplate,
  deliverySlip,
  deliverySlipLine,
  item,
  supplier,
} from "@iot/db/schema";
import { parseBomCategory, stageIndex, stagesFor } from "@iot/shared";
import { db } from "@/lib/db";
import { QTY_EPS, r4 } from "@/lib/pr-ledger";
import { resolveLineDims } from "@/lib/bom-line-dims";
import {
  applyMove,
  loadLineState,
  type StageErrorCode,
  type Tx,
} from "@/server/repos/bomStageMoves";

/**
 * BOM V5 WP8 — Phiếu giao nội bộ/NTP (bảng delivery_slip*, KHÔNG liên quan
 * delivery_note/BBGH). Mọi ghi chạy trong 1 transaction: số phiếu (seq theo
 * ngày) + chuyển bước (sổ bước, FOR UPDATE) + insert phiếu → all-or-nothing.
 * Không có bước duyệt: tạo là SENT.
 */

export type SlipKind = "SURFACE" | "ASSEMBLY";

export const ASSEMBLY_RECIPIENT = "BỘ PHẬN LẮP RÁP — XƯỞNG GTAM";

const KIND_STAGES: Record<SlipKind, { from: string; to: string }> = {
  SURFACE: { from: "MACHINING", to: "SURFACE" },
  ASSEMBLY: { from: "QC", to: "ASSEMBLY" },
};

export type SlipErrorCode =
  | StageErrorCode
  | "BAD_REQUEST"
  | "SUPPLIER_REQUIRED"
  | "SUPPLIER_NOT_FOUND"
  | "BAD_CATEGORY"
  | "NO_STOCK"
  | "EXCEEDS_DOC"
  | "NOT_RECEIVABLE";

export const SLIP_ERROR_MESSAGES: Record<string, string> = {
  BAD_REQUEST: "Dữ liệu phiếu không hợp lệ.",
  SUPPLIER_REQUIRED: "Phiếu gửi nhà thầu phụ phải chọn nhà thầu phụ.",
  SUPPLIER_NOT_FOUND: "Không tìm thấy nhà thầu phụ đã chọn.",
  BAD_CATEGORY: "Chỉ chi tiết GTAM (tự gia công) mới gửi xử lý bề mặt.",
  NO_STOCK: "Dòng này không còn hàng ở bước nguồn để giao.",
  EXCEEDS_BUCKET: "Số lượng giao vượt quá số đang có ở bước nguồn.",
  EXCEEDS_DOC: "Số lượng nhận vượt quá số lượng trên chứng từ.",
  NOT_RECEIVABLE: "Phiếu này không nhận hàng về được (chỉ phiếu gửi nhà thầu phụ, chưa nhận đủ).",
  NOT_FOUND: "Không tìm thấy phiếu / dòng.",
};

export function slipErrorMessage(code: string): string {
  return SLIP_ERROR_MESSAGES[code] ?? "Không lập được phiếu.";
}

export type SlipFail = {
  ok: false;
  code: SlipErrorCode;
  index?: number;
  lineId?: string;
};

class Abort extends Error {
  constructor(public readonly fail: SlipFail) {
    super("SLIP_ABORT");
  }
}

export interface SlipLineSnap {
  name: string;
  itemName: string | null;
  sku: string | null;
  dimsText: string | null;
  dims: { l: number; w: number; h: number } | null;
  surfaceTreatment: string | null;
  positionCode: string | null;
  projectCode: string | null;
  category: string;
  uom: string;
  recipient: { name: string; address: string | null };
}

export type SlipRow = typeof deliverySlip.$inferSelect;
export type SlipLineRow = typeof deliverySlipLine.$inferSelect;
export interface SlipDetail {
  slip: SlipRow;
  lines: SlipLineRow[];
}

/** Ngày theo Asia/Ho_Chi_Minh (UTC+7, không DST) dạng YYYY-MM-DD. */
export function vnDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function formatSlipNo(day: string, n: number): string {
  return `GT-PG${day.slice(2, 4)}${day.slice(5, 7)}${day.slice(8, 10)}-0${n}`;
}

export interface CreateSlipInput {
  templateId: string;
  kind: SlipKind;
  supplierId?: string | null;
  notes?: string | null;
  lines: Array<{
    lineId: string;
    qty?: number | null;
    unitPrice?: number | null;
    note?: string | null;
  }>;
  actorId: string | null;
}

export type CreateSlipResult = ({ ok: true } & SlipDetail) | SlipFail;

export async function createDeliverySlip(input: CreateSlipInput): Promise<CreateSlipResult> {
  const { kind } = input;
  const { from, to } = KIND_STAGES[kind];
  try {
    return await db.transaction(async (tx): Promise<CreateSlipResult> => {
      const [tpl] = await tx
        .select({ id: bomTemplate.id, code: bomTemplate.code })
        .from(bomTemplate)
        .where(eq(bomTemplate.id, input.templateId))
        .limit(1);
      if (!tpl) throw new Abort({ ok: false, code: "NOT_FOUND" });

      let recipient: { name: string; address: string | null };
      let supplierId: string | null = null;
      if (kind === "SURFACE") {
        if (!input.supplierId) throw new Abort({ ok: false, code: "SUPPLIER_REQUIRED" });
        const [sup] = await tx
          .select({ id: supplier.id, name: supplier.name, address: supplier.address })
          .from(supplier)
          .where(eq(supplier.id, input.supplierId))
          .limit(1);
        if (!sup) throw new Abort({ ok: false, code: "SUPPLIER_NOT_FOUND" });
        supplierId = sup.id;
        recipient = { name: sup.name, address: sup.address ?? null };
      } else {
        recipient = { name: ASSEMBLY_RECIPIENT, address: null };
      }

      // Số phiếu: seq theo ngày (giữ khoá hàng seq đến hết tx → tuần tự hoá).
      const day = vnDay();
      const seqRows = (await tx.execute(sql`
        INSERT INTO app.delivery_slip_seq (day, last) VALUES (${day}, 1)
        ON CONFLICT (day) DO UPDATE SET last = app.delivery_slip_seq.last + 1
        RETURNING last
      `)) as unknown as Array<{ last: number }>;
      const n = Number(seqRows[0]?.last ?? 1);
      const slipNo = formatSlipNo(day, n);

      const ids = Array.from(new Set(input.lines.map((l) => l.lineId)));
      if (ids.length !== input.lines.length)
        throw new Abort({ ok: false, code: "BAD_REQUEST" });
      const lineRows = await tx
        .select()
        .from(bomLine)
        .where(and(inArray(bomLine.id, ids), eq(bomLine.templateId, input.templateId)));
      const lineById = new Map(lineRows.map((l) => [l.id, l]));
      const compIds = Array.from(new Set(lineRows.map((l) => l.componentItemId)));
      const itemRows = compIds.length
        ? await tx.select().from(item).where(inArray(item.id, compIds))
        : [];
      const itemById = new Map(itemRows.map((i) => [i.id, i]));

      // Khoá dòng theo id tăng dần (tránh deadlock giữa 2 phiếu), stt theo thứ tự nhập.
      const order = input.lines
        .map((l, index) => ({ l, index }))
        .sort((a, b) => (a.l.lineId < b.l.lineId ? -1 : a.l.lineId > b.l.lineId ? 1 : 0));

      const slipId = randomUUID();
      const outLines: Array<typeof deliverySlipLine.$inferInsert> = [];
      let maxBatch = 1;
      for (const { l, index } of order) {
        const fail = (code: SlipErrorCode): never => {
          throw new Abort({ ok: false, code, index, lineId: l.lineId });
        };
        const line = lineById.get(l.lineId);
        if (!line) return fail("NOT_FOUND");
        const st = await loadLineState(tx, input.templateId, l.lineId);
        if (!st) return fail("NOT_FOUND");
        if (kind === "SURFACE" && st.category !== "GTAM") return fail("BAD_CATEGORY");
        const avail = r4(st.buckets[from] ?? 0);
        const qty = l.qty == null ? avail : r4(l.qty);
        if (!(qty > 0)) return fail(l.qty == null ? "NO_STOCK" : "BAD_QTY");
        if (qty > avail + QTY_EPS) return fail("EXCEEDS_BUCKET");

        const slipLineId = randomUUID();
        const mv = await applyMove(tx, {
          templateId: input.templateId,
          lineId: l.lineId,
          from,
          to,
          qty,
          note: `Phiếu ${slipNo}`,
          docType: "DELIVERY_SLIP",
          docId: slipLineId,
          actorId: input.actorId,
        });
        if (!mv.ok) return fail(mv.code);

        // Đợt n = số phiếu cùng loại (chưa huỷ) trước đó của dòng + 1.
        const prev = await tx
          .select({ slipId: deliverySlipLine.slipId })
          .from(deliverySlipLine)
          .where(eq(deliverySlipLine.lineId, l.lineId));
        let prevCount = 0;
        if (prev.length > 0) {
          const slips = await tx
            .select({ id: deliverySlip.id, kind: deliverySlip.kind, status: deliverySlip.status })
            .from(deliverySlip)
            .where(inArray(deliverySlip.id, prev.map((p) => p.slipId)));
          const ok = new Set(
            slips.filter((s) => s.kind === kind && s.status !== "CANCELLED").map((s) => s.id),
          );
          prevCount = prev.filter((p) => ok.has(p.slipId)).length;
        }
        const batch = prevCount + 1;
        maxBatch = Math.max(maxBatch, batch);

        // Còn = SL chưa tới bước đích (đích hoặc xa hơn) sau phiếu này.
        const codes = stagesFor(st.category);
        const ti = stageIndex(st.category, to);
        let reached = 0;
        for (let i = ti; i < codes.length; i++) reached += mv.buckets[codes[i]!] ?? 0;
        const remaining = Math.max(0, r4(st.required - reached));
        const userNote = l.note?.trim();
        const note = `Đợt ${batch}${remaining > 0 ? ` · còn ${remaining}` : ""}${userNote ? ` · ${userNote}` : ""}`.slice(0, 500);

        const it = itemById.get(line.componentItemId);
        const md = (line.metadata ?? {}) as { size?: string };
        const dims = resolveLineDims({
          metadataSize: md.size ?? null,
          itemDimensions: it?.dimensions ?? null,
          itemSpecJson: it?.specJson ?? null,
        });
        const snap: SlipLineSnap = {
          name: line.file3dName?.trim() || it?.name || "",
          itemName: it?.name ?? null,
          sku: it?.sku ?? null,
          dimsText: dims.text,
          dims: dims.dims,
          surfaceTreatment: kind === "SURFACE" ? (line.surfaceTreatment ?? null) : null,
          positionCode: line.positionCode ?? null,
          projectCode: tpl.code,
          category: parseBomCategory(line.category),
          uom: "Cái",
          recipient,
        };
        outLines[index] = {
          id: slipLineId,
          slipId,
          lineId: l.lineId,
          stt: index + 1,
          fromStage: from,
          toStage: to,
          qtyDoc: String(qty),
          qtyReceived: "0",
          unitPrice: kind === "SURFACE" && l.unitPrice != null ? String(l.unitPrice) : null,
          note,
          snap,
        };
      }

      const [slip] = await tx
        .insert(deliverySlip)
        .values({
          id: slipId,
          slipNo,
          kind,
          templateId: input.templateId,
          projectCode: tpl.code,
          supplierId,
          recipientText: recipient.name,
          status: "SENT",
          batchNo: maxBatch,
          notes: input.notes?.trim() || null,
          createdBy: input.actorId,
        })
        .returning();
      const lines = await tx.insert(deliverySlipLine).values(outLines).returning();
      lines.sort((a, b) => a.stt - b.stt);
      return { ok: true, slip: slip!, lines };
    });
  } catch (err) {
    if (err instanceof Abort) return err.fail;
    throw err;
  }
}

export async function getDeliverySlip(slipId: string): Promise<SlipDetail | null> {
  const [slip] = await db
    .select()
    .from(deliverySlip)
    .where(eq(deliverySlip.id, slipId))
    .limit(1);
  if (!slip) return null;
  const lines = await db
    .select()
    .from(deliverySlipLine)
    .where(eq(deliverySlipLine.slipId, slipId));
  lines.sort((a, b) => a.stt - b.stt);
  return { slip, lines };
}

export interface SlipSummary extends SlipRow {
  lineCount: number;
  totalQtyDoc: number;
  totalQtyReceived: number;
}

export async function listDeliverySlips(templateId: string): Promise<SlipSummary[]> {
  const slips = await db
    .select()
    .from(deliverySlip)
    .where(eq(deliverySlip.templateId, templateId))
    .orderBy(desc(deliverySlip.createdAt));
  if (slips.length === 0) return [];
  const lines = await db
    .select()
    .from(deliverySlipLine)
    .where(inArray(deliverySlipLine.slipId, slips.map((s) => s.id)));
  return slips.map((s) => {
    const ls = lines.filter((l) => l.slipId === s.id);
    return {
      ...s,
      lineCount: ls.length,
      totalQtyDoc: r4(ls.reduce((a, l) => a + Number(l.qtyDoc), 0)),
      totalQtyReceived: r4(ls.reduce((a, l) => a + Number(l.qtyReceived), 0)),
    };
  });
}

export type ReceiveResult = ({ ok: true } & SlipDetail) | SlipFail;

/** Nhận hàng về (chỉ SURFACE): cộng dồn Thực nhận, chuyển SURFACE→QC đúng SL nhận. */
export async function receiveDeliverySlip(
  slipId: string,
  inputs: Array<{ slipLineId: string; qty: number }>,
  actorId: string | null,
): Promise<ReceiveResult> {
  try {
    return await db.transaction(async (tx: Tx): Promise<ReceiveResult> => {
      const [slip] = await tx
        .select()
        .from(deliverySlip)
        .where(eq(deliverySlip.id, slipId))
        .for("update");
      if (!slip) throw new Abort({ ok: false, code: "NOT_FOUND" });
      if (slip.kind !== "SURFACE" || slip.status === "CANCELLED" || slip.status === "RECEIVED")
        throw new Abort({ ok: false, code: "NOT_RECEIVABLE" });

      const lines = await tx
        .select()
        .from(deliverySlipLine)
        .where(eq(deliverySlipLine.slipId, slipId));
      const byId = new Map(lines.map((l) => [l.id, l]));

      // Gộp trùng slipLineId.
      const want = new Map<string, number>();
      for (const i of inputs) want.set(i.slipLineId, (want.get(i.slipLineId) ?? 0) + i.qty);
      const work = Array.from(want.entries())
        .map(([slipLineId, qty], index) => ({ slipLineId, qty, index, line: byId.get(slipLineId) }))
        .sort((a, b) => ((a.line?.lineId ?? "") < (b.line?.lineId ?? "") ? -1 : 1));

      for (const w of work) {
        const fail = (code: SlipErrorCode): never => {
          throw new Abort({ ok: false, code, index: w.index, lineId: w.slipLineId });
        };
        if (!w.line) return fail("NOT_FOUND");
        const qty = r4(w.qty);
        if (!(qty > 0)) return fail("BAD_QTY");
        const prev = Number(w.line.qtyReceived);
        if (prev + qty > Number(w.line.qtyDoc) + QTY_EPS) return fail("EXCEEDS_DOC");
        const mv = await applyMove(tx, {
          templateId: slip.templateId,
          lineId: w.line.lineId,
          from: "SURFACE",
          to: "QC",
          qty,
          note: `Nhận về phiếu ${slip.slipNo}`,
          docType: "SLIP_RECEIVE",
          // prev tăng dần sau mỗi lần nhận → khoá idempotent theo "lần nhận".
          docId: `${w.slipLineId}:${prev}`,
          actorId,
        });
        if (!mv.ok) return fail(mv.code);
        const newRecv = r4(prev + qty);
        await tx
          .update(deliverySlipLine)
          .set({ qtyReceived: String(newRecv) })
          .where(eq(deliverySlipLine.id, w.slipLineId));
        w.line.qtyReceived = String(newRecv);
      }

      const all = lines.every((l) => Number(l.qtyReceived) + QTY_EPS >= Number(l.qtyDoc));
      const any = lines.some((l) => Number(l.qtyReceived) > 0);
      const status = all ? "RECEIVED" : any ? "PARTIAL_RECEIVED" : slip.status;
      await tx.update(deliverySlip).set({ status }).where(eq(deliverySlip.id, slipId));
      lines.sort((a, b) => a.stt - b.stt);
      return { ok: true, slip: { ...slip, status }, lines };
    });
  } catch (err) {
    if (err instanceof Abort) return err.fail;
    throw err;
  }
}
