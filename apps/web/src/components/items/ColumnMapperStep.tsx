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
 * V2 ColumnMapperStep — design-spec §3.5.1.
 *
 * - Table row h-9 compact (40px spacing), Select target h-8.
 * - Badge "Trùng #N" warning sm (amber-50 / amber-700).
 * - "Áp dụng preset" button size sm ghost.
 * - Synonym hint text-xs italic zinc-500 inline below source.
 * - Required banner khi thiếu trường: bg-red-50 border red-200 text-red-700.
 * - Success banner khi đủ: bg-emerald-50 border emerald-200 text-emerald-700.
 *
 * GIỮ logic V1 100%: autoMapHeaders (synonym + Levenshtein), duplicate
 * header detection bằng index, preset localStorage per-user.
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
  const headerCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of sourceHeaders) counts[h] = (counts[h] ?? 0) + 1;
    return counts;
  }, [sourceHeaders]);

  const [mapping, setMapping] = React.useState<Record<string, string | null>>(
    () => {
      if (initialMapping) {
        const out: Record<string, string | null> = {};
        sourceHeaders.forEach((h, i) => {
          out[rowKey(i, h)] = initialMapping[h] ?? null;
        });
        return out;
      }
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
    const preset = loadMappingPreset(userId);
    setPresetAvailable(Boolean(preset));
  }, [userId]);

  React.useEffect(() => {
    const external: Record<string, string | null> = {};
    sourceHeaders.forEach((h, i) => {
      const v = mapping[rowKey(i, h)];
      external[h] = v ?? null;
    });
    onChange(external);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping]);

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
          <h2 className="text-md font-semibold text-zinc-900">
            Khớp cột Excel với trường hệ thống
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Hệ thống tự đề xuất dựa trên tên cột (VN/EN). Kiểm tra lại, sửa nếu
            cần, rồi bấm <strong>Tiếp theo</strong>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetAuto}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Đề xuất lại
          </Button>
          {presetAvailable ? (
            <Button
              type="button"
              variant="ghost"
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
            .
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
          <caption className="sr-only">
            Khớp cột Excel với trường hệ thống
          </caption>
          <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="h-8 w-12 px-3">#</th>
              <th className="h-8 px-3">Cột Excel</th>
              <th className="h-8 w-64 px-3">Trường hệ thống</th>
              <th className="h-8 px-3">Mẫu dữ liệu</th>
            </tr>
          </thead>
          <tbody>
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
                  className="h-10 border-t border-zinc-100 align-top"
                >
                  <td className="px-3 py-2 text-xs text-zinc-500 tabular-nums">
                    {index + 1}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900">
                        {header || (
                          <span className="italic text-zinc-400">
                            (không tên)
                          </span>
                        )}
                      </span>
                      {isDuplicate ? (
                        <span
                          className="inline-flex items-center rounded-sm bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700"
                          title={`Có ${headerCounts[header]} cột trùng tên`}
                        >
                          Trùng #{dupIndex}
                        </span>
                      ) : null}
                    </div>
                    {current && samples.length > 0 ? null : (
                      <p className="mt-0.5 text-xs italic text-zinc-500">
                        {current
                          ? `→ ${targetFields.find((t) => t.key === current)?.label ?? current}`
                          : "Bỏ qua cột này"}
                      </p>
                    )}
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
                      <SelectTrigger id={`map-${key}`} size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">
                          <span className="italic text-zinc-500">
                            — Bỏ qua —
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
                                    ? "font-semibold text-zinc-900"
                                    : "text-zinc-700",
                                )}
                              >
                                {t.label}
                                {t.required ? (
                                  <span className="ml-1 text-red-500">*</span>
                                ) : null}
                                {claimedElsewhere ? (
                                  <span className="ml-2 text-xs text-zinc-400">
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
                  <td className="px-3 py-2 font-mono text-xs text-zinc-500">
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

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600">
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          Đã map <strong className="text-zinc-900">{totalMapped}</strong>, bỏ qua{" "}
          <strong className="text-zinc-900">{totalSkipped}</strong> /{" "}
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
            variant="ghost"
            size="sm"
            onClick={handleSavePresetNow}
            disabled={missingRequired.length > 0}
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            Lưu ngay
          </Button>
        </div>
      </div>
    </div>
  );
}
