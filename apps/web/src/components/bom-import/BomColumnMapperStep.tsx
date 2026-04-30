"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, Sparkles } from "lucide-react";
import { BOM_IMPORT_TARGET_FIELDS } from "@iot/shared";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeHeader, type TargetField } from "@/lib/import-mapping";
import { cn } from "@/lib/utils";

/**
 * BOM ColumnMapper — pattern ColumnMapperStep nhưng synonym dict riêng cho BOM.
 *
 * Synonym: Standard Number → componentSku, ID Number → componentSeq,
 *   NCC → supplierItemCode, Quantity → qtyPerParent, Sub Category → description,
 *   Visible Part Size → metadata.size (field "size"),
 *   note/Note → notes.
 */

const BOM_SYNONYMS: Record<string, string[]> = {
  componentSku: [
    "componentsku",
    "sku",
    "mavattu",
    "standardnumber",
    "stdnumber",
    "standardno",
    "mahang",
    "mahh",
    "code",
    "partnumber",
    "partno",
    "pn",
    // V3.7.22 — file BOM FINAL
    "bomgoc",
    "bomgoclinhkien",
    "malinhkien",
    "macuabomgoc",
  ],
  componentSeq: [
    "idnumber",
    "id",
    "stt",
    "sothutu",
    "sequence",
    "seq",
    "orderno",
    "no",
    // V3.7.22
    "vitri",
    "rcode",
  ],
  supplierItemCode: [
    "ncc",
    "suppliercode",
    "supplieritemcode",
    "manhacungcap",
    "mancc",
    "maccncc",
    "vendorcode",
    "vendor",
    "supplier",
    "nhacungcap",
  ],
  qtyPerParent: [
    "quantity",
    "qty",
    "amount",
    "qtyperparent",
    "qtyparent",
    // V3.7.22 — Excel "Quantity (hệ số)" → normalize "quantityheso"
    "quantityheso",
    "soluongheso",
    "qtyheso",
    "heso",
    "soluongbo",
    "perset",
    "permachine",
    "permay",
  ],
  description: [
    "subcategory",
    "description",
    "mota",
    "ghichu",
    "phanloaiphu",
    "chungloai",
    "ghichumota",
    "motavatlieu",
  ],
  size: [
    "size",
    "visiblepartsize",
    "partsize",
    "kichthuoc",
    "quycach",
    "specs",
    "spec",
    // V3.7.22 — "Quy cách (tham khảo)" → "quycachthamkhao"
    "quycachthamkhao",
    "kichthuocthamkhao",
    "dimension",
    "dimensions",
    "lwh",
  ],
  notes: [
    "note",
    "notes",
    "chuthich",
    "diengchai",
    "remark",
    "remarks",
    "ghichukhac",
  ],
  // V3.7.18 — PIC (Person In Charge) cho row-level access control
  assignedToName: [
    "pic",
    "personincharge",
    "responsible",
    "nguoiphutrach",
    "phutrach",
    "owner",
    "assignee",
    "incharge",
  ],
  // V3.7.18 — Category (loại linh kiện): Thương mại / Đặt gia công ngoài / GTAM
  category: [
    "category",
    "loai",
    "loailinhkien",
    "phanloai",
    "categoryno",
    "macategory",
    "loaivattu",
    "danhmuc",
  ],
  // V3.7.18 — Total quantity (SL = qty × hệ số nhân cho N bộ máy)
  totalQty: [
    "totalqty",
    "totalquantity",
    "soluongtotal",
    "soluongtongtone",
    "tongsoluong",
    "soluong",
    "sl",
    "tongsl",
  ],
};

const BOM_TARGETS: TargetField[] = [
  { key: "componentSku", label: "Mã linh kiện (BOM gốc)", required: true, type: "string" },
  { key: "qtyPerParent", label: "Số lượng / cha (Quantity hệ số)", required: true, type: "number" },
  { key: "componentSeq", label: "ID Number (vị trí)", required: false, type: "number" },
  {
    key: "supplierItemCode",
    label: "NCC",
    required: false,
    type: "string",
  },
  { key: "category", label: "Category (loại)", required: false, type: "string" },
  { key: "description", label: "Ghi chú (mô tả vật liệu)", required: false, type: "string" },
  { key: "size", label: "Quy cách (kích thước)", required: false, type: "string" },
  { key: "totalQty", label: "SL (tổng)", required: false, type: "number" },
  { key: "assignedToName", label: "PIC (người phụ trách)", required: false, type: "string" },
  { key: "notes", label: "Ghi chú khác", required: false, type: "string" },
];

/**
 * V3.7.22 — Improved auto-map với scoring.
 *
 * Score per (header, target):
 *   100 — exact equal normalized header với synonym
 *    80 — header BẮT ĐẦU bằng synonym (vd "quycachthamkhao" starts with "quycach")
 *    60 — synonym là substring trong header
 *    40 — header là substring trong synonym (header ngắn hơn)
 *
 * Pick best match per header. Mỗi target chỉ được claim 1 lần (header có
 * score cao hơn thắng).
 */
function bomAutoMap(sourceHeaders: string[]): Record<string, string | null> {
  type Candidate = { header: string; targetKey: string; score: number };
  const allCandidates: Candidate[] = [];

  for (const h of sourceHeaders) {
    const norm = normalizeHeader(h);
    if (!norm) continue;
    for (const t of BOM_TARGETS) {
      const synonyms = [
        ...(BOM_SYNONYMS[t.key] ?? []),
        normalizeHeader(t.label),
        normalizeHeader(t.key),
      ].filter(Boolean);
      let bestForTarget = 0;
      for (const syn of synonyms) {
        if (!syn) continue;
        let score = 0;
        if (norm === syn) score = 100;
        else if (norm.startsWith(syn) && syn.length >= 3) score = 80;
        else if (norm.includes(syn) && syn.length >= 4) score = 60;
        else if (syn.includes(norm) && norm.length >= 4) score = 40;
        if (score > bestForTarget) bestForTarget = score;
      }
      if (bestForTarget > 0) {
        allCandidates.push({ header: h, targetKey: t.key, score: bestForTarget });
      }
    }
  }

  // Sort by score desc, claim greedily
  allCandidates.sort((a, b) => b.score - a.score);
  const mapping: Record<string, string | null> = {};
  for (const h of sourceHeaders) mapping[h] = null;
  const claimedTargets = new Set<string>();
  const claimedHeaders = new Set<string>();
  for (const c of allCandidates) {
    if (claimedTargets.has(c.targetKey)) continue;
    if (claimedHeaders.has(c.header)) continue;
    mapping[c.header] = c.targetKey;
    claimedTargets.add(c.targetKey);
    claimedHeaders.add(c.header);
  }
  return mapping;
}

export interface BomColumnMapperStepProps {
  sheetName: string;
  sourceHeaders: string[];
  sampleRows?: unknown[][];
  initialMapping?: Record<string, string | null>;
  onChange: (mapping: Record<string, string | null>) => void;
  /** Row index Excel (1-based) đã auto-detect làm header — hiển thị cho user. */
  headerRow?: number;
  /** Cảnh báo từ parser nếu auto-detect không chắc chắn. */
  headerWarning?: string | null;
  /** Title row 1 (nếu header > row 1) — hiển thị gợi ý BOM code. */
  topTitle?: string | null;
}

function rowKey(index: number, header: string): string {
  return `${index}#${header}`;
}

export function BomColumnMapperStep({
  sheetName,
  sourceHeaders: rawSourceHeaders,
  sampleRows: rawSampleRows = [],
  initialMapping,
  onChange,
  headerRow,
  headerWarning,
  topTitle,
}: BomColumnMapperStepProps) {
  // V3.7.23 — Guard defensive: nếu prop trả undefined (server malformed),
  // default array thay vì crash khi access .length / .map.
  const sourceHeaders = React.useMemo(
    () => (Array.isArray(rawSourceHeaders) ? rawSourceHeaders : []),
    [rawSourceHeaders],
  );
  const sampleRows = React.useMemo(
    () => (Array.isArray(rawSampleRows) ? rawSampleRows : []),
    [rawSampleRows],
  );

  const headerCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of sourceHeaders) counts[h] = (counts[h] ?? 0) + 1;
    return counts;
  }, [sourceHeaders]);

  const [mapping, setMapping] = React.useState<Record<string, string | null>>(
    () => {
      if (initialMapping && Object.keys(initialMapping).length > 0) {
        const out: Record<string, string | null> = {};
        sourceHeaders.forEach((h, i) => {
          out[rowKey(i, h)] = initialMapping[h] ?? null;
        });
        return out;
      }
      const auto = bomAutoMap(sourceHeaders);
      const out: Record<string, string | null> = {};
      sourceHeaders.forEach((h, i) => {
        out[rowKey(i, h)] = auto[h] ?? null;
      });
      return out;
    },
  );

  React.useEffect(() => {
    const external: Record<string, string | null> = {};
    sourceHeaders.forEach((h, i) => {
      external[h] = mapping[rowKey(i, h)] ?? null;
    });
    onChange(external);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping]);

  const handleResetAuto = () => {
    const auto = bomAutoMap(sourceHeaders);
    const out: Record<string, string | null> = {};
    sourceHeaders.forEach((h, i) => {
      out[rowKey(i, h)] = auto[h] ?? null;
    });
    setMapping(out);
  };

  const setRowMapping = (index: number, header: string, target: string | null) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (target) {
        for (const [k, v] of Object.entries(next)) {
          if (v === target && k !== rowKey(index, header)) {
            next[k] = null;
          }
        }
      }
      next[rowKey(index, header)] = target;
      return next;
    });
  };

  const mappedTargets = new Set(
    Object.values(mapping).filter((v): v is string => v !== null),
  );
  const requiredFields = BOM_TARGETS.filter((t) => t.required);
  const missingRequired = requiredFields.filter(
    (t) => !mappedTargets.has(t.key),
  );
  const totalMapped = Object.values(mapping).filter((v) => v !== null).length;

  return (
    <div className="space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold text-zinc-900">
            Khớp cột sheet{" "}
            <span className="font-mono text-zinc-700">{sheetName}</span>
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Cần map tối thiểu <code className="font-mono">componentSku</code> +{" "}
            <code className="font-mono">qtyPerParent</code>.
            {headerRow ? (
              <>
                {" · "}
                Header đọc từ <strong>row {headerRow}</strong>
                {topTitle ? (
                  <>
                    {" · "}
                    Title row 1:{" "}
                    <span className="font-mono text-zinc-700">{topTitle}</span>
                  </>
                ) : null}
              </>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleResetAuto}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Đề xuất lại
        </Button>
      </header>

      {headerWarning ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{headerWarning}</span>
        </div>
      ) : null}

      {missingRequired.length > 0 ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Còn <strong>{missingRequired.length}</strong> trường bắt buộc chưa
            map:{" "}
            {missingRequired.map((t, i) => (
              <React.Fragment key={t.key}>
                <code className="rounded bg-white/60 px-1 font-mono text-xs">
                  {t.label}
                </code>
                {i < missingRequired.length - 1 ? ", " : ""}
              </React.Fragment>
            ))}
          </span>
        </div>
      ) : (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Tất cả trường bắt buộc đã được map.
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <table className="min-w-full text-base">
          <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="h-8 w-12 px-3">#</th>
              <th className="h-8 px-3">Cột Excel</th>
              <th className="h-8 w-56 px-3">Trường BOM</th>
              <th className="h-8 px-3">Mẫu dữ liệu</th>
            </tr>
          </thead>
          <tbody>
            {sourceHeaders.map((header, index) => {
              const key = rowKey(index, header);
              const current = mapping[key] ?? null;
              const isDuplicate = (headerCounts[header] ?? 0) > 1;
              const samples = sampleRows
                .slice(0, 3)
                .map((row) => row[index] ?? "")
                .filter(Boolean);
              return (
                <tr
                  key={key}
                  className="h-10 border-t border-zinc-100 align-top"
                >
                  <td className="px-3 py-2 text-xs text-zinc-500 tabular-nums">
                    {index + 1}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-zinc-900">
                      {header || (
                        <span className="italic text-zinc-400">
                          (không tên)
                        </span>
                      )}
                    </span>
                    {isDuplicate && (
                      <span className="ml-2 inline-flex items-center rounded-sm bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                        Trùng
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={current ?? "__skip__"}
                      onValueChange={(v) =>
                        setRowMapping(
                          index,
                          header,
                          v === "__skip__" ? null : v,
                        )
                      }
                    >
                      <SelectTrigger id={`map-${key}`} size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">
                          <span className="italic text-zinc-500">— Bỏ qua —</span>
                        </SelectItem>
                        {BOM_TARGETS.map((t) => {
                          const claimedElsewhere =
                            mappedTargets.has(t.key) && current !== t.key;
                          return (
                            <SelectItem
                              key={t.key}
                              value={t.key}
                              disabled={claimedElsewhere}
                            >
                              <span
                                className={cn(
                                  t.required
                                    ? "font-semibold text-zinc-900"
                                    : "text-zinc-700",
                                )}
                              >
                                {t.label}
                                {t.required && (
                                  <span className="ml-1 text-red-500">*</span>
                                )}
                                {claimedElsewhere && (
                                  <span className="ml-2 text-xs text-zinc-400">
                                    (đã dùng)
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                    <div className="max-w-xs truncate">
                      {samples.length > 0
                        ? samples.map(String).join(", ")
                        : "—"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 text-xs text-zinc-600">
        <Info className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
        Đã map <strong className="text-zinc-900">{totalMapped}</strong> /{" "}
        {sourceHeaders.length} cột.
      </div>
    </div>
  );
}

// Sanity: ensure BOM_IMPORT_TARGET_FIELDS trùng keys.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _checkTargets: readonly string[] = BOM_IMPORT_TARGET_FIELDS;
