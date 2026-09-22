import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { warehouseIssueRequest } from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import {
  createDeliveryNote,
  getDeliveryNoteByIssueRequest,
  listDeliveryNotes,
} from "@/server/repos/deliveryNotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.0 Wave 3 Phase D — Phiếu giao hàng / BBGH.
 *
 * POST: Kho tạo phiếu giao hàng DRAFT từ 1 warehouse_issue_request đã
 * COMPLETED, với `reason IN ('sales','return')` (xuất ra ngoài công ty — xuất
 * nội bộ SX không cần BBGH, xem plans/v4-finance/wave-3-procurement-warehouse.md
 * mục 0 U-2).
 */

interface PicksJsonLine {
  itemId: string;
  sku?: string | null;
  picks: Array<{ qty: number }>;
}

const createSchema = z.object({
  issueRequestId: z.string().uuid(),
  recipientName: z.string().trim().min(1, "Cần nhập tên bên nhận").max(255),
  recipientAddress: z.string().trim().max(1000).optional().nullable(),
  recipientContactName: z.string().trim().max(128).optional().nullable(),
  recipientPhone: z.string().trim().max(32).optional().nullable(),
  contractNo: z.string().trim().max(64).optional().nullable(),
  vehicleType: z.string().trim().max(64).optional().nullable(),
  vehiclePlate: z.string().trim().max(32).optional().nullable(),
  carrierName: z.string().trim().max(128).optional().nullable(),
  carrierPhone: z.string().trim().max(32).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  salesOrderId: z.string().uuid().optional().nullable(),
  poId: z.string().uuid().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "deliveryNote");
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const status = url.searchParams.getAll("status");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? "30")),
  );

  const result = await listDeliveryNotes({ status, page, pageSize });
  return NextResponse.json({
    data: result.rows,
    meta: { page, pageSize, total: result.total },
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "deliveryNote");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, createSchema);
  if ("response" in body) return body.response;

  const [issueRequest] = await db
    .select()
    .from(warehouseIssueRequest)
    .where(eq(warehouseIssueRequest.id, body.data.issueRequestId))
    .limit(1);
  if (!issueRequest) {
    return jsonError("NOT_FOUND", "Không tìm thấy yêu cầu xuất kho.", 404);
  }
  if (issueRequest.status !== "COMPLETED") {
    return jsonError(
      "INVALID_STATUS",
      "Chỉ tạo phiếu giao hàng từ yêu cầu xuất kho đã hoàn tất (COMPLETED).",
      409,
    );
  }
  if (!["sales", "return"].includes(issueRequest.reason)) {
    return jsonError(
      "INVALID_REASON",
      "Chỉ áp dụng cho xuất bán / trả hàng NCC (reason=sales|return). Xuất nội bộ không cần BBGH.",
      422,
    );
  }
  const existing = await getDeliveryNoteByIssueRequest(body.data.issueRequestId);
  if (existing) {
    return jsonError(
      "ALREADY_EXISTS",
      `Yêu cầu xuất kho này đã có phiếu giao hàng ${existing.noteNo}.`,
      409,
    );
  }

  // Aggregate qty theo item từ picksJson (mỗi item có thể nằm nhiều pick lot khác nhau).
  const picksLines = (issueRequest.picksJson as unknown as PicksJsonLine[]) ?? [];
  if (picksLines.length === 0) {
    return jsonError("NO_LINES", "Yêu cầu xuất kho không có dòng vật tư.", 422);
  }
  const lines = picksLines.map((l) => ({
    itemId: l.itemId,
    docQty: l.picks.reduce((sum, p) => sum + p.qty, 0),
  }));

  try {
    const row = await createDeliveryNote({
      issueRequestId: body.data.issueRequestId,
      salesOrderId: body.data.salesOrderId ?? null,
      poId: body.data.poId ?? null,
      recipientName: body.data.recipientName,
      recipientAddress: body.data.recipientAddress ?? null,
      recipientContactName: body.data.recipientContactName ?? null,
      recipientPhone: body.data.recipientPhone ?? null,
      contractNo: body.data.contractNo ?? null,
      vehicleType: body.data.vehicleType ?? null,
      vehiclePlate: body.data.vehiclePlate ?? null,
      carrierName: body.data.carrierName ?? null,
      carrierPhone: body.data.carrierPhone ?? null,
      notes: body.data.notes ?? null,
      deliveredBy: guard.session.userId,
      lines,
    });

    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "delivery_note",
      objectId: row.id,
      after: { noteNo: row.noteNo, issueRequestId: body.data.issueRequestId },
      notes: `Tạo phiếu giao hàng ${row.noteNo} từ ${issueRequest.requestNo}`,
    });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Không tạo được phiếu";
    return jsonError("CREATE_FAILED", msg, 500);
  }
}
