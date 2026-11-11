/**
 * V5 WP4a — khớp dòng BOM mẫu TRIỂN KHAI với danh mục item. Hàm thuần, không I/O.
 */
import { normMaterial, normName, type BomCategory, type Dims } from "@iot/shared";

export interface MatchRowInput {
  position: string | number;
  file3dName: string;
  category: BomCategory;
  materialCode?: string | null;
  dims?: Dims | null;
  blankSpec?: string | null;
}

export interface MatchItemInput {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  materialCode?: string | null;
  dimensions?: Dims | null;
}

export type MatchStatus = "MATCH" | "CONFIRM" | "NEW";

export interface MatchCandidate {
  itemId: string;
  sku: string;
  reason: string;
}

export interface MatchWarning {
  code: "SUBSTITUTE";
  text: string;
  itemId: string;
}

export interface MatchResult {
  position: string | number;
  status: MatchStatus;
  itemId?: string;
  candidates: MatchCandidate[];
  matchedBy: "NAME" | "BLANK_CODE" | null;
  reasons: string[];
  warnings: MatchWarning[];
}

export type ItemIndex = Map<string, MatchItemInput[]>;

const DIM_TOL = 0.5;

/** Map upper(sku) -> item[] (nạp 1 lần). */
export function buildItemIndex(items: readonly MatchItemInput[]): ItemIndex {
  const m: ItemIndex = new Map();
  for (const it of items) {
    const k = it.sku.trim().toUpperCase();
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/** blankSpec: bỏ xuống dòng, trim, upper. */
function normBlank(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[\r\n]+/g, "").trim().toUpperCase();
}

function dimsClose(a: Dims, b: Dims): boolean {
  return (
    Math.abs(a.l - b.l) <= DIM_TOL &&
    Math.abs(a.w - b.w) <= DIM_TOL &&
    Math.abs(a.h - b.h) <= DIM_TOL
  );
}

function dimsPermuted(a: Dims, b: Dims): boolean {
  const x = [a.l, a.w, a.h].sort((p, q) => p - q);
  const y = [b.l, b.w, b.h].sort((p, q) => p - q);
  return x.every((v, i) => Math.abs(v - y[i]!) <= DIM_TOL);
}

function substituteWarning(item: MatchItemInput): MatchWarning | null {
  const text = `${item.name ?? ""}\n${item.description ?? ""}`.normalize("NFC");
  const m = /đ[ổo]i\s+sang\s+([^\n]*)/iu.exec(text) ?? /doi\s+sang\s+([^\n]*)/i.exec(text);
  if (!m) return null;
  return { code: "SUBSTITUTE", text: m[1]!.trim(), itemId: item.id };
}

interface Check {
  ok: boolean;
  reasons: string[];
}

function checkProcessed(row: MatchRowInput, item: MatchItemInput): Check {
  const reasons: string[] = [];
  let ok = true;

  const rowMat = normMaterial(row.materialCode);
  if (rowMat) {
    const itemMat = normMaterial(item.materialCode);
    if (itemMat) {
      if (itemMat !== rowMat) {
        ok = false;
        reasons.push("MATERIAL_MISMATCH");
      }
    } else {
      const text = normMaterial(`${item.name ?? ""} ${item.description ?? ""}`);
      if (text.includes(rowMat)) reasons.push("MATERIAL_IN_TEXT");
      else {
        ok = false;
        reasons.push("MATERIAL_MISMATCH");
      }
    }
  } else reasons.push("MATERIAL_UNKNOWN");

  if (row.dims && item.dimensions) {
    if (dimsClose(row.dims, item.dimensions)) reasons.push("DIMS_OK");
    else if (dimsPermuted(row.dims, item.dimensions)) reasons.push("DIMS_PERMUTED");
    else {
      ok = false;
      reasons.push("DIMS_MISMATCH");
    }
  } else reasons.push("DIMS_UNKNOWN");

  return { ok, reasons };
}

export function matchBomRow(row: MatchRowInput, index: ItemIndex): MatchResult {
  const nameKey = normName(row.file3dName);
  const blankKey = normBlank(row.blankSpec);
  const byName = nameKey ? (index.get(nameKey) ?? []) : [];
  const processed = row.category === "GTAM" || row.category === "OUTSOURCED";

  const res: MatchResult = {
    position: row.position,
    status: "NEW",
    candidates: [],
    matchedBy: null,
    reasons: [],
    warnings: [],
  };

  const addWarnings = (items: MatchItemInput[]) => {
    for (const it of items) {
      const w = substituteWarning(it);
      if (w) res.warnings.push(w);
    }
  };

  if (processed) {
    if (byName.length === 0) {
      res.reasons.push("NO_SKU_MATCH");
      return res;
    }
    const checks = byName.map((it) => ({ it, c: checkProcessed(row, it) }));
    addWarnings(byName);
    res.candidates = checks.map(({ it, c }) => ({
      itemId: it.id,
      sku: it.sku,
      reason: c.reasons.join(","),
    }));
    res.matchedBy = "NAME";
    const good = checks.filter((x) => x.c.ok);
    if (checks.length === 1 && good.length === 1) {
      res.status = "MATCH";
      res.itemId = good[0]!.it.id;
      res.reasons = good[0]!.c.reasons;
    } else {
      res.status = "CONFIRM";
      res.reasons =
        good.length === 0
          ? [...new Set(checks.flatMap((x) => x.c.reasons))]
          : ["AMBIGUOUS"];
    }
    return res;
  }

  // COMMERCIAL / OTHER
  const byBlank = blankKey ? (index.get(blankKey) ?? []) : [];
  const all = new Map<string, MatchItemInput>();
  for (const it of byName) all.set(it.id, it);
  for (const it of byBlank) all.set(it.id, it);
  if (all.size === 0) {
    res.reasons.push("NO_SKU_MATCH");
    return res;
  }
  const items = [...all.values()];
  addWarnings(items);
  res.candidates = items.map((it) => ({
    itemId: it.id,
    sku: it.sku,
    reason: byName.some((x) => x.id === it.id) ? "NAME" : "BLANK_CODE",
  }));
  res.matchedBy = byName.length > 0 ? "NAME" : "BLANK_CODE";
  if (items.length === 1) {
    res.status = "MATCH";
    res.itemId = items[0]!.id;
    res.reasons = [res.matchedBy];
  } else {
    res.status = "CONFIRM";
    res.reasons = ["AMBIGUOUS"];
  }
  return res;
}

export function matchBomRows(
  rows: readonly MatchRowInput[],
  items: readonly MatchItemInput[] | ItemIndex,
): MatchResult[] {
  const index = items instanceof Map ? items : buildItemIndex(items);
  return rows.map((r) => matchBomRow(r, index));
}
