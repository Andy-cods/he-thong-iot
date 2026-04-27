import { and, asc, desc, eq, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import {
  bomLine,
  bomSheet,
  bomSheetMaterialRow,
  bomSheetProcessRow,
  bomTemplate,
  item,
  materialMaster,
  processMaster,
} from "@iot/db/schema";
import { db } from "@/lib/db";

export type BomStatus = "DRAFT" | "ACTIVE" | "OBSOLETE";

export interface BomTemplateListQuery {
  q?: string;
  status?: BomStatus[];
  /**
   * V2.0 P2 W6 — TASK-20260427-021. Mặc định FALSE → ẩn BOM OBSOLETE
   * khỏi list (tránh lộn với BOM đang dùng). User truyền explicit
   * `?includeObsolete=true` hoặc `?status=OBSOLETE` để xem.
   */
  includeObsolete?: boolean;
  hasComponents?: boolean;
  sort?: "updatedAt" | "code" | "name";
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface BomTemplateListRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parentItemId: string | null;
  parentItemSku: string | null;
  parentItemName: string | null;
  targetQty: string;
  status: BomStatus;
  componentCount: number;
  updatedAt: Date;
  createdAt: Date;
}

export interface ListTemplatesResult {
  rows: BomTemplateListRow[];
  total: number;
}

const SORT_MAP: Record<string, { col: unknown; dir: "asc" | "desc" }> = {
  updatedAt: { col: bomTemplate.updatedAt, dir: "desc" },
  code: { col: bomTemplate.code, dir: "asc" },
  name: { col: bomTemplate.name, dir: "asc" },
};

export async function listTemplates(
  q: BomTemplateListQuery,
): Promise<ListTemplatesResult> {
  const where: SQL[] = [];

  if (q.status && q.status.length > 0) {
    where.push(
      inArray(
        bomTemplate.status,
        q.status as unknown as (typeof bomTemplate.status.enumValues)[number][],
      ),
    );
  } else if (!q.includeObsolete) {
    // Default: hide OBSOLETE (soft-deleted BOM Lists).
    where.push(ne(bomTemplate.status, "OBSOLETE"));
  }
  if (q.q && q.q.trim().length > 0) {
    const needle = q.q.trim();
    where.push(
      sql`(
        ${bomTemplate.code} ILIKE ('%' || ${needle} || '%')
        OR public.f_unaccent(${bomTemplate.name})
           ILIKE public.f_unaccent('%' || ${needle} || '%')
      )`,
    );
  }
  if (q.hasComponents === true) {
    where.push(
      sql`EXISTS (SELECT 1 FROM ${bomLine} WHERE ${bomLine.templateId} = ${bomTemplate.id})`,
    );
  } else if (q.hasComponents === false) {
    where.push(
      sql`NOT EXISTS (SELECT 1 FROM ${bomLine} WHERE ${bomLine.templateId} = ${bomTemplate.id})`,
    );
  }

  const whereExpr = where.length > 0 ? and(...where) : undefined;
  const sortKey = q.sort ?? "updatedAt";
  const sortCfg = SORT_MAP[sortKey] ?? SORT_MAP.updatedAt!;
  const dir = q.sortDir ?? sortCfg.dir;
  const orderExpr =
    dir === "asc"
      ? asc(sortCfg.col as never)
      : desc(sortCfg.col as never);

  const offset = (q.page - 1) * q.pageSize;

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bomTemplate)
      .where(whereExpr ?? sql`true`),
    db
      .select({
        id: bomTemplate.id,
        code: bomTemplate.code,
        name: bomTemplate.name,
        description: bomTemplate.description,
        parentItemId: bomTemplate.parentItemId,
        parentItemSku: item.sku,
        parentItemName: item.name,
        targetQty: bomTemplate.targetQty,
        status: bomTemplate.status,
        updatedAt: bomTemplate.updatedAt,
        createdAt: bomTemplate.createdAt,
        componentCount: sql<number>`(
          SELECT count(*)::int FROM ${bomLine} l
          WHERE l.template_id = ${bomTemplate.id}
        )`,
      })
      .from(bomTemplate)
      .leftJoin(item, eq(item.id, bomTemplate.parentItemId))
      .where(whereExpr ?? sql`true`)
      .orderBy(orderExpr)
      .limit(q.pageSize)
      .offset(offset),
  ]);

  return {
    rows: rows as BomTemplateListRow[],
    total: totalResult[0]?.count ?? 0,
  };
}

export async function getTemplateById(id: string) {
  const [row] = await db
    .select({
      id: bomTemplate.id,
      code: bomTemplate.code,
      name: bomTemplate.name,
      description: bomTemplate.description,
      parentItemId: bomTemplate.parentItemId,
      parentItemSku: item.sku,
      parentItemName: item.name,
      targetQty: bomTemplate.targetQty,
      status: bomTemplate.status,
      metadata: bomTemplate.metadata,
      createdAt: bomTemplate.createdAt,
      updatedAt: bomTemplate.updatedAt,
      createdBy: bomTemplate.createdBy,
    })
    .from(bomTemplate)
    .leftJoin(item, eq(item.id, bomTemplate.parentItemId))
    .where(eq(bomTemplate.id, id))
    .limit(1);
  return row ?? null;
}

export async function getTemplateByCode(code: string) {
  const [row] = await db
    .select()
    .from(bomTemplate)
    .where(eq(bomTemplate.code, code))
    .limit(1);
  return row ?? null;
}

export async function checkCodeAvailable(
  code: string,
  excludeId?: string,
): Promise<boolean> {
  const conditions: SQL[] = [eq(bomTemplate.code, code)];
  if (excludeId) conditions.push(sql`${bomTemplate.id} <> ${excludeId}`);
  const [row] = await db
    .select({ id: bomTemplate.id })
    .from(bomTemplate)
    .where(and(...conditions))
    .limit(1);
  return !row;
}

export interface BomTemplateCreateInput {
  code: string;
  name: string;
  description?: string | null;
  parentItemId?: string | null;
  targetQty: number;
}

export async function createTemplate(
  input: BomTemplateCreateInput,
  actorId: string | null,
) {
  // V2.0 Sprint 6 — auto-create 2 default sheets + auto-populate full catalog
  // (user feedback 2026-04-27): "tôi muốn nó có đầy đủ sẵn luôn ở tất cả bom
  // list hiện tại chứ không phải giờ mới thêm mới vào từng vật liệu 1".
  //
  // 1. Sheet PROJECT "Sheet 1" — chứa bom_lines (cấu trúc).
  // 2. Sheet MATERIAL "Material & Process" — auto-populate FULL catalog
  //    (~63 material_master + ~19 process_master active rows). User chỉ
  //    cần fill price/qty/status thay vì click + Thêm từng cái.
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(bomTemplate)
      .values({
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        parentItemId: input.parentItemId ?? null,
        targetQty: String(input.targetQty),
        status: "DRAFT",
        createdBy: actorId,
      })
      .returning();
    if (!row) return null;

    const [, materialSheet] = await tx
      .insert(bomSheet)
      .values([
        {
          templateId: row.id,
          name: "Sheet 1",
          kind: "PROJECT",
          position: 1,
          metadata: { defaultSheet: true },
          createdBy: actorId,
        },
        {
          templateId: row.id,
          name: "Material & Process",
          kind: "MATERIAL",
          position: 2,
          metadata: { defaultSheet: true, combined: true },
          createdBy: actorId,
        },
      ])
      .returning();

    // Auto-populate full catalog vào MATERIAL sheet vừa tạo.
    if (materialSheet) {
      const allMaterials = await tx
        .select({
          code: materialMaster.code,
          nameVn: materialMaster.nameVn,
          pricePerKg: materialMaster.pricePerKg,
        })
        .from(materialMaster)
        .where(eq(materialMaster.isActive, true))
        .orderBy(asc(materialMaster.category), asc(materialMaster.code));

      if (allMaterials.length > 0) {
        await tx.insert(bomSheetMaterialRow).values(
          allMaterials.map((m, idx) => ({
            sheetId: materialSheet.id,
            materialCode: m.code,
            nameOverride: m.nameVn,
            pricePerKg: m.pricePerKg,
            status: "PLANNED" as const,
            position: idx + 1,
            blankSize: {} as Record<string, unknown>,
            createdBy: actorId,
          })),
        );
      }

      const allProcesses = await tx
        .select({
          code: processMaster.code,
          nameVn: processMaster.nameVn,
          pricePerUnit: processMaster.pricePerUnit,
          pricingUnit: processMaster.pricingUnit,
        })
        .from(processMaster)
        .where(eq(processMaster.isActive, true))
        .orderBy(asc(processMaster.code));

      if (allProcesses.length > 0) {
        await tx.insert(bomSheetProcessRow).values(
          allProcesses.map((p, idx) => ({
            sheetId: materialSheet.id,
            processCode: p.code,
            nameOverride: p.nameVn,
            pricePerUnit: p.pricePerUnit,
            pricingUnit: p.pricingUnit as string,
            position: idx + 1,
            createdBy: actorId,
          })),
        );
      }
    }

    return row;
  });
}

export interface BomTemplateUpdateInput {
  name?: string;
  description?: string | null;
  parentItemId?: string | null;
  targetQty?: number;
  status?: BomStatus;
}

export async function updateTemplate(id: string, patch: BomTemplateUpdateInput) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.parentItemId !== undefined) values.parentItemId = patch.parentItemId;
  if (patch.targetQty !== undefined) values.targetQty = String(patch.targetQty);
  if (patch.status !== undefined) values.status = patch.status;

  const [row] = await db
    .update(bomTemplate)
    .set(values)
    .where(eq(bomTemplate.id, id))
    .returning();
  return row ?? null;
}

export async function softDeleteTemplate(id: string) {
  const [row] = await db
    .update(bomTemplate)
    .set({ status: "OBSOLETE", updatedAt: new Date() })
    .where(and(eq(bomTemplate.id, id), isNotNull(bomTemplate.id)))
    .returning();
  return row ?? null;
}

/**
 * Load toàn bộ tree của 1 template (depth ≤ 5) dạng flat array + metadata.
 * Dùng recursive CTE server-side để tránh N+1.
 */
export interface BomTreeNode {
  id: string;
  parentLineId: string | null;
  templateId: string;
  componentItemId: string;
  componentSku: string | null;
  componentName: string | null;
  componentUom: string | null;
  componentCategory: string | null;
  componentItemType: string | null;
  level: number;
  position: number;
  /** V2.0 Sprint 6 — chuỗi mã vị trí (R01, S40) từ Excel "ID Number". */
  positionCode: string | null;
  qtyPerParent: string;
  scrapPercent: string;
  uom: string | null;
  description: string | null;
  supplierItemCode: string | null;
  metadata: Record<string, unknown>;
  /**
   * V2.0 — kích thước vật lý jsonb từ `item.dimensions`
   * (`{length, width, height, unit}` mm). Null nếu item chưa map dimensions.
   * TASK-20260427-024 — bù field cho cột "KÍCH THƯỚC" của BomGridPro.
   */
  itemDimensions: Record<string, unknown> | null;
  /**
   * V2.0 — `item.spec_json` (text). Parse `{ dimensionText }` ở client làm
   * fallback cuối khi chưa có `dimensions` jsonb. TASK-20260427-024.
   */
  itemSpecJson: string | null;
  childCount: number;
}

export async function loadTree(
  templateId: string,
  sheetId?: string,
): Promise<BomTreeNode[]> {
  // V2.0 Sprint 6 — filter optional theo sheet_id. Khi user mở tab sheet
  // PROJECT cụ thể, frontend pass activeSheetId → grid chỉ render lines
  // của sheet đó. KHÔNG truyền sheetId = legacy fallback (toàn template).
  const rows = await db.execute(sql`
    WITH RECURSIVE tree AS (
      SELECT l.*, 1::int AS depth
      FROM app.bom_line l
      WHERE l.template_id = ${templateId}
        AND l.parent_line_id IS NULL
        ${sheetId ? sql`AND l.sheet_id = ${sheetId}` : sql``}
      UNION ALL
      SELECT l.*, t.depth + 1
      FROM app.bom_line l
      INNER JOIN tree t ON l.parent_line_id = t.id
      WHERE t.depth < 5
    )
    SELECT
      t.id, t.parent_line_id, t.template_id, t.component_item_id,
      t.level, t.position, t.position_code, t.qty_per_parent, t.scrap_percent,
      t.uom, t.description, t.supplier_item_code, t.metadata,
      i.sku AS component_sku, i.name AS component_name, i.uom AS component_uom,
      i.category AS component_category, i.item_type AS component_item_type,
      i.dimensions AS item_dimensions, i.spec_json AS item_spec_json,
      (SELECT count(*)::int FROM app.bom_line c WHERE c.parent_line_id = t.id) AS child_count
    FROM tree t
    LEFT JOIN app.item i ON i.id = t.component_item_id
    ORDER BY t.level, t.position
  `);

  // postgres-js trả rows array
  const list = (rows as unknown as Array<Record<string, unknown>>) ?? [];
  return list.map((r) => ({
    id: r.id as string,
    parentLineId: (r.parent_line_id as string | null) ?? null,
    templateId: r.template_id as string,
    componentItemId: r.component_item_id as string,
    componentSku: (r.component_sku as string | null) ?? null,
    componentName: (r.component_name as string | null) ?? null,
    componentUom: (r.component_uom as string | null) ?? null,
    componentCategory: (r.component_category as string | null) ?? null,
    componentItemType: (r.component_item_type as string | null) ?? null,
    level: Number(r.level),
    position: Number(r.position),
    positionCode: (r.position_code as string | null) ?? null,
    qtyPerParent: String(r.qty_per_parent),
    scrapPercent: String(r.scrap_percent),
    uom: (r.uom as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    supplierItemCode: (r.supplier_item_code as string | null) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    itemDimensions:
      (r.item_dimensions as Record<string, unknown> | null) ?? null,
    itemSpecJson: (r.item_spec_json as string | null) ?? null,
    childCount: Number(r.child_count ?? 0),
  }));
}

/**
 * V1.7-beta.2.3 — getGridSnapshot / saveGridSnapshot (Univer metadata.univerSnapshot)
 * đã bị loại bỏ cùng Univer retirement. BOM grid hiện chỉ serialize qua
 * `bom_line` table (không còn JSON snapshot layer).
 */

/** Clone 1 template + toàn bộ lines với UUID map parent chain. */
export async function cloneTemplate(
  sourceId: string,
  newCode: string,
  newName: string | null,
  actorId: string | null,
): Promise<{ template: typeof bomTemplate.$inferSelect; lineCount: number } | null> {
  return await db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(bomTemplate)
      .where(eq(bomTemplate.id, sourceId))
      .limit(1);
    if (!source) return null;

    const [cloned] = await tx
      .insert(bomTemplate)
      .values({
        code: newCode,
        name: newName ?? source.name,
        description: source.description,
        parentItemId: source.parentItemId,
        targetQty: source.targetQty,
        status: "DRAFT",
        metadata: source.metadata,
        createdBy: actorId,
      })
      .returning();

    if (!cloned) throw new Error("Không clone được template");

    // Load toàn bộ lines nguồn ORDER BY level
    const sourceLines = await tx
      .select()
      .from(bomLine)
      .where(eq(bomLine.templateId, sourceId))
      .orderBy(asc(bomLine.level), asc(bomLine.position));

    // Map oldLineId → newLineId (insert cha trước con)
    const idMap = new Map<string, string>();
    for (const line of sourceLines) {
      const newParentLineId = line.parentLineId
        ? idMap.get(line.parentLineId) ?? null
        : null;
      const [inserted] = await tx
        .insert(bomLine)
        .values({
          templateId: cloned.id,
          parentLineId: newParentLineId,
          componentItemId: line.componentItemId,
          level: line.level,
          position: line.position,
          qtyPerParent: line.qtyPerParent,
          scrapPercent: line.scrapPercent,
          uom: line.uom,
          description: line.description,
          supplierItemCode: line.supplierItemCode,
          metadata: line.metadata,
        })
        .returning({ id: bomLine.id });
      if (inserted) idMap.set(line.id, inserted.id);
    }

    return { template: cloned, lineCount: sourceLines.length };
  });
}
