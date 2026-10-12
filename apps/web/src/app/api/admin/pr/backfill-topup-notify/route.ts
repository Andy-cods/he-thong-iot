import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { purchaseRequest } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyPoTopUpIfNeeded } from "@/server/services/prWarehouseNotify";
import { getSession, unauthorized } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lần 8 — POST /api/admin/pr/backfill-topup-notify (CHỈ admin). Chạy MỘT lần sau khi deploy + áp
 * migration 0081: với mọi phiếu CONVERTED chưa hoàn tất mà sổ còn phần phải đặt (toOrder > 0 — PO trước
 * đóng thiếu / QC hỏng / bị huỷ), gửi Thu mua "Cần tạo PO bổ sung".
 * IDEMPOTENT: phiếu đã có "Cần tạo PO" chưa đọc thì bỏ qua (notifyPoTopUpIfNeeded tự kiểm), gọi lại
 * không gửi trùng. Trả { scanned, notified }.
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return unauthorized();
  if (!s.roles.includes("admin")) return jsonError("FORBIDDEN", "Chỉ Admin được chạy backfill.", 403);
  try {
    const rows = await db
      .select({ id: purchaseRequest.id })
      .from(purchaseRequest)
      .where(
        and(
          eq(purchaseRequest.status, "CONVERTED"),
          isNull(purchaseRequest.completedAt),
          isNull(purchaseRequest.goodsIssuedAt),
        ),
      );
    let notified = 0;
    for (const r of rows) {
      if (await notifyPoTopUpIfNeeded(r.id, { userId: s.userId, fullName: s.fullName })) notified += 1;
    }
    await writeAudit({
      actor: s,
      action: "UPDATE",
      objectType: "purchase_request",
      objectId: null,
      notes: `Backfill "Cần tạo PO bổ sung": quét ${rows.length} phiếu CONVERTED, gửi ${notified}`,
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ data: { scanned: rows.length, notified } });
  } catch (err) {
    logger.error({ err }, "backfill-topup-notify failed");
    return jsonError("INTERNAL", "Không chạy được backfill.", 500);
  }
}
