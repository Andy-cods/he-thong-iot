"use client";

import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  UploadCloud,
} from "lucide-react";
import {
  IMPORT_DUPLICATE_MODES,
  LIMITS,
  type ImportDuplicateMode,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCommitImport,
  useImportBatch,
  useUploadItemImport,
  downloadErrorsUrl,
  downloadTemplateUrl,
} from "@/hooks/useImports";
import {
  ITEM_TARGET_FIELDS,
  saveMappingPreset,
} from "@/lib/import-mapping";
import { ColumnMapperStep } from "./ColumnMapperStep";
import { cn } from "@/lib/utils";

/**
 * V2 ImportWizard — design-spec §2.6 + §3.5.2.
 *
 * - Stepper V2: 4-step dot h-8 w-8 rounded-full. Active blue-500, done
 *   emerald-500 + check icon, pending zinc-300 border + zinc-500 number.
 *   Connector line 2px bg emerald-500 (done) / zinc-200 (todo).
 * - Dropzone hover/active: border-blue-500 bg-blue-50/30 (thay cta dead V1).
 * - Preview table sticky header + invalid row bg-red-50 border-l-2 red-500,
 *   cell bg-red-100 khi field cụ thể thiếu.
 * - Stats card dùng success-strong / danger-strong tokens V2.
 * - Result: Check icon 48px emerald-500 + h1 xl + stats grid + actions.
 *
 * GIỮ logic V1: useImports hooks BullMQ flow, parseExcelPreview ExcelJS
 * client-side, duplicate mode select, preset localStorage.
 */

type Step = "upload" | "map" | "preview" | "result";

const DUP_LABEL: Record<ImportDuplicateMode, string> = {
  skip: "Bỏ qua dòng trùng SKU",
  upsert: "Cập nhật dòng trùng SKU",
  error: "Báo lỗi nếu trùng SKU",
};

const STEP_ORDER: Step[] = ["upload", "map", "preview", "result"];
const STEP_LABELS: Record<Step, string> = {
  upload: "Tải file",
  map: "Khớp cột",
  preview: "Preview",
  result: "Kết quả",
};

async function parseExcelPreview(file: File): Promise<{
  headers: string[];
  samples: string[][];
}> {
  try {
    const ExcelJS = (await import("exceljs")).default;
    const ab = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(ab);
    const ws = wb.worksheets[0];
    if (!ws) return { headers: [], samples: [] };
    const headerRow = ws.getRow(1).values as unknown[];
    const headers = (headerRow.slice(1) as unknown[]).map((v) =>
      v == null ? "" : String(v).trim(),
    );
    const samples: string[][] = [];
    for (let r = 2; r <= Math.min(4, ws.rowCount); r++) {
      const row = ws.getRow(r).values as unknown[];
      samples.push(
        (row.slice(1) as unknown[]).map((v) =>
          v == null ? "" : String(v).trim(),
        ),
      );
    }
    return { headers, samples };
  } catch {
    return { headers: [], samples: [] };
  }
}

export interface ImportWizardProps {
  userId?: string;
}

export function ImportWizard({ userId = "anon" }: ImportWizardProps = {}) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [duplicateMode, setDuplicateMode] =
    useState<ImportDuplicateMode>("skip");
  const [batchId, setBatchId] = useState<string | null>(null);

  const [sourceHeaders, setSourceHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  const upload = useUploadItemImport();
  const commit = useCommitImport();
  const batchQuery = useImportBatch(batchId);

  const uploadData = upload.data;

  const onDrop = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (f.size > LIMITS.FILE_UPLOAD_MAX_BYTES) {
      toast.error(
        `File vượt quá ${LIMITS.FILE_UPLOAD_MAX_BYTES / 1024 / 1024}MB.`,
      );
      return;
    }
    setFile(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
  });

  const handleGoToMap = async () => {
    if (!file) return;
    try {
      const { headers, samples } = await parseExcelPreview(file);
      if (headers.length === 0) {
        toast.error(
          "Không đọc được header từ file. Kiểm tra lại định dạng .xlsx.",
        );
        return;
      }
      setSourceHeaders(headers);
      setSampleRows(samples);
      setStep("map");
    } catch (err) {
      toast.error(`Đọc file thất bại: ${(err as Error).message}`);
    }
  };

  const handleGoToPreview = async () => {
    if (!file) return;
    const mappedTargets = new Set(
      Object.values(mapping).filter((v): v is string => !!v),
    );
    const missing = ITEM_TARGET_FIELDS.filter(
      (t) => t.required && !mappedTargets.has(t.key),
    );
    if (missing.length > 0) {
      toast.error(
        `Còn ${missing.length} trường bắt buộc chưa được map: ${missing
          .map((t) => t.label)
          .join(", ")}.`,
      );
      return;
    }
    try {
      if (saveAsDefault) {
        saveMappingPreset(userId, mapping);
      }
      const res = await upload.mutateAsync({ file, duplicateMode });
      setBatchId(res.batchId);
      setStep("preview");
      if (res.reused) {
        toast.info("File này đã upload trong 1 giờ qua — dùng lại phiên cũ.");
      } else {
        toast.success(
          `Đọc xong: ${res.rowSuccess} dòng hợp lệ, ${res.rowFail} dòng lỗi.`,
        );
      }
    } catch (err) {
      toast.error(`Upload thất bại: ${(err as Error).message}`);
    }
  };

  const handleCommit = async () => {
    if (!batchId) return;
    try {
      await commit.mutateAsync({ batchId, duplicateMode });
      setStep("result");
      toast.info("Đang import nền — bạn có thể theo dõi tiến độ ở đây.");
    } catch (err) {
      toast.error(`Commit thất bại: ${(err as Error).message}`);
    }
  };

  const progressPct = useMemo(() => {
    const d = batchQuery.data;
    if (!d || d.rowTotal === 0) return 0;
    return Math.round(((d.rowSuccess + d.rowFail) / d.rowTotal) * 100);
  }, [batchQuery.data]);

  const previewRows = uploadData?.previewRows as
    | Array<{
        sku?: string;
        name?: string;
        itemType?: string;
        uom?: string;
        category?: string | null;
        __invalid?: boolean;
        __reason?: string;
      }>
    | undefined;

  const goBack = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]!);
  };

  return (
    <div className="space-y-6">
      {/* V2 Stepper — 4-dot + connector */}
      <StepIndicator step={step} />

      {step === "upload" && (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
          <div
            {...getRootProps()}
            className={cn(
              "flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 transition-colors duration-150",
              isDragActive
                ? "border-blue-500 bg-blue-50/30"
                : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50/50",
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud
              className="mb-3 h-8 w-8 text-zinc-400"
              aria-hidden="true"
            />
            {file ? (
              <div className="text-center">
                <FileSpreadsheet
                  className="mx-auto mb-2 h-5 w-5 text-emerald-600"
                  aria-hidden="true"
                />
                <p className="text-md font-medium text-zinc-900">{file.name}</p>
                <p className="text-xs text-zinc-500 tabular-nums">
                  {(file.size / 1024).toLocaleString("vi-VN", {
                    maximumFractionDigits: 0,
                  })}{" "}
                  KB
                </p>
              </div>
            ) : (
              <>
                <p className="text-md font-medium text-zinc-900">
                  Kéo thả file Excel vào đây
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  hoặc bấm để chọn · XLSX ·{" "}
                  {LIMITS.FILE_UPLOAD_MAX_BYTES / 1024 / 1024}MB tối đa
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dup" uppercase>
                Xử lý trùng SKU
              </Label>
              <Select
                value={duplicateMode}
                onValueChange={(v) => setDuplicateMode(v as ImportDuplicateMode)}
              >
                <SelectTrigger id="dup">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMPORT_DUPLICATE_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {DUP_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <a
                href={downloadTemplateUrl()}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-base font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Tải template Excel
              </a>
            </div>
          </div>

          <div className="flex justify-end border-t border-zinc-200 pt-4">
            <Button onClick={handleGoToMap} disabled={!file}>
              Tiếp theo — Khớp cột
            </Button>
          </div>
        </section>
      )}

      {step === "map" && (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
          <ColumnMapperStep
            sourceHeaders={sourceHeaders}
            sampleRows={sampleRows}
            targetFields={ITEM_TARGET_FIELDS}
            userId={userId}
            onChange={setMapping}
            saveAsDefault={saveAsDefault}
            onSaveAsDefaultChange={setSaveAsDefault}
          />
          <div className="flex justify-between border-t border-zinc-200 pt-4">
            <Button variant="ghost" onClick={goBack}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Quay lại
            </Button>
            <Button onClick={handleGoToPreview} disabled={upload.isPending}>
              {upload.isPending ? "Đang đọc file…" : "Tiếp theo — Preview"}
            </Button>
          </div>
        </section>
      )}

      {step === "preview" && uploadData && (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Tổng dòng" value={uploadData.rowTotal} />
            <StatCard
              label="Hợp lệ"
              value={uploadData.rowSuccess}
              tone="success"
            />
            <StatCard
              label="Lỗi"
              value={uploadData.rowFail}
              tone={uploadData.rowFail > 0 ? "error" : "muted"}
            />
          </div>

          {uploadData.rowFail > 0 && batchId && (
            <a
              href={downloadErrorsUrl(batchId)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Tải danh sách {uploadData.rowFail} dòng lỗi để sửa
            </a>
          )}

          {previewRows && previewRows.length > 0 && (
            <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
              <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 h-8 text-xs font-medium uppercase tracking-wider text-zinc-500">
                <span>Preview {previewRows.length} dòng đầu</span>
                <span className="normal-case tracking-normal text-zinc-500">
                  Dòng lỗi tô nền đỏ
                </span>
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="min-w-full text-base">
                  <thead className="sticky top-0 z-sticky bg-zinc-50">
                    <tr className="text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                      <th className="h-8 w-12 px-3">#</th>
                      {["SKU", "Tên", "Loại", "UoM", "Category"].map((h) => (
                        <th key={h} className="h-8 px-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => {
                      const invalid = Boolean(r.__invalid);
                      return (
                        <tr
                          key={i}
                          className={cn(
                            "h-8 border-t border-zinc-100",
                            invalid &&
                              "border-l-2 border-l-red-500 bg-red-50",
                          )}
                        >
                          <td className="px-3 text-xs text-zinc-500 tabular-nums">
                            {i + 1}
                          </td>
                          <td
                            className={cn(
                              "px-3 font-mono text-xs text-zinc-900",
                              invalid && !r.sku && "bg-red-100",
                            )}
                          >
                            {r.sku ?? "—"}
                          </td>
                          <td
                            className={cn(
                              "px-3 text-zinc-800",
                              invalid && !r.name && "bg-red-100",
                            )}
                          >
                            {r.name ?? "—"}
                          </td>
                          <td className="px-3 text-zinc-600">
                            {r.itemType ?? "—"}
                          </td>
                          <td className="px-3 text-zinc-600">
                            {r.uom ?? "—"}
                          </td>
                          <td className="px-3 text-zinc-500">
                            {r.category ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-between border-t border-zinc-200 pt-4">
            <Button variant="ghost" onClick={() => setStep("map")}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Quay lại
            </Button>
            <Button
              onClick={handleCommit}
              disabled={uploadData.rowSuccess === 0 || commit.isPending}
            >
              {commit.isPending
                ? "Đang gửi…"
                : `Commit ${uploadData.rowSuccess.toLocaleString("vi-VN")} dòng hợp lệ`}
            </Button>
          </div>
        </section>
      )}

      {step === "result" && batchQuery.data && (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
          <ResultPanel
            status={batchQuery.data.status}
            progressPct={progressPct}
            rowSuccess={batchQuery.data.rowSuccess}
            rowFail={batchQuery.data.rowFail}
            rowTotal={batchQuery.data.rowTotal}
            errorMessage={batchQuery.data.errorMessage}
          />
          <div className="flex justify-between border-t border-zinc-200 pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setStep("upload");
                setFile(null);
                setBatchId(null);
                setSourceHeaders([]);
                setSampleRows([]);
                setMapping({});
                upload.reset();
              }}
            >
              Import file khác
            </Button>
            {batchQuery.data.rowFail > 0 && batchId && (
              <a
                href={downloadErrorsUrl(batchId)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-base font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Tải file lỗi
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const activeIdx = STEP_ORDER.indexOf(step);
  return (
    <ol
      className="flex items-center gap-0 rounded-md border border-zinc-200 bg-white px-4 h-12"
      aria-label="Tiến trình import"
    >
      {STEP_ORDER.map((s, i) => {
        const state: "done" | "current" | "pending" =
          i < activeIdx ? "done" : i === activeIdx ? "current" : "pending";
        const isLast = i === STEP_ORDER.length - 1;
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors",
                state === "current" && "bg-blue-500 text-white",
                state === "done" && "bg-emerald-500 text-white",
                state === "pending" &&
                  "border-2 border-zinc-300 bg-white text-zinc-500",
              )}
            >
              {state === "done" ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                i + 1
              )}
            </span>
            <span
              className={cn(
                "text-base font-medium",
                state === "current" && "text-zinc-900",
                state === "done" && "text-emerald-700",
                state === "pending" && "text-zinc-500",
              )}
            >
              {STEP_LABELS[s]}
            </span>
            {!isLast ? (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-2 h-0.5 flex-1",
                  state === "done" ? "bg-emerald-500" : "bg-zinc-200",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StatCard({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "success" | "error" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "error"
        ? "text-red-700"
        : "text-zinc-900";
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", toneClass)}>
        {value.toLocaleString("vi-VN")}
      </div>
    </div>
  );
}

function ResultPanel({
  status,
  progressPct,
  rowSuccess,
  rowFail,
  rowTotal,
  errorMessage,
}: {
  status: string;
  progressPct: number;
  rowSuccess: number;
  rowFail: number;
  rowTotal: number;
  errorMessage: string | null;
}) {
  const isDone = status === "done";
  const isFailed = status === "failed";
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-6">
      <div className="flex items-center gap-3">
        {isDone ? (
          <CheckCircle2
            className="h-12 w-12 text-emerald-500"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : isFailed ? (
          <AlertTriangle
            className="h-12 w-12 text-red-500"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : (
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-zinc-200 border-t-blue-500" />
        )}
        <div>
          <div className="text-xl font-semibold tracking-tight text-zinc-900">
            {isDone
              ? "Hoàn tất import"
              : isFailed
                ? "Import thất bại"
                : "Đang import nền…"}
          </div>
          <div className="text-xs text-zinc-500">
            Trạng thái: <span className="font-mono">{status}</span>
          </div>
        </div>
      </div>

      {!isFailed && (
        <>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-zinc-500 tabular-nums">
            <span>
              {(rowSuccess + rowFail).toLocaleString("vi-VN")}/
              {rowTotal.toLocaleString("vi-VN")} dòng
            </span>
            <span>{progressPct}%</span>
          </div>
        </>
      )}

      {isFailed && errorMessage && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard label="Tổng" value={rowTotal} />
        <StatCard label="Thành công" value={rowSuccess} tone="success" />
        <StatCard
          label="Lỗi"
          value={rowFail}
          tone={rowFail > 0 ? "error" : "muted"}
        />
      </div>
    </div>
  );
}
