import type { BomImportDecisionInput, TkPreviewRow } from "@/hooks/useBomImport";

/** Lựa chọn của người dùng cho dòng CONFIRM: "NEW" hoặc itemId. */
export type MatchChoice = Record<string, string>;

export function undecidedPositions(rows: readonly TkPreviewRow[], choice: MatchChoice): string[] {
  return rows
    .filter((r) => r.match.status === "CONFIRM" && !choice[r.position])
    .map((r) => r.position);
}

export function buildDecisions(
  rows: readonly TkPreviewRow[],
  choice: MatchChoice,
): BomImportDecisionInput[] {
  const out: BomImportDecisionInput[] = [];
  for (const r of rows) {
    if (r.match.status !== "CONFIRM") continue;
    const c = choice[r.position];
    if (!c) continue;
    out.push(c === "NEW" ? { position: r.position, action: "NEW" } : { position: r.position, action: "USE_ITEM", itemId: c });
  }
  return out;
}

const REASON_LABEL: Record<string, string> = {
  AMBIGUOUS: "Nhiều vật tư trùng tên",
  MATERIAL_MISMATCH: "Lệch vật liệu",
  DIMS_MISMATCH: "Lệch quy cách",
  DIMS_PERMUTED: "Quy cách đảo chiều",
  DIMS_OK: "Quy cách khớp",
  DIMS_UNKNOWN: "Chưa có quy cách để so",
  MATERIAL_IN_TEXT: "Vật liệu nằm trong tên",
  MATERIAL_UNKNOWN: "Chưa có mã vật liệu",
  NAME: "Trùng tên",
  BLANK_CODE: "Trùng mã phôi",
  NO_SKU_MATCH: "Chưa có trong danh mục",
};

export function reasonText(reasons: string | readonly string[]): string {
  const list = typeof reasons === "string" ? reasons.split(",") : reasons;
  return list
    .filter(Boolean)
    .map((r) => REASON_LABEL[r] ?? r)
    .join(" · ");
}
