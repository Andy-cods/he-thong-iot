import { sql } from "drizzle-orm";
import { countBomLineRefs } from "@iot/db/bom-refs";
import {
  bomRefLabel,
  nextFreeBomCode,
  nonZeroRefs,
  replaceBlockedMessage,
  type BomRefCount,
} from "@iot/shared";
import { db } from "@/lib/db";

/**
 * Bước xem trước nhập BOM: mã BOM sinh từ file (mã dự án / tên sheet) đã có
 * trong hệ thống chưa? Có → trả thông tin để UI hỏi "Thay bằng bản mới / Tạo
 * BOM mới với mã khác / Huỷ" (KHÔNG âm thầm bỏ qua nữa).
 */
export interface BomCodeConflict {
  code: string;
  sheetName: string | null;
  templateId: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "OBSOLETE";
  lineCount: number;
  /** Tham chiếu chặn ghi đè (đã lọc count > 0) + nhãn tiếng Việt. */
  blockers: Array<BomRefCount & { label: string }>;
  /** Câu giải thích khi không ghi đè được (null = ghi đè được). */
  replaceBlockedReason: string | null;
  /** Gợi ý mã trống cho "Tạo BOM mới với mã khác". */
  suggestedNewCode: string;
}

export async function inspectBomCodeConflicts(
  targets: Array<{ code: string; sheetName?: string | null }>,
): Promise<BomCodeConflict[]> {
  const out: BomCodeConflict[] = [];
  for (const t of targets) {
    const rows = (await db.execute(sql`
      SELECT t.id, t.code, t.name, t.status::text AS status,
             (SELECT count(*)::int FROM app.bom_line l WHERE l.template_id = t.id) AS line_count
      FROM app.bom_template t
      WHERE t.code = ${t.code}
      LIMIT 1
    `)) as unknown as Array<{ id: string; code: string; name: string; status: BomCodeConflict["status"]; line_count: number }>;
    const hit = rows[0];
    if (!hit) continue;

    const refs = (await countBomLineRefs(db, hit.id)) as BomRefCount[];
    const root = t.code.toUpperCase().replace(/-V\d+$/, "");
    const like = root.replace(/[\\%_]/g, "\\$&") + "%";
    const taken = (await db.execute(
      sql`SELECT code FROM app.bom_template WHERE UPPER(code) LIKE ${like}`,
    )) as unknown as Array<{ code: string }>;

    out.push({
      code: hit.code,
      sheetName: t.sheetName ?? null,
      templateId: hit.id,
      name: hit.name,
      status: hit.status,
      lineCount: Number(hit.line_count) || 0,
      blockers: nonZeroRefs(refs).map((r) => ({ ...r, label: bomRefLabel(r) })),
      replaceBlockedReason: replaceBlockedMessage(hit.code, refs),
      suggestedNewCode: nextFreeBomCode(root, taken.map((r) => r.code)),
    });
  }
  return out;
}
