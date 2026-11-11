import { NextResponse, type NextRequest } from "next/server";
import { bomLineSupplierChangeSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { changeLineSupplier } from "@/server/services/bomLineSupplier";
import { versionConflictResponse } from "@/server/bomVersion";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BOM V5 / WP2 — đổi NCC 1 dòng BOM trực tiếp từ ô.
 * Quyền: `read bomTemplate` (quyết định user: ai xem được BOM thì sửa được NCC
 * và tạo NCC mới ngay từ ô — NCC mới gắn needs_review=true). KHÔNG đòi
 * `update bomTemplate` / `create supplier`.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; lid: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, bomLineSupplierChangeSchema);
  if ("response" in body) return body.response;
  const d = body.data;

  try {
    const base = {
      templateId: params.id,
      lineId: params.lid,
      actorId: guard.session.userId,
      expectedVersion: d.expectedVersion,
    };
    const result = await changeLineSupplier(
      d.newSupplier
        ? { ...base, newSupplier: d.newSupplier }
        : { ...base, supplierId: d.supplierId ?? null },
    );

    if (!result.ok) {
      if (result.code === "NOT_FOUND")
        return jsonError("NOT_FOUND", "Không tìm thấy linh kiện.", 404);
      if (result.code === "SUPPLIER_NOT_FOUND")
        return jsonError("SUPPLIER_NOT_FOUND", "Không tìm thấy NCC (hoặc NCC đã ngừng).", 422);
      return versionConflictResponse(result.current as unknown as Record<string, unknown>);
    }

    if (result.changed) {
      const meta = extractRequestMeta(req);
      await writeAudit({
        actor: guard.session,
        action: "UPDATE",
        objectType: "bom_line",
        objectId: params.lid,
        before: { supplier: result.before.supplier, pending: result.before.pending },
        after: {
          supplier: result.supplier
            ? { id: result.supplier.id, name: result.supplier.name }
            : null,
        },
        notes: result.createdSupplier
          ? `Tạo NCC mới ${result.supplier?.code} (chờ rà soát)`
          : null,
        ...meta,
      });
    }

    return NextResponse.json({
      data: {
        line: result.line,
        supplier: result.supplier,
        createdSupplier: result.createdSupplier,
        changed: result.changed,
      },
    });
  } catch (err) {
    logger.error({ err, lid: params.lid }, "change bom line supplier failed");
    return jsonError("INTERNAL", "Không đổi được NCC.", 500);
  }
}
