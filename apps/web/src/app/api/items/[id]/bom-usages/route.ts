import { asc, desc, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { bomLine, bomTemplate } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V1.8 Batch 3 — Items ↔ BOM linkage (2 chiều).
 *
 * Trả về danh sách mọi `bom_line` có `component_item_id = itemId`, group theo
 * `bom_template`. Dùng cho tab "Dùng trong BOM" trong `/items/[id]` +
 * deep-link ngược về `/bom/[templateId]/grid?highlightLine=<lineId>`.
 *
 * Read-only. Cần quyền `read` trên `bomTemplate` (plan V1.8 §Batch 3 §3.1).
 * Query dùng Drizzle ORM với self-join alias để kèm `parent.component_item_id`
 * phục vụ hiển thị "thuộc cụm nào".
 */

interface BomUsageLine {
  lineId: string;
  quantityPer: number;
  scrapPct: number;
  metadata: unknown;
  childCount: number;
  parentItemId: string | null;
}

interface BomUsageTemplate {
  templateId: string;
  templateCode: string;
  templateName: string;
  templateStatus: "DRAFT" | "ACTIVE" | "OBSOLETE";
  usages: BomUsageLine[];
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const itemId = params.id;
  if (!itemId || itemId.length < 8) {
    return jsonError("BAD_REQUEST", "itemId không hợp lệ.", 400);
  }

  try {
    // Child-count subquery + parent-item subquery (tránh aliasedTable self-join
    // để giữ type inference ổn định của Drizzle).
    const childCountSql = sql<number>`(
      SELECT COUNT(*)::int
      FROM app.bom_line child
      WHERE child.parent_line_id = ${bomLine.id}
    )`;
    const parentItemIdSql = sql<string | null>`(
      SELECT parent.component_item_id::text
      FROM app.bom_line parent
      WHERE parent.id = ${bomLine.parentLineId}
    )`;

    const rows = await db
      .select({
        templateId: bomTemplate.id,
        templateCode: bomTemplate.code,
        templateName: bomTemplate.name,
        templateStatus: bomTemplate.status,
        lineId: bomLine.id,
        qtyPerParent: bomLine.qtyPerParent,
        scrapPercent: bomLine.scrapPercent,
        metadata: bomLine.metadata,
        parentItemId: parentItemIdSql,
        childCount: childCountSql,
      })
      .from(bomLine)
      .innerJoin(bomTemplate, eq(bomTemplate.id, bomLine.templateId))
      .where(eq(bomLine.componentItemId, itemId))
      .orderBy(desc(bomTemplate.updatedAt), asc(bomLine.createdAt));

    // Group theo template, giữ thứ tự gặp đầu (đã ORDER BY updated_at DESC).
    const byTemplateMap = new Map<string, BomUsageTemplate>();
    for (const r of rows) {
      let entry = byTemplateMap.get(r.templateId);
      if (!entry) {
        entry = {
          templateId: r.templateId,
          templateCode: r.templateCode,
          templateName: r.templateName,
          templateStatus: r.templateStatus,
          usages: [],
        };
        byTemplateMap.set(r.templateId, entry);
      }
      entry.usages.push({
        lineId: r.lineId,
        quantityPer: Number(r.qtyPerParent ?? 0),
        scrapPct: Number(r.scrapPercent ?? 0),
        metadata: r.metadata,
        childCount: Number(r.childCount ?? 0),
        parentItemId: r.parentItemId ?? null,
      });
    }

    const byTemplate = Array.from(byTemplateMap.values());
    const totalUsages = rows.length;

    return NextResponse.json({
      data: {
        itemId,
        totalUsages,
        byTemplate,
      },
    });
  } catch (err) {
    logger.error({ err, itemId }, "items bom-usages failed");
    return jsonError("INTERNAL", "Không tải được danh sách BOM dùng vật tư.", 500);
  }
}
