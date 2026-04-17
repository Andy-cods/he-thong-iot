"use client";

import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
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

type Step = "upload" | "map" | "preview" | "result";

const DUP_LABEL: Record<ImportDuplicateMode, string> = {
  skip: "Bỏ qua dòng trùng SKU",
  upsert: "Cập nhật dòng trùng SKU",
  error: "Báo lỗi nếu trùng SKU",
};

const STEP_ORDER: Step[] = ["upload", "map", "preview", "result"];

/**
 * Đọc 1 dòng đầu (header) + 3 dòng data đầu từ file Excel ngay trên trình duyệt.
 * Dùng ExcelJS (đã có trong deps, bundle browser OK).
 * Fallback an toàn nếu parse lỗi: return { headers: [], samples: [] } và để server validate.
 */
async function parseExcelPreview(file: File): Promise<{
  headers: string[];
  samples: string[][];
}> {
  try {
    // Lazy import để không tăng bundle các route khác.
    const ExcelJS = (await import("exceljs")).default;
    const ab = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(ab);
    const ws = wb.worksheets[0];
    if (!ws) return { headers: [], samples: [] };
    const headerRow = ws.getRow(1).values as unknown[];
    // ExcelJS values[0] là undefined (1-indexed). Slice(1).
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
  /**
   * Username hoặc userId ổn định — dùng key preset localStorage.
   * Nếu không truyền → dùng "anon" (vẫn persist nhưng không tách theo user).
   */
  userId?: string;
}

export function ImportWizard({ userId = "anon" }: ImportWizardProps = {}) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [duplicateMode, setDuplicateMode] =
    useState<ImportDuplicateMode>("skip");
  const [batchId, setBatchId] = useState<string | null>(null);

  // Client-side parsed header + sample từ step 1.
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
    // Validate required fields mapped
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
      // Persist preset nếu user chọn checkbox.
      if (saveAsDefault) {
        saveMappingPreset(userId, mapping);
      }
      // TODO V1.1: gửi mapping JSON kèm multipart để server accept header
      // tuỳ biến. V1 backend chỉ accept template chuẩn — ColumnMapper chủ yếu
      // để user verify + warn trước upload.
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
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Nhập Excel — Item Master
          </h1>
          <p className="text-sm text-slate-600">
            Upload → Khớp cột → Preview → Commit. Tối đa{" "}
            {LIMITS.FILE_UPLOAD_MAX_BYTES / 1024 / 1024}MB / file.
          </p>
        </div>
        <a
          href={downloadTemplateUrl()}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" /> Tải template
        </a>
      </header>

      <StepIndicator step={step} />

      {step === "upload" && (
        <section className="space-y-4">
          <div
            {...getRootProps()}
            className={cn(
              "flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition",
              isDragActive
                ? "border-cta bg-cta-soft"
                : "border-slate-300 bg-white hover:border-slate-400",
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud className="mb-3 h-10 w-10 text-slate-400" aria-hidden />
            {file ? (
              <div className="text-center">
                <FileSpreadsheet className="mx-auto mb-2 h-6 w-6 text-success" />
                <p className="font-medium text-slate-900">{file.name}</p>
                <p className="text-sm text-slate-500">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Kéo thả file .xlsx vào đây hoặc bấm để chọn (tối đa{" "}
                {LIMITS.FILE_UPLOAD_MAX_BYTES / 1024 / 1024}MB)
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="dup">Xử lý trùng SKU</Label>
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

          <div className="flex justify-end">
            <Button
              onClick={handleGoToMap}
              disabled={!file}
              className="min-h-[48px]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && file) void handleGoToMap();
              }}
            >
              Tiếp theo — Khớp cột
            </Button>
          </div>
        </section>
      )}

      {step === "map" && (
        <section className="space-y-4">
          <ColumnMapperStep
            sourceHeaders={sourceHeaders}
            sampleRows={sampleRows}
            targetFields={ITEM_TARGET_FIELDS}
            userId={userId}
            onChange={setMapping}
            saveAsDefault={saveAsDefault}
            onSaveAsDefaultChange={setSaveAsDefault}
          />
          <div className="flex justify-between">
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="h-4 w-4" /> Quay lại
            </Button>
            <Button
              onClick={handleGoToPreview}
              disabled={upload.isPending}
              className="min-h-[48px]"
            >
              {upload.isPending ? "Đang đọc file…" : "Tiếp theo — Preview"}
            </Button>
          </div>
        </section>
      )}

      {step === "preview" && uploadData && (
        <section className="space-y-4">
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
              className="inline-flex items-center gap-2 text-sm font-medium text-warning-strong hover:underline"
            >
              <AlertTriangle className="h-4 w-4" /> Tải file lỗi (
              {uploadData.rowFail} dòng) để sửa
            </a>
          )}

          {previewRows && previewRows.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
                <span>Preview {previewRows.length} dòng đầu</span>
                <span className="text-xs text-slate-500">
                  Dòng lỗi được tô đỏ
                </span>
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="sticky top-0 z-sticky bg-slate-50">
                    <tr>
                      <th className="w-14 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                        #
                      </th>
                      {["SKU", "Tên", "Loại", "UoM", "Category"].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((r, i) => {
                      const invalid = Boolean(r.__invalid);
                      return (
                        <tr
                          key={i}
                          className={cn(invalid && "bg-danger-soft")}
                        >
                          <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">
                            {i + 1}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 font-mono text-slate-900",
                              invalid && !r.sku && "bg-danger/30",
                            )}
                          >
                            {r.sku ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-800">
                            {r.name ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {r.itemType ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {r.uom ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-500">
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

          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setStep("map");
              }}
            >
              <ArrowLeft className="h-4 w-4" /> Quay lại
            </Button>
            <Button
              onClick={handleCommit}
              disabled={uploadData.rowSuccess === 0 || commit.isPending}
              className="min-h-[48px]"
            >
              {commit.isPending
                ? "Đang gửi…"
                : `Commit ${uploadData.rowSuccess} dòng hợp lệ`}
            </Button>
          </div>
        </section>
      )}

      {step === "result" && batchQuery.data && (
        <section className="space-y-4">
          <ResultPanel
            status={batchQuery.data.status}
            progressPct={progressPct}
            rowSuccess={batchQuery.data.rowSuccess}
            rowFail={batchQuery.data.rowFail}
            rowTotal={batchQuery.data.rowTotal}
            errorMessage={batchQuery.data.errorMessage}
          />
          <div className="flex justify-between">
            <Button
              variant="outline"
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
                className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" /> Tải file lỗi
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Khớp cột" },
    { key: "preview", label: "Preview" },
    { key: "result", label: "Kết quả" },
  ];
  const activeIdx = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Tiến trình">
      {steps.map((s, i) => {
        const state: "done" | "current" | "pending" =
          i < activeIdx ? "done" : i === activeIdx ? "current" : "pending";
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
                state === "current" && "border-cta bg-cta text-white",
                state === "done" &&
                  "border-success bg-success text-white",
                state === "pending" &&
                  "border-slate-300 bg-white text-slate-500",
              )}
              aria-current={state === "current" ? "step" : undefined}
            >
              {state === "done" ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                i + 1
              )}
            </span>
            <span
              className={cn(
                state === "current"
                  ? "font-medium text-slate-900"
                  : state === "done"
                    ? "text-slate-700"
                    : "text-slate-500",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="mx-1 h-px w-8 bg-slate-300" />
            )}
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
      ? "text-success-strong"
      : tone === "error"
        ? "text-danger-strong"
        : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>
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
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-3">
        {isDone ? (
          <CheckCircle2 className="h-6 w-6 text-success" />
        ) : isFailed ? (
          <AlertTriangle className="h-6 w-6 text-danger" />
        ) : (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-cta" />
        )}
        <div>
          <div className="text-base font-semibold text-slate-900">
            {isDone
              ? "Hoàn tất import"
              : isFailed
                ? "Import thất bại"
                : "Đang import nền…"}
          </div>
          <div className="text-sm text-slate-600">
            Trạng thái: <span className="font-mono">{status}</span>
          </div>
        </div>
      </div>

      {!isFailed && (
        <>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-cta transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-500 tabular-nums">
            <span>
              {rowSuccess + rowFail}/{rowTotal} dòng
            </span>
            <span>{progressPct}%</span>
          </div>
        </>
      )}

      {isFailed && errorMessage && (
        <div className="mt-3 rounded-md bg-danger-soft p-3 text-sm text-danger-strong">
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
