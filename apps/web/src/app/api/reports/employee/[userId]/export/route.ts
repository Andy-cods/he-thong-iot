import { type NextRequest } from "next/server";
import { z } from "zod";
import ExcelJS from "exceljs";
import { logger } from "@/lib/logger";
import { getEmployeeProductivity } from "@/server/repos/employeeProductivity";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.61 — GET /api/reports/employee/[userId]/export
 *
 * Trả về file Excel báo cáo năng suất nhân viên.
 * Sheet: Summary · Daily · Recent Actions.
 */

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

function defaultMonthRange() {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600_000);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  return {
    from: new Date(Date.UTC(y, m, 1) - 7 * 3600_000),
    to: new Date(Date.UTC(y, m + 1, 1) - 7 * 3600_000),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const guard = await requireCan(req, "read", "report");
  if ("response" in guard) return guard.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.userId)) {
    return jsonError("BAD_REQUEST", "userId không hợp lệ.", 400);
  }
  const q = parseSearchParams(req, querySchema);
  if ("response" in q) return q.response;

  let from: Date;
  let to: Date;
  if (q.data.from && q.data.to) {
    from = new Date(q.data.from);
    to = new Date(q.data.to);
  } else if (q.data.year && q.data.month) {
    from = new Date(Date.UTC(q.data.year, q.data.month - 1, 1) - 7 * 3600_000);
    to = new Date(Date.UTC(q.data.year, q.data.month, 1) - 7 * 3600_000);
  } else {
    const r = defaultMonthRange();
    from = r.from;
    to = r.to;
  }

  try {
    const report = await getEmployeeProductivity({
      userId: params.userId,
      from,
      to,
    });
    if (!report) return jsonError("NOT_FOUND", "Không tìm thấy nhân viên.", 404);

    const wb = new ExcelJS.Workbook();
    wb.creator = "GTAM MES";
    wb.created = new Date();

    // Sheet 1: Summary
    const ws1 = wb.addWorksheet("Tổng quan", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws1.columns = [
      { header: "Hạng mục", key: "label", width: 32 },
      { header: "Giá trị", key: "value", width: 24 },
    ];
    ws1.getRow(1).font = { bold: true };
    ws1.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF6366F1" },
    };
    ws1.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

    ws1.addRow({ label: "Nhân viên", value: report.user.fullName });
    ws1.addRow({ label: "Username", value: report.user.username });
    ws1.addRow({ label: "Email", value: report.user.email ?? "—" });
    ws1.addRow({ label: "Roles", value: report.user.roles.join(", ") });
    ws1.addRow({});
    ws1.addRow({ label: "Khoảng thời gian", value: report.period.label });
    ws1.addRow({ label: "Ngày hoạt động", value: report.period.activeDays });
    ws1.addRow({ label: "Tổng actions", value: report.summary.totalActions });
    if (report.summary.lastSeen)
      ws1.addRow({
        label: "Lần online cuối",
        value: new Date(report.summary.lastSeen).toLocaleString("vi-VN"),
      });
    ws1.addRow({});
    ws1.addRow({ label: "── Metrics chi tiết ──", value: "" }).font = {
      bold: true,
    };
    for (const m of report.metrics) {
      const v = m.value != null && m.value > 0 ? m.value : m.count;
      const display = m.unit ? `${v} ${m.unit}` : String(v);
      ws1.addRow({ label: m.label, value: display });
    }

    // Sheet 2: Daily
    const ws2 = wb.addWorksheet("Hoạt động theo ngày", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws2.columns = [
      { header: "Ngày", key: "date", width: 14 },
      { header: "Số actions", key: "actions", width: 14 },
    ];
    ws2.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws2.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF6366F1" },
    };
    for (const d of report.chartDaily) {
      ws2.addRow({ date: d.date, actions: d.actions });
    }

    // Sheet 3: Recent actions
    const ws3 = wb.addWorksheet("Hoạt động gần nhất", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws3.columns = [
      { header: "Thời điểm", key: "ts", width: 18 },
      { header: "Hành động", key: "action", width: 14 },
      { header: "Loại đối tượng", key: "type", width: 18 },
      { header: "Mã", key: "code", width: 18 },
      { header: "Ghi chú", key: "notes", width: 60 },
    ];
    ws3.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws3.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF6366F1" },
    };
    for (const a of report.recentActions) {
      ws3.addRow({
        ts: a.timestamp,
        action: a.action,
        type: a.objectType ?? "",
        code: a.objectCode ?? "",
        notes: a.notes ?? "",
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    const safeName = report.user.username.replace(/[^a-zA-Z0-9-]/g, "_");
    const periodSlug = report.period.label.replace(/[^0-9]/g, "");
    const filename = `bao-cao-${safeName}-${periodSlug}.xlsx`;

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buf.byteLength),
      },
    });
  } catch (err) {
    logger.error({ err, userId: params.userId }, "export employee report failed");
    return jsonError("INTERNAL", "Không tạo được file Excel.", 500);
  }
}
