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
import { formatDateTime } from "@/lib/format";
import { actionLabel, entityLabel } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EXPORT_ROWS = 50_000;

// V4.1 UI-15: giờ Việt Nam cố định — server Node chạy UTC nên toLocaleString lệch 7 tiếng.
function fmtTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return String(d);
  return formatDateTime(dt, { seconds: true });
}

function diffSummary(
  before: unknown,
  after: unknown,
): string {
  if (!before && !after) return "";
  if (!before && after) return "Bản ghi mới";
  if (before && !after) return "Bản ghi bị xoá";
  const b = (before as Record<string, unknown>) ?? {};
  const a = (after as Record<string, unknown>) ?? {};
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
      changed.push(k);
    }
  }
  return changed.length > 0 ? `${changed.length} trường: ${changed.join(", ")}` : "";
}

export async function GET(req: NextRequest) {
  // V4.1 AD-02: xuất Excel toàn bộ nhật ký — `read:audit` nay chỉ admin (matrix).
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
      objectId: data.objectId,
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
      // V4.1 UI-27: tiêu đề cột tiếng Việt (key giữ nguyên).
      { header: "Thời gian", key: "occurredAt", width: 22 },
      { header: "Người dùng", key: "actor", width: 22 },
      { header: "Hành động", key: "action", width: 16 },
      { header: "Đối tượng", key: "entity", width: 22 },
      { header: "Mã đối tượng", key: "entityId", width: 38 },
      { header: "Tóm tắt thay đổi", key: "diff", width: 50 },
      { header: "Ghi chú", key: "notes", width: 40 },
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
          : "hệ thống",
        action: actionLabel(row.action),
        entity: entityLabel(row.objectType),
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
