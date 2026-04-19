/**
 * GET /api/admin/audit/export — xuất audit log sang Excel (.xlsx).
 *
 * Dùng cùng filter params như list endpoint (q, entity, action, from, to…).
 * Trả về workbook với các cột: timestamp / user / action / entity / entity_id
 * / diff_summary / notes.
 *
 * Giới hạn MAX_EXPORT_ROWS = 50k. Nếu query vượt → cắt và gắn dòng header
 * cảnh báo. V1.4 KHÔNG pagination (export all match); V1.5 sẽ streaming đầy đủ.
 */

import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { auditListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { listAudit } from "@/server/repos/auditEvents";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EXPORT_ROWS = 50_000;

function fmtTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function diffSummary(
  before: unknown,
  after: unknown,
): string {
  if (!before && !after) return "";
  if (!before && after) return "CREATE (new record)";
  if (before && !after) return "DELETE (record removed)";
  const b = (before as Record<string, unknown>) ?? {};
  const a = (after as Record<string, unknown>) ?? {};
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
      changed.push(k);
    }
  }
  return changed.length > 0 ? `${changed.length} field: ${changed.join(", ")}` : "";
}

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "audit");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(
    req,
    auditListQuerySchema as unknown as Parameters<typeof parseSearchParams>[1],
  );
  if ("response" in q) return q.response;
  const data = q.data as ReturnType<typeof auditListQuerySchema.parse>;

  try {
    // Gọi listAudit với pageSize cao (tối đa 50k)
    const result = await listAudit({
      q: data.q,
      entity: data.entity,
      action: data.action,
      actorUsername: data.actorUsername,
      userId: data.userId,
      from: data.from,
      to: data.to,
      page: 1,
      pageSize: MAX_EXPORT_ROWS,
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "IoT MES";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Audit");
    sheet.columns = [
      { header: "Thời gian", key: "occurredAt", width: 22 },
      { header: "User", key: "actor", width: 22 },
      { header: "Action", key: "action", width: 12 },
      { header: "Entity", key: "entity", width: 20 },
      { header: "Entity ID", key: "entityId", width: 38 },
      { header: "Diff summary", key: "diff", width: 50 },
      { header: "Notes", key: "notes", width: 40 },
      { header: "IP", key: "ip", width: 18 },
    ];

    // Header row bold + background
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF4F4F5" },
    };
    sheet.getRow(1).alignment = { vertical: "middle" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const row of result.rows) {
      sheet.addRow({
        occurredAt: fmtTime(row.occurredAt),
        actor: row.actorUsername
          ? row.actorDisplayName
            ? `${row.actorUsername} (${row.actorDisplayName})`
            : row.actorUsername
          : "system",
        action: row.action,
        entity: row.objectType,
        entityId: row.objectId ?? "",
        diff: diffSummary(row.beforeJson, row.afterJson),
        notes: row.notes ?? "",
        ip: row.ipAddress ?? "",
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `audit-${Date.now()}.xlsx`;

    const truncated = result.total > MAX_EXPORT_ROWS;

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Export-Count": String(result.rows.length),
        "X-Export-Total": String(result.total),
        ...(truncated
          ? { "X-Export-Truncated": `${MAX_EXPORT_ROWS}` }
          : {}),
      },
    });
  } catch (err) {
    logger.error({ err }, "export audit failed");
    return jsonError("INTERNAL", "Lỗi xuất Excel audit.", 500);
  }
}
