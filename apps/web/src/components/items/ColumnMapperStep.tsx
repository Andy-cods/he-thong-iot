"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applyPreset,
  autoMapHeaders,
  loadMappingPreset,
  saveMappingPreset,
  type TargetField,
} from "@/lib/import-mapping";
import { cn } from "@/lib/utils";

/**
 * Step 2 — ColumnMapper step trong Import Wizard v2.
 *
 * Direction B design-spec §3.16 + brainstorm-deep §2.4.
 *
 * Props theo spec mở rộng:
 * - `sourceHeaders`: header thô từ Excel (có thể trùng — dùng index để phân biệt).
 * - `sampleRows`: 3 dòng đầu để preview.
 * - `targetFields`: DB fields với required/optional + enum hint.
 * - `onChange`: emit mapping `sourceIndex#headerRaw -> targetKey | null`.
 *
 * A11y: table + caption + label for, aria-describedby cho required banner.
 */

export interface ColumnMapperStepProps {
  sourceHeaders: string[];
  sampleRows?: string[][];
  targetFields: TargetField[];
  userId: string;
  initialMapping?: Record<string, string | null>;
  onChange: (mapping: Record<string, string | null>) => void;
  saveAsDefault: boolean;
  onSaveAsDefaultChange: (checked: boolean) => void;
}

/**
 * Key nội bộ để xử lý duplicate headers: "idx#header".
 * Ra ngoài (qua onChange) vẫn giữ key = chính header raw đầu tiên —
 * nhưng state máy trong component cần phân biệt chính xác từng cột index.
 */
function rowKey(index: number, header: string): string {
  return `${index}#${header}`;
}

export function ColumnMapperStep({
  sourceHeaders,
  sampleRows = [],
  targetFields,
  userId,
  initialMapping,
  onChange,
  saveAsDefault,
  onSaveAsDefaultChange,
}: ColumnMapperStepProps) {
  // Phát hiện duplicate headers (2+ cột cùng tên) — hiển thị badge "Trùng #N".
  const headerCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of sourceHeaders) counts[h] = (counts[h] ?? 0) + 1;
    return counts;
  }, [sourceHeaders]);

  // State: keyed by "idx#header" để tránh collide.
  // Giá trị = targetKey đã map hoặc null (bỏ qua).
  const [mapping, setMapping] = React.useState<Record<string, string | null>>(
    () => {
      if (initialMapping) {
        const out: Record<string, string | null> = {};
        sourceHeaders.forEach((h, i) => {
          out[rowKey(i, h)] = initialMapping[h] ?? null;
        });
        return out;
      }
      // Auto-detect lần đầu
      const auto = autoMapHeaders(sourceHeaders, targetFields);
      const claimed = new Set<string>();
      const out: Record<string, string | null> = {};
      sourceHeaders.forEach((h, i) => {
        const suggested = auto[h];
        if (suggested && !claimed.has(suggested)) {
          out[rowKey(i, h)] = suggested;
          claimed.add(suggested);
        } else {
          out[rowKey(i, h)] = null;
        }
      });
      return out;
    },
  );

  const [presetAvailable, setPresetAvailable] = React.useState(false);

  React.useEffect(() => {
    // Chỉ check 1 lần mount — không re-check mỗi render
    const preset = loadMappingPreset(userId);
    setPresetAvailable(Boolean(preset));
  }, [userId]);

  // Emit mapping ra ngoài (dạng header raw → targetKey) mỗi lần state đổi.
  // Nếu có duplicate header, giữ LAST mapping (người dùng chỉ định cột nào dùng).
  React.useEffect(() => {
    const external: Record<string, string | null> = {};
    sourceHeaders.forEach((h, i) => {
      const v = mapping[rowKey(i, h)];
      external[h] = v ?? null;
    });
    onChange(external);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping]);

  // Reset to auto-detect
  const handleResetAuto = () => {
    const auto = autoMapHeaders(sourceHeaders, targetFields);
    const claimed = new Set<string>();
    const out: Record<string, string | null> = {};
    sourceHeaders.forEach((h, i) => {
      const suggested = auto[h];
      if (suggested && !claimed.has(suggested)) {
        out[rowKey(i, h)] = suggested;
        claimed.add(suggested);
      } else {
        out[rowKey(i, h)] = null;
      }
    });
    setMapping(out);
  };

  const handleApplyPreset = () => {
    const preset = loadMappingPreset(userId);
    if (!preset) return;
    const applied = applyPreset(sourceHeaders, preset);
    const claimed = new Set<string>();
    const out: Record<string, string | null> = {};
    sourceHeaders.forEach((h, i) => {
      const suggested = applied[h];
      if (suggested && !claimed.has(suggested)) {
        out[rowKey(i, h)] = suggested;
        claimed.add(suggested);
      } else {
        out[rowKey(i, h)] = null;
      }
    });
    setMapping(out);
  };

  const handleSavePresetNow = () => {
    const external: Record<string, string | null> = {};
    sourceHeaders.forEach((h, i) => {
      external[h] = mapping[rowKey(i, h)] ?? null;
    });
    saveMappingPreset(userId, external);
    setPresetAvailable(true);
  };

  const setRowMapping = (index: number, header: string, target: string | null) => {
    setMapping((prev) => {
      const next = { ...prev };
      // Nếu target đã được claim bởi row khác → unset row đó.
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

  // Tính required chưa được map → validation banner
  const requiredFields = targetFields.filter((t) => t.required);
  const mappedTargets = new Set(
    Object.values(mapping).filter((v): v is string => v !== null),
  );
  const missingRequired = requiredFields.filter(
    (t) => !mappedTargets.has(t.key),
  );

  const totalMapped = Object.values(mapping).filter((v) => v !== null).length;
  const totalSkipped = sourceHeaders.length - totalMapped;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Khớp cột Excel với trường hệ thống
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Hệ thống tự đề xuất dựa trên tên cột (VN/EN). Kiểm tra lại, sửa nếu
            cần, rồi bấm <strong>Tiếp theo</strong>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetAuto}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Đề xuất lại
          </Button>
          {presetAvailable ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleApplyPreset}
            >
              Áp dụng preset
            </Button>
          ) : null}
        </div>
      </header>

      {missingRequired.length > 0 ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger-strong"
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
            .
          </span>
        </div>
      ) : (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-success/20 bg-success-soft px-3 py-2 text-sm text-success-strong"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Tất cả trường bắt buộc đã được map.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <caption className="sr-only">
            Khớp cột Excel với trường hệ thống
          </caption>
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
            <tr>
              <th className="w-12 px-3 py-2">#</th>
              <th className="px-3 py-2">Cột Excel</th>
              <th className="w-64 px-3 py-2">Trường DB</th>
              <th className="px-3 py-2">Mẫu dữ liệu (3 dòng)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sourceHeaders.map((header, index) => {
              const key = rowKey(index, header);
              const current = mapping[key] ?? null;
              const isDuplicate = (headerCounts[header] ?? 0) > 1;
              const dupIndex = isDuplicate
                ? sourceHeaders
                    .slice(0, index + 1)
                    .filter((h) => h === header).length
                : null;
              const samples = sampleRows
                .slice(0, 3)
                .map((row) => row[index] ?? "")
                .filter(Boolean);
              return (
                <tr
                  key={key}
                  className={cn(index % 2 === 1 && "bg-zebra/40")}
                >
                  <td className="px-3 py-2 text-slate-500 tabular-nums">
                    {index + 1}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {header || (
                          <span className="italic text-slate-400">
                            (không tên)
                          </span>
                        )}
                      </span>
                      {isDuplicate ? (
                        <span
                          className="inline-flex items-center rounded bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning-strong"
                          title={`Có ${headerCounts[header]} cột trùng tên`}
                        >
                          Trùng #{dupIndex}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <label htmlFor={`map-${key}`} className="sr-only">
                      Trường hệ thống cho cột {header}
                    </label>
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
                      <SelectTrigger id={`map-${key}`} className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">
                          <span className="italic text-slate-500">
                            -- Bỏ qua --
                          </span>
                        </SelectItem>
                        {targetFields.map((t) => {
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
                                    ? "font-semibold text-slate-900"
                                    : "text-slate-600",
                                )}
                              >
                                {t.label}
                                {t.required ? (
                                  <span className="ml-1 text-danger">*</span>
                                ) : null}
                                {claimedElsewhere ? (
                                  <span className="ml-2 text-xs text-slate-400">
                                    (đã dùng)
                                  </span>
                                ) : null}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    <div className="max-w-xs truncate">
                      {samples.length > 0 ? samples.join(", ") : "—"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-slate-400" aria-hidden="true" />
          Đã map <strong className="text-slate-900">{totalMapped}</strong>,
          bỏ qua <strong className="text-slate-900">{totalSkipped}</strong> /{" "}
          {sourceHeaders.length} cột.
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={saveAsDefault}
              onCheckedChange={(v) => onSaveAsDefaultChange(Boolean(v))}
              aria-label="Lưu mapping này làm mặc định"
            />
            <span>Lưu mapping làm mặc định</span>
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSavePresetNow}
            disabled={missingRequired.length > 0}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            Lưu ngay
          </Button>
        </div>
      </div>
    </div>
  );
}
