import { NextResponse, type NextRequest } from "next/server";
import { and, eq, asc } from "drizzle-orm";
import {
  assemblyScan,
  bomSnapshotLine,
  userAccount,
  workOrder,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V2.0-P2-W6 — GET /api/assembly/wo/[id]/sessions
 *
 * "Sổ ghi chép đợt lắp ráp": group `assembly_scan` rows theo session window.
 * Phương án không-migration:
 *   - Sort scans by scannedAt ASC.
 *   - Mỗi gap > 30 phút HOẶC khác `scannedBy` → mở session mới.
 *   - Trả mảng session đã đóng (kết thúc bằng scan cuối hoặc khi user đổi).
 *
 * 1 session "đang chạy" được nhận diện ở client:
 *   - Session cuối cùng có endedAt < (now - 30 phút) coi là đã đóng.
 *   - Else → "Đang chạy".
 */

const GAP_MINUTES = 30;
const GAP_MS = GAP_MINUTES * 60 * 1000;

interface SessionLine {
  scanId: string;
  snapshotLineId: string | null;
  componentSku: string | null;
  componentName: string | null;
  qty: number;
  barcode: string;
  lotSerialId: string | null;
  scannedAt: string;
  deviceId: string | null;
  mode: "manual" | "barcode";
}

interface SessionSummary {
  sessionNo: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  userId: string | null;
  userName: string | null;
  totalLines: number;
  totalQty: number;
  totalScans: number;
  lines: SessionLine[];
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "wo");
  if ("response" in guard) return guard.response;

  try {
    const woId = params.id;
    const [wo] = await db
      .select({ id: workOrder.id, woNo: workOrder.woNo })
      .from(workOrder)
      .where(eq(workOrder.id, woId))
      .limit(1);
    if (!wo) {
      return jsonError("NOT_FOUND", "Work Order không tồn tại.", 404);
    }

    const rows = await db
      .select({
        scanId: assemblyScan.id,
        snapshotLineId: assemblyScan.snapshotLineId,
        qty: assemblyScan.qty,
        barcode: assemblyScan.barcode,
        lotSerialId: assemblyScan.lotSerialId,
        scannedAt: assemblyScan.scannedAt,
        deviceId: assemblyScan.deviceId,
        scannedBy: assemblyScan.scannedBy,
        userName: userAccount.fullName,
        componentSku: bomSnapshotLine.componentSku,
        componentName: bomSnapshotLine.componentName,
      })
      .from(assemblyScan)
      .leftJoin(userAccount, eq(userAccount.id, assemblyScan.scannedBy))
      .leftJoin(
        bomSnapshotLine,
        eq(bomSnapshotLine.id, assemblyScan.snapshotLineId),
      )
      .where(
        and(
          eq(assemblyScan.woId, woId),
          eq(assemblyScan.scanKind, "CONSUME"),
        ),
      )
      .orderBy(asc(assemblyScan.scannedAt));

    const sessions: SessionSummary[] = [];
    let current: SessionSummary | null = null;

    for (const r of rows) {
      const ts = r.scannedAt instanceof Date ? r.scannedAt : new Date(r.scannedAt);
      const tsMs = ts.getTime();
      const isManual = r.deviceId === "manual-entry";
      const sessionLine: SessionLine = {
        scanId: r.scanId,
        snapshotLineId: r.snapshotLineId,
        componentSku: r.componentSku,
        componentName: r.componentName,
        qty: Number(r.qty),
        barcode: r.barcode,
        lotSerialId: r.lotSerialId,
        scannedAt: ts.toISOString(),
        deviceId: r.deviceId,
        mode: isManual ? "manual" : "barcode",
      };

      if (!current) {
        current = {
          sessionNo: sessions.length + 1,
          startedAt: ts.toISOString(),
          endedAt: ts.toISOString(),
          durationMs: 0,
          userId: r.scannedBy,
          userName: r.userName,
          totalLines: 0,
          totalQty: 0,
          totalScans: 0,
          lines: [],
        };
      } else {
        const lastMs = new Date(current.endedAt).getTime();
        const gap = tsMs - lastMs;
        const userChanged = current.userId !== r.scannedBy;
        if (gap > GAP_MS || userChanged) {
          // close + start new
          sessions.push(finalizeSession(current));
          current = {
            sessionNo: sessions.length + 1,
            startedAt: ts.toISOString(),
            endedAt: ts.toISOString(),
            durationMs: 0,
            userId: r.scannedBy,
            userName: r.userName,
            totalLines: 0,
            totalQty: 0,
            totalScans: 0,
            lines: [],
          };
        }
      }

      current.lines.push(sessionLine);
      current.endedAt = ts.toISOString();
      current.totalQty += sessionLine.qty;
      current.totalScans += 1;
    }

    if (current) sessions.push(finalizeSession(current));

    // Determine "live" session: nếu session cuối cùng có endedAt within last GAP → live.
    const now = Date.now();
    const enriched = sessions.map((s, i) => {
      const isLast = i === sessions.length - 1;
      const sinceEndMs = now - new Date(s.endedAt).getTime();
      return {
        ...s,
        isLive: isLast && sinceEndMs <= GAP_MS,
      };
    });

    return NextResponse.json({
      data: {
        woId: wo.id,
        woNo: wo.woNo,
        sessions: enriched,
        gapMinutes: GAP_MINUTES,
      },
    });
  } catch (err) {
    logger.error({ err }, "wo sessions failed");
    return jsonError("INTERNAL", "Lỗi tải đợt lắp ráp.", 500);
  }
}

function finalizeSession(s: SessionSummary): SessionSummary {
  const start = new Date(s.startedAt).getTime();
  const end = new Date(s.endedAt).getTime();
  const uniqLines = new Set(s.lines.map((l) => l.snapshotLineId).filter(Boolean));
  return {
    ...s,
    durationMs: Math.max(0, end - start),
    totalLines: uniqLines.size,
  };
}
