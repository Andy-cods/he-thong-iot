import { and, desc, eq } from "drizzle-orm";
import {
  deliveryNote,
  deliveryNoteLine,
  item,
  userAccount,
  warehouseIssueRequest,
} from "@iot/db/schema";
import type { DeliveryNote } from "@iot/db/schema";
import { db } from "@/lib/db";
import { currentYymm, genDocNo } from "./_docNumber";

/**
 * Repository `delivery_note` — V4.0 Wave 3 Phase D (BBGH).
 *
 * State machine (varchar tự do, giống purchase_request.approval_step):
 *   DRAFT → PENDING_APPROVAL → CONFIRMED (= BBGH chính thức) | REJECTED
 *
 * Chỉ tạo được từ 1 `warehouse_issue_request` đã COMPLETED và có
 * `reason IN ('sales','return')` (xuất hàng ra ngoài công ty) — check ở route,
 * không lặp lại ở repo để tránh phụ thuộc vòng.
 */

export interface DeliveryNoteLineInput {
  itemId: string;
  specification?: string | null;
  uom?: string | null;
  docQty: number;
  actualQty?: number | null;
  condition?: "FULL" | "SHORT" | "DAMAGED";
  notes?: string | null;
}

export interface CreateDeliveryNoteInput {
  issueRequestId: string;
  salesOrderId?: string | null;
  poId?: string | null;
  recipientName: string;
  recipientAddress?: string | null;
  recipientContactName?: string | null;
  recipientPhone?: string | null;
  contractNo?: string | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  carrierName?: string | null;
  carrierPhone?: string | null;
  notes?: string | null;
  deliveredBy: string;
  lines: DeliveryNoteLineInput[];
}

export async function createDeliveryNote(
  input: CreateDeliveryNoteInput,
): Promise<DeliveryNote> {
  if (input.lines.length === 0) throw new Error("DELIVERY_NOTE_MUST_HAVE_LINES");

  return db.transaction(async (tx) => {
    const noteNo = await genDocNo(tx, {
      table: "app.delivery_note",
      column: "note_no",
      prefix: `BBGH-${currentYymm()}`,
      seqPart: 3,
      pad: 4,
    });

    const [row] = await tx
      .insert(deliveryNote)
      .values({
        noteNo,
        status: "DRAFT",
        issueRequestId: input.issueRequestId,
        salesOrderId: input.salesOrderId ?? null,
        poId: input.poId ?? null,
        recipientName: input.recipientName,
        recipientAddress: input.recipientAddress ?? null,
        recipientContactName: input.recipientContactName ?? null,
        recipientPhone: input.recipientPhone ?? null,
        contractNo: input.contractNo ?? null,
        vehicleType: input.vehicleType ?? null,
        vehiclePlate: input.vehiclePlate ?? null,
        carrierName: input.carrierName ?? null,
        carrierPhone: input.carrierPhone ?? null,
        notes: input.notes ?? null,
        deliveredBy: input.deliveredBy,
        createdBy: input.deliveredBy,
      })
      .returning();
    if (!row) throw new Error("DELIVERY_NOTE_INSERT_FAILED");

    await tx.insert(deliveryNoteLine).values(
      input.lines.map((l, idx) => ({
        deliveryNoteId: row.id,
        lineNo: idx + 1,
        itemId: l.itemId,
        specification: l.specification ?? null,
        uom: l.uom ?? null,
        docQty: String(l.docQty),
        actualQty: String(l.actualQty ?? l.docQty),
        condition: l.condition ?? "FULL",
        notes: l.notes ?? null,
      })),
    );

    return row;
  });
}

export async function getDeliveryNote(id: string): Promise<DeliveryNote | null> {
  const [row] = await db
    .select()
    .from(deliveryNote)
    .where(eq(deliveryNote.id, id))
    .limit(1);
  return row ?? null;
}

export async function getDeliveryNoteByIssueRequest(
  issueRequestId: string,
): Promise<DeliveryNote | null> {
  const [row] = await db
    .select()
    .from(deliveryNote)
    .where(eq(deliveryNote.issueRequestId, issueRequestId))
    .limit(1);
  return row ?? null;
}

export async function getDeliveryNoteLines(deliveryNoteId: string) {
  return db
    .select({
      id: deliveryNoteLine.id,
      lineNo: deliveryNoteLine.lineNo,
      itemId: deliveryNoteLine.itemId,
      sku: item.sku,
      name: item.name,
      itemUom: item.uom,
      specification: deliveryNoteLine.specification,
      uom: deliveryNoteLine.uom,
      docQty: deliveryNoteLine.docQty,
      actualQty: deliveryNoteLine.actualQty,
      condition: deliveryNoteLine.condition,
      notes: deliveryNoteLine.notes,
    })
    .from(deliveryNoteLine)
    .leftJoin(item, eq(item.id, deliveryNoteLine.itemId))
    .where(eq(deliveryNoteLine.deliveryNoteId, deliveryNoteId))
    .orderBy(deliveryNoteLine.lineNo);
}

export interface ListDeliveryNotesQuery {
  status?: string[];
  page: number;
  pageSize: number;
}

export async function listDeliveryNotes(q: ListDeliveryNotesQuery) {
  const where =
    q.status && q.status.length > 0
      ? and(...q.status.map((s) => eq(deliveryNote.status, s)))
      : undefined;
  const offset = (q.page - 1) * q.pageSize;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        note: deliveryNote,
        issueRequestNo: warehouseIssueRequest.requestNo,
        deliveredByName: userAccount.fullName,
      })
      .from(deliveryNote)
      .leftJoin(
        warehouseIssueRequest,
        eq(warehouseIssueRequest.id, deliveryNote.issueRequestId),
      )
      .leftJoin(userAccount, eq(userAccount.id, deliveryNote.deliveredBy))
      .where(where)
      .orderBy(desc(deliveryNote.createdAt))
      .limit(q.pageSize)
      .offset(offset),
    db.select({ id: deliveryNote.id }).from(deliveryNote).where(where),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r.note,
      issueRequestNo: r.issueRequestNo,
      deliveredByName: r.deliveredByName,
    })),
    total: totalRows.length,
  };
}

/** DRAFT → PENDING_APPROVAL (Kho gửi chờ Giám đốc duyệt). */
export async function submitDeliveryNote(id: string): Promise<DeliveryNote | null> {
  const [row] = await db
    .update(deliveryNote)
    .set({ status: "PENDING_APPROVAL", updatedAt: new Date() })
    .where(and(eq(deliveryNote.id, id), eq(deliveryNote.status, "DRAFT")))
    .returning();
  return row ?? null;
}

export interface ConfirmDeliveryNoteInput {
  confirmedBy: string;
  /** Override kết luận giao nhận lúc duyệt (nếu Giám đốc điều chỉnh). */
  deliveryResult?: "FULL" | "SHORT" | "DAMAGED";
  conclusionNotes?: string | null;
}

/** PENDING_APPROVAL → CONFIRMED (= BBGH chính thức). CHỈ admin (check ở route). */
export async function confirmDeliveryNote(
  id: string,
  input: ConfirmDeliveryNoteInput,
): Promise<DeliveryNote | null> {
  const [row] = await db
    .update(deliveryNote)
    .set({
      status: "CONFIRMED",
      confirmedBy: input.confirmedBy,
      confirmedAt: new Date(),
      ...(input.deliveryResult ? { deliveryResult: input.deliveryResult } : {}),
      ...(input.conclusionNotes !== undefined
        ? { conclusionNotes: input.conclusionNotes }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(deliveryNote.id, id), eq(deliveryNote.status, "PENDING_APPROVAL")),
    )
    .returning();
  return row ?? null;
}

/** PENDING_APPROVAL → REJECTED. CHỈ admin (check ở route). */
export async function rejectDeliveryNote(
  id: string,
  rejectedBy: string,
  reason: string,
): Promise<DeliveryNote | null> {
  const [row] = await db
    .update(deliveryNote)
    .set({
      status: "REJECTED",
      rejectedBy,
      rejectedAt: new Date(),
      rejectionReason: reason,
      updatedAt: new Date(),
    })
    .where(
      and(eq(deliveryNote.id, id), eq(deliveryNote.status, "PENDING_APPROVAL")),
    )
    .returning();
  return row ?? null;
}
