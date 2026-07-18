"use client";

import * as React from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  RefreshCw,
  Settings2,
  Sparkles,
  Table as TableIcon,
  UploadCloud,
} from "lucide-react";
import { LIMITS } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  downloadBomImportErrorsUrl,
  useBomImportStatus,
  useCommitBomImport,
  useUploadBomImport,
  type BomImportErrorPreview,
  type BomImportSheet,
  type BomUploadResult,
} from "@/hooks/useBomImport";
import { BomColumnMapperStep } from "./BomColumnMapperStep";
import { cn } from "@/lib/utils";

/**
 * V3.7.33 — BomImportWizard redesign 3-step modern.
 *
 * Trước đây 5 steps: Upload → Select sheet → Map cột → Preview → Result.
 * User feedback: "fewer steps, more modern, preview before finalize".
 *
 * Flow mới (3 steps):
 *   1. UPLOAD — drag/drop xlsx + duplicate mode
 *   2. REVIEW & CONFIRM — gộp 3 step cũ:
 *        + Auto-pick PROJECT sheets (deselect được nếu cần)
 *        + Mapping table per active sheet (auto pre-filled, edit inline)
 *        + Preview top 10 rows live theo mapping hiện tại
 *        + Options + Commit button
 *   3. RESULT — done indicator + stats + download errors + retry/new
 *
 * UX cải thiện:
 *   - Auto-jump qua "Select sheet" nếu format chính thức (chỉ 1 PROJECT sheet)
 *   - Preview rows hiển thị NGAY trong step 2 (không cần đợi step 4)
 *   - Tabs nội bộ thay nested page transitions
 *   - Color-coded format detection banner
 *   - Sticky bottom action bar
 */

type Step = "upload" | "review" | "result";
type DuplicateMode = "skip" | "upsert" | "error";

const STEP_ORDER: Step[] = ["upload", "review", "result"];
const STEP_LABELS: Record<Step, string> = {
  upload: "Tải file",
  review: "Xem trước & Khớp cột",
  result: "Kết quả",
};

const DUP_LABEL: Record<DuplicateMode, string> = {
  skip: "Bỏ qua BOM code đã tồn tại",
  upsert: "Cập nhật BOM code đã tồn tại",
  error: "Báo lỗi nếu trùng",
};

// Mapping target → Vietnamese label cho preview header
const TARGET_LABELS: Record<string, string> = {
  componentSku: "BOM gốc (SKU)",
  componentSeq: "ID Number",
  qtyPerParent: "Quantity (hệ số)",
  description: "Ghi chú",
  category: "Category",
  size: "Quy cách (tham khảo)",
  supplierItemCode: "NCC",
  assignedToName: "PIC",
  totalQty: "SL",
  notes: "Note phụ",
};

export function BomImportWizard() {
  const [step, setStep] = React.useState<Step>("upload");
  const [file, setFile] = React.useState<File | null>(null);
  const [duplicateMode, setDuplicateMode] =
    React.useState<DuplicateMode>("skip");
  const [uploadData, setUploadData] = React.useState<BomUploadResult | null>(
    null,
  );
  const [selectedSheets, setSelectedSheets] = React.useState<string[]>([]);
  const [mappings, setMappings] = React.useState<
    Record<string, Record<string, string | null>>
  >({});
  const [autoCreateMissingItems, setAutoCreateMissingItems] =
    React.useState<boolean>(true); // V3.7.33 — default ON (most common case)
  const [activeSheetIdx, setActiveSheetIdx] = React.useState(0);

  const upload = useUploadBomImport();
  const commit = useCommitBomImport();
  const statusQuery = useBomImportStatus(
    uploadData?.batchId && step === "result" ? uploadData.batchId : null,
  );

  const onDrop = React.useCallback((files: File[]) => {
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

  const handleUpload = async () => {
    if (!file) return;
    try {
      const res = await upload.mutateAsync({ file, duplicateMode });
      setUploadData(res);
      const kinds = res.officialFormat?.sheetKinds ?? {};
      const isOfficial = res.officialFormat?.isOfficial === true;
      const sheets = res.sheets ?? [];
      const initialSelected = isOfficial
        ? sheets
            .filter((s) => kinds[s.sheetName] === "PROJECT")
            .map((s) => s.sheetName)
        : sheets.map((s) => s.sheetName);
      setSelectedSheets(
        initialSelected.length > 0
          ? initialSelected
          : sheets.map((s) => s.sheetName),
      );
      setMappings(res.autoMappings);
      if (res.reused) {
        toast.info("File đã upload trong 1 giờ — dùng lại phiên cũ.");
      } else {
        toast.success(
          `Đọc ${res.sheets.length} sheets · ${res.sheets.reduce(
            (a, s) => a + s.rowCount,
            0,
          )} dòng. Auto-mapping ${countMapped(res.autoMappings)} cột.`,
        );
      }
      setStep("review");
    } catch (err) {
      toast.error(`Upload thất bại: ${(err as Error).message}`);
    }
  };

  const handleCommit = async () => {
    if (!uploadData) return;
    // Validate required mappings
    for (const sheet of selectedSheets) {
      const m = mappings[sheet] ?? {};
      const targets = new Set(Object.values(m).filter(Boolean));
      if (!targets.has("componentSku") || !targets.has("qtyPerParent")) {
        toast.error(
          `Sheet "${sheet}" thiếu cột bắt buộc: BOM gốc (SKU) hoặc Quantity (hệ số).`,
        );
        setActiveSheetIdx(selectedSheets.indexOf(sheet));
        return;
      }
    }
    try {
      await commit.mutateAsync({
        batchId: uploadData.batchId,
        body: {
          selectedSheets,
          mappings: mappings as unknown as Record<
            string,
            Record<
              string,
              | "componentSku"
              | "componentSeq"
              | "supplierItemCode"
              | "qtyPerParent"
              | "description"
              | "size"
              | "notes"
              | "category"
              | "totalQty"
              | "assignedToName"
              | null
            >
          >,
          autoCreateMissingItems,
          duplicateMode,
        },
      });
      toast.info("Đang import nền — theo dõi tiến độ ở đây.");
      setStep("result");
    } catch (err) {
      toast.error(`Commit thất bại: ${(err as Error).message}`);
    }
  };

  const activeSheetName = selectedSheets[activeSheetIdx] ?? "";
  const activeSheet: BomImportSheet | undefined = uploadData?.sheets?.find(
    (s) => s.sheetName === activeSheetName,
  );

  const totalSelectedRows = React.useMemo(() => {
    if (!uploadData?.sheets) return 0;
    return uploadData.sheets
      .filter((s) => selectedSheets.includes(s.sheetName))
      .reduce((acc, s) => acc + s.rowCount, 0);
  }, [uploadData, selectedSheets]);

  const progressPct = React.useMemo(() => {
    const d = statusQuery.data;
    if (!d || d.rowTotal === 0) return 0;
    return Math.round(((d.rowSuccess + d.rowFail) / d.rowTotal) * 100);
  }, [statusQuery.data]);

  const resetAll = () => {
    setStep("upload");
    setFile(null);
    setUploadData(null);
    setSelectedSheets([]);
    setMappings({});
    upload.reset();
    commit.reset();
  };

  return (
    <div className="space-y-5">
      <StepIndicator step={step} />

      {step === "upload" && (
        <UploadStep
          file={file}
          duplicateMode={duplicateMode}
          setDuplicateMode={setDuplicateMode}
          getRootProps={getRootProps}
          getInputProps={getInputProps}
          isDragActive={isDragActive}
          loading={upload.isPending}
          onUpload={() => void handleUpload()}
        />
      )}

      {step === "review" && uploadData && (
        <ReviewStep
          uploadData={uploadData}
          selectedSheets={selectedSheets}
          setSelectedSheets={setSelectedSheets}
          activeSheetIdx={activeSheetIdx}
          setActiveSheetIdx={setActiveSheetIdx}
          activeSheet={activeSheet}
          mappings={mappings}
          setMappings={setMappings}
          autoCreateMissingItems={autoCreateMissingItems}
          setAutoCreateMissingItems={setAutoCreateMissingItems}
          duplicateMode={duplicateMode}
          totalSelectedRows={totalSelectedRows}
          onBack={() => setStep("upload")}
          onCommit={() => void handleCommit()}
          committing={commit.isPending}
        />
      )}

      {step === "result" && uploadData && (
        <ResultStep
          status={statusQuery.data?.status ?? "committing"}
          progressPct={progressPct}
          rowSuccess={statusQuery.data?.rowSuccess ?? 0}
          rowFail={statusQuery.data?.rowFail ?? 0}
          rowTotal={statusQuery.data?.rowTotal ?? totalSelectedRows}
          errorMessage={statusQuery.data?.errorMessage ?? null}
          errorPreview={statusQuery.data?.errorPreview ?? []}
          batchId={uploadData.batchId}
          onReset={resetAll}
        />
      )}
    </div>
  );
}

// =====================================================================
// STEP 1: UPLOAD
// =====================================================================

interface UploadStepProps {
  file: File | null;
  duplicateMode: DuplicateMode;
  setDuplicateMode: (m: DuplicateMode) => void;
  getRootProps: ReturnType<typeof useDropzone>["getRootProps"];
  getInputProps: ReturnType<typeof useDropzone>["getInputProps"];
  isDragActive: boolean;
  loading: boolean;
  onUpload: () => void;
}

function UploadStep({
  file,
  duplicateMode,
  setDuplicateMode,
  getRootProps,
  getInputProps,
  isDragActive,
  loading,
  onUpload,
}: UploadStepProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="border-b border-zinc-100 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 px-6 py-5 dark:border-zinc-800 dark:from-indigo-950/30 dark:via-zinc-900 dark:to-cyan-950/30">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-200 dark:shadow-indigo-950">
            <UploadCloud className="h-5 w-5 text-white" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Tải file Excel BOM
            </h2>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Định dạng .xlsx · Tối đa{" "}
              {LIMITS.FILE_UPLOAD_MAX_BYTES / 1024 / 1024}MB · Khuyến nghị template{" "}
              <strong>"Bản chính thức"</strong> (10 cột chuẩn)
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-6">
        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={cn(
            "group flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all duration-200",
            isDragActive
              ? "border-indigo-500 bg-indigo-50/50 ring-4 ring-indigo-100 dark:border-indigo-400 dark:bg-indigo-950/30 dark:ring-indigo-900/40"
              : file
                ? "border-emerald-400 bg-emerald-50/30 dark:border-emerald-500 dark:bg-emerald-950/30"
                : "border-zinc-300 bg-zinc-50/50 hover:border-indigo-400 hover:bg-indigo-50/30 dark:border-zinc-700 dark:bg-zinc-800/60 dark:hover:border-indigo-400 dark:hover:bg-indigo-950/30",
          )}
        >
          <input {...getInputProps()} />
          {file ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-4 ring-emerald-50 dark:bg-emerald-950/40 dark:ring-emerald-950/20">
                <FileSpreadsheet className="h-7 w-7 text-emerald-600" aria-hidden />
              </div>
              <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{file.name}</p>
              <p className="mt-1 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                {(file.size / 1024).toLocaleString("vi-VN", {
                  maximumFractionDigits: 0,
                })}{" "}
                KB · sẵn sàng tải lên
              </p>
              <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">Click để chọn file khác</p>
            </div>
          ) : (
            <div className="text-center">
              <UploadCloud
                className={cn(
                  "mx-auto mb-3 h-12 w-12 transition-colors",
                  isDragActive
                    ? "text-indigo-500"
                    : "text-zinc-400 group-hover:text-indigo-500 dark:text-zinc-500 dark:group-hover:text-indigo-400",
                )}
                aria-hidden
              />
              <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {isDragActive ? "Thả file vào đây" : "Kéo thả file Excel BOM"}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                hoặc click để chọn từ máy tính
              </p>
            </div>
          )}
        </div>

        {/* Duplicate mode */}
        <div className="space-y-1.5">
          <Label htmlFor="dup" uppercase>
            Xử lý BOM code trùng
          </Label>
          <Select
            value={duplicateMode}
            onValueChange={(v) => setDuplicateMode(v as DuplicateMode)}
          >
            <SelectTrigger id="dup">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["skip", "upsert", "error"] as DuplicateMode[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {DUP_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Nếu sheet có BOM code (sanitized từ tên sheet) đã tồn tại trong DB.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50 px-6 py-3.5 dark:border-zinc-800 dark:bg-zinc-800/60">
        <Button onClick={onUpload} disabled={!file || loading} size="lg">
          {loading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
              Đang đọc file…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden />
              Tải lên & Xem trước
            </>
          )}
        </Button>
      </div>
    </section>
  );
}

// =====================================================================
// STEP 2: REVIEW (combined sheet select + mapping + preview)
// =====================================================================

interface ReviewStepProps {
  uploadData: BomUploadResult;
  selectedSheets: string[];
  setSelectedSheets: (s: string[]) => void;
  activeSheetIdx: number;
  setActiveSheetIdx: (n: number) => void;
  activeSheet: BomImportSheet | undefined;
  mappings: Record<string, Record<string, string | null>>;
  setMappings: React.Dispatch<
    React.SetStateAction<Record<string, Record<string, string | null>>>
  >;
  autoCreateMissingItems: boolean;
  setAutoCreateMissingItems: (v: boolean) => void;
  duplicateMode: DuplicateMode;
  totalSelectedRows: number;
  onBack: () => void;
  onCommit: () => void;
  committing: boolean;
}

function ReviewStep({
  uploadData,
  selectedSheets,
  setSelectedSheets,
  activeSheetIdx,
  setActiveSheetIdx,
  activeSheet,
  mappings,
  setMappings,
  autoCreateMissingItems,
  setAutoCreateMissingItems,
  duplicateMode,
  totalSelectedRows,
  onBack,
  onCommit,
  committing,
}: ReviewStepProps) {
  const officialFormat = uploadData.officialFormat;
  const totalSheets = uploadData.sheets?.length ?? 0;
  const activeMapping = mappings[activeSheet?.sheetName ?? ""] ?? {};
  const mappedCount = Object.values(activeMapping).filter(Boolean).length;
  const requiredOk =
    Object.values(activeMapping).includes("componentSku") &&
    Object.values(activeMapping).includes("qtyPerParent");

  return (
    <div className="space-y-4">
      {/* Format detection banner */}
      {officialFormat && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-sm",
            officialFormat.isOfficial
              ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 dark:border-emerald-800 dark:from-emerald-950/40 dark:to-green-950/40"
              : "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 dark:border-amber-800 dark:from-amber-950/40 dark:to-orange-950/40",
          )}
        >
          {officialFormat.isOfficial ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          )}
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm font-semibold",
                officialFormat.isOfficial ? "text-emerald-900 dark:text-emerald-400" : "text-amber-900 dark:text-amber-400",
              )}
            >
              {officialFormat.isOfficial
                ? "🎯 File đúng template chính thức"
                : "File không khớp template chính thức"}
            </p>
            <p
              className={cn(
                "mt-0.5 text-xs",
                officialFormat.isOfficial ? "text-emerald-800 dark:text-emerald-400" : "text-amber-800 dark:text-amber-400",
              )}
            >
              {officialFormat.reason}
            </p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<TableIcon className="h-3.5 w-3.5" aria-hidden />}
          label="Sheets phát hiện"
          value={totalSheets}
        />
        <StatCard
          icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
          label="Sheets sẽ import"
          value={selectedSheets.length}
          accent="indigo"
        />
        <StatCard
          icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
          label="Tổng dòng"
          value={totalSelectedRows.toLocaleString("vi-VN")}
        />
        <StatCard
          icon={<Settings2 className="h-3.5 w-3.5" aria-hidden />}
          label="Đã map cột"
          value={`${mappedCount}/${activeSheet?.headersDetected?.length ?? 0}`}
          accent={requiredOk ? "emerald" : "amber"}
        />
      </div>

      {/* Sheets selector — show only if >1 sheet */}
      {totalSheets > 1 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2 flex items-center gap-2">
            <TableIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Chọn sheet sẽ import ({selectedSheets.length}/{totalSheets})
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {(uploadData.sheets ?? []).map((s) => {
              const checked = selectedSheets.includes(s.sheetName);
              const kind = officialFormat?.sheetKinds?.[s.sheetName];
              return (
                <button
                  key={s.sheetName}
                  type="button"
                  onClick={() => {
                    if (checked) {
                      setSelectedSheets(
                        selectedSheets.filter((x) => x !== s.sheetName),
                      );
                    } else {
                      setSelectedSheets([...selectedSheets, s.sheetName]);
                    }
                  }}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-all",
                    checked
                      ? "border-indigo-300 bg-indigo-50 text-indigo-900 shadow-sm dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60",
                  )}
                >
                  <Checkbox checked={checked} className="h-3.5 w-3.5" />
                  <span className="truncate">{s.sheetName}</span>
                  <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-600 dark:bg-zinc-950/40 dark:text-zinc-400">
                    {s.rowCount} dòng
                  </span>
                  {kind === "PROJECT" && (
                    <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                      Project
                    </span>
                  )}
                  {kind === "MASTER_MATERIAL_PROCESS" && (
                    <span className="rounded bg-zinc-100 px-1 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      Master
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Active sheet mapping + preview */}
      {activeSheet && (
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {/* Sheet tabs (if multiple selected) */}
          {selectedSheets.length > 1 && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-zinc-100 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-800/60">
              {selectedSheets.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setActiveSheetIdx(i)}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center rounded px-3 text-xs font-medium transition-colors",
                    i === activeSheetIdx
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Mapping table */}
          <div className="border-b border-zinc-100 p-4 dark:border-zinc-800">
            <div className="mb-2 flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Khớp cột Excel → Field hệ thống
              </h3>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                · Auto-mapping {mappedCount}/{activeSheet.headersDetected?.length ?? 0}
              </span>
            </div>
            <BomColumnMapperStep
              sheetName={activeSheet.sheetName}
              sourceHeaders={activeSheet.headersDetected ?? []}
              sampleRows={(activeSheet.previewRows as unknown[][]) ?? []}
              initialMapping={mappings[activeSheet.sheetName] ?? {}}
              onChange={(m) =>
                setMappings((prev) => ({ ...prev, [activeSheet.sheetName]: m }))
              }
              headerRow={activeSheet.headerRow}
              headerWarning={activeSheet.headerWarning ?? null}
              topTitle={activeSheet.topTitle ?? null}
            />
          </div>

          {/* Preview rows live */}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Eye className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Xem trước dữ liệu sẽ import
              </h3>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                · 5 dòng đầu, mapped theo Excel
              </span>
            </div>
            <PreviewTable
              headers={activeSheet.headersDetected ?? []}
              rows={(activeSheet.previewRows as unknown[][]) ?? []}
              mapping={activeMapping}
            />
          </div>
        </section>
      )}

      {/* Options + Action bar */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 hover:bg-indigo-50/70 transition-colors dark:border-indigo-900 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50">
          <Checkbox
            checked={autoCreateMissingItems}
            onCheckedChange={(v) => setAutoCreateMissingItems(v === true)}
            className="mt-0.5"
            aria-label="Tự tạo item chưa tồn tại"
          />
          <span>
            <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Tự tạo vật tư mới (khuyến nghị BẬT)
            </span>
            <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-400">
              SKU mới trong file sẽ tự được thêm vào danh mục vật tư (status DRAFT, UoM PCS)
              rồi link vào BOM line. Tắt nếu muốn lỗi khi thiếu master.
            </span>
          </span>
        </label>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Tải file khác
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Sẽ import <strong className="text-zinc-900 tabular-nums dark:text-zinc-50">{totalSelectedRows.toLocaleString("vi-VN")}</strong> dòng từ{" "}
              <strong className="text-zinc-900 dark:text-zinc-50">{selectedSheets.length}</strong> sheet · {DUP_LABEL[duplicateMode]}
            </span>
            <Button
              onClick={onCommit}
              disabled={committing || !requiredOk || selectedSheets.length === 0}
              size="lg"
            >
              {committing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                  Đang gửi…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden />
                  Xác nhận import
                </>
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

// Preview table — renders top 5 rows but ONLY shows columns that are mapped
function PreviewTable({
  headers,
  rows,
  mapping,
}: {
  headers: string[];
  rows: unknown[][];
  mapping: Record<string, string | null>;
}) {
  const mappedCols = headers
    .map((h, idx) => ({ header: h, target: mapping[h] ?? null, idx }))
    .filter((c) => c.target);

  if (mappedCols.length === 0) {
    return (
      <EmptyState
        preset="no-data"
        title="Chưa có cột nào được map"
        description="Bấm vào dropdown ở phần 'Khớp cột' phía trên để chọn target field."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800 dark:to-zinc-800/60">
          <tr>
            <th className="border-b border-zinc-200 px-2 py-2 text-left text-[10px] font-medium uppercase text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              #
            </th>
            {mappedCols.map((c) => (
              <th
                key={c.header}
                className="border-b border-zinc-200 px-2 py-2 text-left text-[10px] font-medium uppercase text-indigo-700 dark:border-zinc-700 dark:text-indigo-400"
                title={`Excel: ${c.header} → DB: ${c.target}`}
              >
                {TARGET_LABELS[c.target ?? ""] ?? c.target}
                <span className="ml-1 text-[9px] text-zinc-400 dark:text-zinc-500">({c.header})</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={mappedCols.length + 1}
                className="px-2 py-4 text-center text-xs text-zinc-400 dark:text-zinc-500"
              >
                Sheet trống.
              </td>
            </tr>
          ) : (
            rows.slice(0, 5).map((r, ri) => (
              <tr key={ri} className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60">
                <td className="px-2 py-1.5 font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                  {ri + 1}
                </td>
                {mappedCols.map((c) => (
                  <td
                    key={c.header}
                    className="max-w-[160px] truncate px-2 py-1.5 text-zinc-700 dark:text-zinc-300"
                    title={String(r[c.idx] ?? "")}
                  >
                    {String(r[c.idx] ?? "—")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// =====================================================================
// STEP 3: RESULT
// =====================================================================

function ResultStep({
  status,
  progressPct,
  rowSuccess,
  rowFail,
  rowTotal,
  errorMessage,
  errorPreview,
  batchId,
  onReset,
}: {
  status: string;
  progressPct: number;
  rowSuccess: number;
  rowFail: number;
  rowTotal: number;
  errorMessage: string | null;
  errorPreview: BomImportErrorPreview[];
  batchId: string;
  onReset: () => void;
}) {
  const isDone = status === "done";
  const isFailed = status === "failed";

  if (isDone && rowTotal === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <EmptyState
          preset="no-data"
          title="Import không có dòng nào"
          description="File đọc xong nhưng 0 dòng dữ liệu được nhận. Kiểm tra lại header row/mapping cột."
        />
        <div className="mt-4 flex justify-center">
          <Button onClick={onReset}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Thử file khác
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {/* Hero */}
      <div
        className={cn(
          "overflow-hidden rounded-xl border shadow-sm",
          isDone
            ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 dark:border-emerald-800 dark:from-emerald-950/40 dark:to-green-950/40"
            : isFailed
              ? "border-red-200 bg-gradient-to-br from-red-50 to-rose-50 dark:border-red-800 dark:from-red-950/40 dark:to-rose-950/40"
              : "border-indigo-200 bg-gradient-to-br from-indigo-50 to-cyan-50 dark:border-indigo-800 dark:from-indigo-950/40 dark:to-cyan-950/40",
        )}
      >
        <div className="flex items-center gap-4 p-6">
          {isDone ? (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 ring-4 ring-emerald-50 dark:bg-emerald-950/40 dark:ring-emerald-950/20">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
            </div>
          ) : isFailed ? (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-red-100 ring-4 ring-red-50 dark:bg-red-950/40 dark:ring-red-950/20">
              <AlertTriangle className="h-8 w-8 text-red-600" aria-hidden />
            </div>
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" aria-hidden />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {isDone
                ? rowFail > 0
                  ? `Hoàn tất với ${rowFail} dòng lỗi`
                  : "🎉 Import BOM thành công"
                : isFailed
                  ? "Import thất bại"
                  : "Đang import nền…"}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Trạng thái: <span className="font-mono">{status}</span> · Batch{" "}
              <span className="font-mono">{batchId.slice(0, 8)}…</span>
            </p>
          </div>
        </div>
        {!isFailed && (
          <div className="border-t border-white/60 bg-white/40 px-6 py-3 dark:border-zinc-700/60 dark:bg-zinc-900/40">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/60 dark:bg-zinc-700/60">
              <div
                className={cn(
                  "h-full transition-all duration-500",
                  isDone ? "bg-emerald-500" : "bg-indigo-500",
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-zinc-700 tabular-nums dark:text-zinc-300">
              <span>
                {(rowSuccess + rowFail).toLocaleString("vi-VN")}/
                {rowTotal.toLocaleString("vi-VN")} dòng
              </span>
              <span>{progressPct}%</span>
            </div>
          </div>
        )}
      </div>

      {isFailed && errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Tổng" value={rowTotal.toLocaleString("vi-VN")} />
        <StatCard
          label="Thành công"
          value={rowSuccess.toLocaleString("vi-VN")}
          accent="emerald"
        />
        <StatCard
          label="Lỗi"
          value={rowFail.toLocaleString("vi-VN")}
          accent={rowFail > 0 ? "red" : "muted"}
        />
      </div>

      {/* Error detail */}
      {errorPreview.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/60">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Lỗi chi tiết
              <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                ({errorPreview.length}
                {rowFail > errorPreview.length
                  ? `/${rowFail.toLocaleString("vi-VN")} đầu tiên`
                  : ""}
                )
              </span>
            </h3>
            <a
              href={downloadBomImportErrorsUrl(batchId)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Tải full errors.xlsx ↓
            </a>
          </div>
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-white dark:bg-zinc-900">
                <tr className="border-b border-zinc-200 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th className="px-3 py-2">Sheet</th>
                  <th className="px-3 py-2 text-right">Dòng</th>
                  <th className="px-3 py-2">Cột</th>
                  <th className="px-3 py-2">Lý do</th>
                </tr>
              </thead>
              <tbody>
                {errorPreview.map((e, i) => (
                  <tr
                    key={`${e.sheet}-${e.rowNumber}-${i}`}
                    className="border-b border-zinc-100 hover:bg-zinc-50 last:border-b-0 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
                  >
                    <td className="truncate px-3 py-1.5 font-mono text-zinc-700 dark:text-zinc-300">
                      {e.sheet}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                      {e.rowNumber}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-zinc-600 dark:text-zinc-400">
                      {e.field}
                    </td>
                    <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Button variant="ghost" onClick={onReset}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Import file khác
        </Button>
        {isDone && (
          <a
            href="/bom"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Xem danh sách BOM →
          </a>
        )}
      </div>
    </section>
  );
}

// =====================================================================
// SHARED COMPONENTS
// =====================================================================

function StepIndicator({ step }: { step: Step }) {
  const activeIdx = STEP_ORDER.indexOf(step);
  return (
    <ol
      className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-5 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      aria-label="Tiến trình import BOM"
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
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums transition-all",
                state === "current" &&
                  "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200",
                state === "done" &&
                  "bg-gradient-to-br from-emerald-500 to-teal-500 text-white",
                state === "pending" &&
                  "border-2 border-zinc-200 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500",
              )}
            >
              {state === "done" ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                i + 1
              )}
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-sm font-semibold",
                state === "current" && "text-zinc-900 dark:text-zinc-50",
                state === "done" && "text-emerald-700 dark:text-emerald-400",
                state === "pending" && "text-zinc-400 dark:text-zinc-500",
              )}
            >
              {STEP_LABELS[s]}
            </span>
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "mx-2 h-1 flex-1 rounded-full transition-colors",
                  state === "done"
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                    : "bg-zinc-200 dark:bg-zinc-700",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent = "muted",
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | string;
  accent?: "muted" | "emerald" | "indigo" | "amber" | "red";
}) {
  const accentClass = {
    muted: "border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400",
    amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
    red: "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400",
  }[accent];
  return (
    <div className={cn("rounded-xl border p-3 shadow-sm", accentClass)}>
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function countMapped(am: Record<string, Record<string, string | null>>): number {
  let n = 0;
  for (const sheet of Object.values(am)) {
    for (const v of Object.values(sheet)) {
      if (v) n++;
    }
  }
  return n;
}
