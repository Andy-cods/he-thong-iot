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
  ],
  supplierItemCode: [
    "ncc",
    "suppliercode",
    "supplieritemcode",
    "manhacungcap",
    "mancc",
    "maccncc",
    "vendorcode",
  ],
  qtyPerParent: [
    "quantity",
    "qty",
    "soluong",
    "sl",
    "amount",
    "qtyperparent",
    "qtyparent",
  ],
  description: [
    "subcategory",
    "description",
    "mota",
    "ghichu",
    "phanloaiphu",
    "chungloai",
  ],
  size: [
    "size",
    "visiblepartsize",
    "partsize",
    "kichthuoc",
    "quycach",
    "specs",
    "spec",
  ],
  notes: [
    "note",
    "notes",
    "chuthich",
    "diengchai",
    "remark",
    "remarks",
  ],
};

const BOM_TARGETS: TargetField[] = [
  { key: "componentSku", label: "Mã linh kiện", required: true, type: "string" },
  { key: "qtyPerParent", label: "Số lượng / cha", required: true, type: "number" },
  { key: "componentSeq", label: "Số thứ tự", required: false, type: "number" },
  {
    key: "supplierItemCode",
    label: "Mã NCC",
    required: false,
    type: "string",
  },
  { key: "description", label: "Mô tả", required: false, type: "string" },
  { key: "size", label: "Kích thước", required: false, type: "string" },
  { key: "notes", label: "Ghi chú", required: false, type: "string" },
];

function bomAutoMap(sourceHeaders: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const claimed = new Set<string>();

  for (const h of sourceHeaders) {
    const norm = normalizeHeader(h);
    if (!norm) {
      mapping[h] = null;
      continue;
    }
    let match: string | null = null;
    for (const t of BOM_TARGETS) {
      const cands = BOM_SYNONYMS[t.key] ?? [];
      if (cands.includes(norm) || normalizeHeader(t.label) === norm) {
        match = t.key;
        break;
      }
    }
    if (match && !claimed.has(match)) {
      mapping[h] = match;
      claimed.add(match);
    } else {
      mapping[h] = null;
    }
  }
  return mapping;
}

export interface BomColumnMapperStepProps {
  sheetName: string;
  sourceHeaders: string[];
  sampleRows?: unknown[][];
  initialMapping?: Record<string, string | null>;
  onChange: (mapping: Record<string, string | null>) => void;
}

function rowKey(index: number, header: string): string {
  return `${index}#${header}`;
}

export function BomColumnMapperStep({
  sheetName,
  sourceHeaders,
  sampleRows = [],
  initialMapping,
  onChange,
}: BomColumnMapperStepProps) {
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
