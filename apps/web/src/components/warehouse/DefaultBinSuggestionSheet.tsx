"use client";

import * as React from "react";
import { FileDown, FileUp, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeaderNav,
} from "@/components/ui/sheet";
import { formatPercent, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * V4.3 Việc 1 — Sheet "Đề xuất vị trí mặc định" mở từ tab Vật tư.
 *
 * 2 khối:
 *   1. Danh sách đề xuất (vật tư đang nằm chủ yếu ở 1 ô, khác vị trí mặc định
 *      hiện tại) — chọn/bỏ chọn rồi "Áp dụng đã chọn".
 *   2. Xuất/Nhập Excel — xuất toàn bộ để sửa tay, nhập lại để gán hàng loạt
 *      (xem trước + báo lỗi từng dòng trước khi ghi).
 */

interface SuggestionRow {
  itemId: string;
  sku: string;
  name: string;
  currentDefaultBinCode: string | null;
  suggestedBinCode: string;
  suggestedQty: number;
  totalQty: number;
  share: number;
}

interface ImportPreviewRowError {
  rowNumber: number;
  field: string;
  reason: string;
}

interface ImportPreviewResult {
  committed: boolean;
  rowTotal: number;
  validCount?: number;
  applied?: number;
  errorCount: number;
  errors: ImportPreviewRowError[];
}

export function DefaultBinSuggestionSheet({
  open,
  onOpenChange,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
}) {
  const [rows, setRows] = React.useState<SuggestionRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [applying, setApplying] = React.useState(false);

  const [file, setFile] = React.useState<File | null>(null);
  const [importPreview, setImportPreview] = React.useState<ImportPreviewResult | null>(null);
  const [importBusy, setImportBusy] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/warehouse/default-bin-suggestions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: SuggestionRow[] };
      setRows(json.data ?? []);
      setSelected(new Set((json.data ?? []).map((r) => r.itemId)));
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) void load();
    if (!open) {
      setFile(null);
      setImportPreview(null);
    }
  }, [open, load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.itemId))));
  };

  const handleApply = async () => {
    if (selected.size === 0) return;
    setApplying(true);
    try {
      const res = await fetch("/api/warehouse/default-bin-suggestions/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: [...selected] }),
      });
      const json = (await res.json()) as {
        data?: { applied: unknown[]; skipped: Array<{ reason: string }> };
        error?: { message: string };
      };
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      toast.success(
        `Đã áp dụng ${json.data?.applied.length ?? 0} vật tư` +
          (json.data?.skipped.length ? ` — bỏ qua ${json.data.skipped.length} (dữ liệu đã đổi).` : "."),
      );
      onApplied?.();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const runImport = async (commit: boolean) => {
    if (!file) return;
    setImportBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (commit) form.set("commit", "1");
      const res = await fetch("/api/warehouse/default-bin-suggestions/import", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as { data?: ImportPreviewResult; error?: { message: string } };
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      setImportPreview(json.data ?? null);
      if (commit) {
        toast.success(`Đã ghi ${json.data?.applied ?? 0} dòng.`);
        onApplied?.();
        await load();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" hideCloseButton className="flex flex-col">
        <SheetHeaderNav
          title="Đề xuất vị trí mặc định"
          onCancel={() => onOpenChange(false)}
        />
        <SheetBody className="space-y-6">
          {/* Khối 1 — danh sách đề xuất */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-zinc-900 dark:text-zinc-50">
                <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
                Vật tư đang tập trung ở 1 ô ({rows.length})
              </h3>
              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  {selected.size === rows.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-zinc-500 dark:text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
              </div>
            ) : loadError ? (
              <p className="py-4 text-sm text-red-600 dark:text-red-400">{loadError}</p>
            ) : rows.length === 0 ? (
              <p className="rounded-lg bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                Không còn vật tư nào cần đề xuất — mọi vật tư tập trung 1 ô đã có vị trí mặc định đúng.
              </p>
            ) : (
              <ul className="max-h-[40vh] divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {rows.map((r) => (
                  <li
                    key={r.itemId}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <Checkbox
                      checked={selected.has(r.itemId)}
                      onCheckedChange={() => toggle(r.itemId)}
                      aria-label={`Chọn ${r.sku}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                          {r.sku}
                        </span>
                        <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{r.name}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                        <span className={cn(r.currentDefaultBinCode ? "" : "italic text-zinc-400 dark:text-zinc-500")}>
                          {r.currentDefaultBinCode ?? "chưa có"}
                        </span>
                        <span aria-hidden>→</span>
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                          {r.suggestedBinCode}
                        </span>
                        <span className="ml-auto shrink-0 tabular-nums text-zinc-400 dark:text-zinc-500">
                          {formatQty(r.suggestedQty)}/{formatQty(r.totalQty)} ({formatPercent(r.share, { maxDecimals: 0 })})
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Khối 2 — Excel */}
          <section className="space-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-50">
              Xuất / Nhập Excel hàng loạt
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <a href="/api/warehouse/default-bin-suggestions/export">
                  <FileDown className="h-3.5 w-3.5" aria-hidden /> Xuất Excel
                </a>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setImportPreview(null);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-3.5 w-3.5" aria-hidden />
                {file ? file.name : "Chọn file .xlsx"}
              </Button>
              {file && (
                <Button size="sm" disabled={importBusy} onClick={() => void runImport(false)}>
                  {importBusy ? "Đang xem…" : "Xem trước"}
                </Button>
              )}
            </div>

            {importPreview && (
              <div className="rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800">
                <p className="text-zinc-700 dark:text-zinc-300">
                  Tổng {importPreview.rowTotal} dòng — hợp lệ {importPreview.validCount ?? importPreview.applied}{" "}
                  · lỗi {importPreview.errorCount}
                </p>
                {importPreview.errors.length > 0 && (
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-red-600 dark:text-red-400">
                    {importPreview.errors.map((e, i) => (
                      <li key={i}>
                        Dòng {e.rowNumber}: {e.reason}
                      </li>
                    ))}
                  </ul>
                )}
                {!importPreview.committed && (importPreview.validCount ?? 0) > 0 && (
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={importBusy}
                    onClick={() => void runImport(true)}
                  >
                    Ghi nhận {importPreview.validCount} dòng
                  </Button>
                )}
                {importPreview.committed && (
                  <p className="mt-2 font-medium text-emerald-600 dark:text-emerald-400">
                    Đã ghi {importPreview.applied} dòng.
                  </p>
                )}
              </div>
            )}
          </section>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button disabled={selected.size === 0 || applying} onClick={() => void handleApply()}>
            {applying ? "Đang áp dụng…" : `Áp dụng ${selected.size ? `(${selected.size})` : ""}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
