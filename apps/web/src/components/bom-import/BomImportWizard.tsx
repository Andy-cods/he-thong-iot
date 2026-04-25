"use client";

import * as React from "react";
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
import { SheetSelectorStep } from "./SheetSelectorStep";
import { cn } from "@/lib/utils";

type Step = "upload" | "select" | "map" | "preview" | "result";
type DuplicateMode = "skip" | "upsert" | "error";

const STEP_ORDER: Step[] = ["upload", "select", "map", "preview", "result"];
const STEP_LABELS: Record<Step, string> = {
  upload: "Tải file",
  select: "Chọn sheet",
  map: "Khớp cột",
  preview: "Kiểm tra",
  result: "Kết quả",
};

const DUP_LABEL: Record<DuplicateMode, string> = {
  skip: "Bỏ qua BOM code đã tồn tại",
  upsert: "Cập nhật BOM code đã tồn tại",
  error: "Báo lỗi nếu trùng",
};

/**
 * V2 BomImportWizard — 5-step extend từ ImportWizard V2.
 * Stepper V2 dot+connector, flow:
 *   1. Upload .xlsx
 *   2. Select sheet(s) với preview 3 rows mỗi sheet
 *   3. Column mapping per-sheet (BOM synonym dict)
 *   4. Preview + options (auto-create missing items + stats)
 *   5. Result success/errors + download errors.xlsx
 */
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
    React.useState<boolean>(false);
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
      // V3: nếu format chính thức → pre-select PROJECT sheets, exclude
      // MASTER_MATERIAL_PROCESS (sẽ import ở phase 2). Format không chính
      // thức → fallback select tất cả sheets như V2.
      const kinds = res.officialFormat?.sheetKinds ?? {};
      const isOfficial = res.officialFormat?.isOfficial === true;
      const initialSelected = isOfficial
        ? res.sheets
            .filter((s) => kinds[s.sheetName] === "PROJECT")
            .map((s) => s.sheetName)
        : res.sheets.map((s) => s.sheetName);
      setSelectedSheets(
        initialSelected.length > 0
          ? initialSelected
          : res.sheets.map((s) => s.sheetName),
      );
      // Seed mappings từ autoMappings
      setMappings(res.autoMappings);
      if (res.reused) {
        toast.info("File đã upload trong 1 giờ — dùng lại phiên cũ.");
      } else {
        toast.success(
          `Đọc ${res.sheets.length} sheets · ${res.sheets.reduce(
            (a, s) => a + s.rowCount,
            0,
          )} dòng.`,
        );
      }
      setStep("select");
    } catch (err) {
      toast.error(`Upload thất bại: ${(err as Error).message}`);
    }
  };

  const handleGoMap = () => {
    if (selectedSheets.length === 0) {
      toast.error("Chọn ít nhất 1 sheet để import.");
      return;
    }
    setActiveSheetIdx(0);
    setStep("map");
  };

  const handleGoPreview = () => {
    // Check tất cả sheets được chọn có map đủ required
    for (const sheet of selectedSheets) {
      const m = mappings[sheet] ?? {};
      const targets = new Set(Object.values(m).filter(Boolean));
      if (!targets.has("componentSku") || !targets.has("qtyPerParent")) {
        toast.error(
          `Sheet "${sheet}" chưa map đủ componentSku + qtyPerParent.`,
        );
        setActiveSheetIdx(selectedSheets.indexOf(sheet));
        return;
      }
    }
    setStep("preview");
  };

  const handleCommit = async () => {
    if (!uploadData) return;
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
              | null
            >
          >,
          autoCreateMissingItems,
          duplicateMode,
        },
      });
      toast.info("Đang commit nền — theo dõi tiến độ ở đây.");
      setStep("result");
    } catch (err) {
      toast.error(`Commit thất bại: ${(err as Error).message}`);
    }
  };

  const activeSheetName = selectedSheets[activeSheetIdx] ?? "";
  const activeSheet: BomImportSheet | undefined = uploadData?.sheets.find(
    (s) => s.sheetName === activeSheetName,
  );

  const progressPct = React.useMemo(() => {
    const d = statusQuery.data;
    if (!d || d.rowTotal === 0) return 0;
    return Math.round(((d.rowSuccess + d.rowFail) / d.rowTotal) * 100);
  }, [statusQuery.data]);

  const goBack = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]!);
  };

  const totalSelectedRows = React.useMemo(() => {
    if (!uploadData) return 0;
    return uploadData.sheets
      .filter((s) => selectedSheets.includes(s.sheetName))
      .reduce((acc, s) => acc + s.rowCount, 0);
  }, [uploadData, selectedSheets]);

  return (
    <div className="space-y-6">
      <StepIndicator step={step} />

      {step === "upload" && (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
          <div
            {...getRootProps()}
            className={cn(
              "flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 transition-colors duration-150",
              isDragActive
                ? "border-indigo-500 bg-indigo-50/30"
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
                  Kéo thả file Excel BOM vào đây
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
            </div>
          </div>

          <div className="flex justify-end border-t border-zinc-200 pt-4">
            <Button
              onClick={() => void handleUpload()}
              disabled={!file || upload.isPending}
            >
              {upload.isPending ? "Đang đọc file…" : "Tiếp theo — Chọn sheet"}
            </Button>
          </div>
        </section>
      )}

      {step === "select" && uploadData && (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
          {uploadData.officialFormat ? (
            <div
              role="status"
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                uploadData.officialFormat.isOfficial
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800",
              )}
            >
              {uploadData.officialFormat.isOfficial ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              )}
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {uploadData.officialFormat.isOfficial
                    ? "🎯 Đã nhận diện file Bản chính thức"
                    : "Không nhận diện được template chính thức"}
                </p>
                <p className="text-xs">{uploadData.officialFormat.reason}</p>
                {Object.keys(uploadData.officialFormat.sheetKinds).length > 0 ? (
                  <ul className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {Object.entries(uploadData.officialFormat.sheetKinds).map(
                      ([name, kind]) => (
                        <li
                          key={name}
                          className={cn(
                            "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono",
                            kind === "PROJECT"
                              ? "border-emerald-300 bg-white text-emerald-700"
                              : kind === "MASTER_MATERIAL_PROCESS"
                                ? "border-zinc-300 bg-white text-zinc-500"
                                : "border-amber-300 bg-white text-amber-700",
                          )}
                        >
                          {name} →{" "}
                          {kind === "PROJECT"
                            ? "Project BOM"
                            : kind === "MASTER_MATERIAL_PROCESS"
                              ? "Master (skip phase 1)"
                              : "Không xác định"}
                        </li>
                      ),
                    )}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}
          <SheetSelectorStep
            sheets={uploadData.sheets}
            selectedSheets={selectedSheets}
            onChange={setSelectedSheets}
          />
          <div className="flex justify-between border-t border-zinc-200 pt-4">
            <Button variant="ghost" onClick={goBack}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Quay lại
            </Button>
            <Button onClick={handleGoMap} disabled={selectedSheets.length === 0}>
              Tiếp theo — Khớp cột ({selectedSheets.length} sheet)
            </Button>
          </div>
        </section>
      )}

      {step === "map" && uploadData && activeSheet && (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
          {selectedSheets.length > 1 && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-zinc-100 pb-2">
              {selectedSheets.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setActiveSheetIdx(i)}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center rounded-sm px-2 text-sm font-medium transition-colors",
                    i === activeSheetIdx
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:bg-zinc-100",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <BomColumnMapperStep
            sheetName={activeSheetName}
            sourceHeaders={activeSheet.headersDetected}
            sampleRows={activeSheet.previewRows as unknown[][]}
            initialMapping={mappings[activeSheetName] ?? {}}
            onChange={(m) =>
              setMappings((prev) => ({ ...prev, [activeSheetName]: m }))
            }
            headerRow={activeSheet.headerRow}
            headerWarning={activeSheet.headerWarning ?? null}
            topTitle={activeSheet.topTitle ?? null}
          />

          <div className="flex justify-between border-t border-zinc-200 pt-4">
            <Button variant="ghost" onClick={goBack}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Quay lại
            </Button>
            <div className="flex items-center gap-2">
              {activeSheetIdx < selectedSheets.length - 1 ? (
                <Button
                  onClick={() => setActiveSheetIdx((i) => i + 1)}
                  variant="secondary"
                >
                  Sheet tiếp →
                </Button>
              ) : null}
              <Button onClick={handleGoPreview}>Tiếp theo — Kiểm tra</Button>
            </div>
          </div>
        </section>
      )}

      {step === "preview" && uploadData && (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
          <header>
            <h2 className="text-md font-semibold text-zinc-900">Kiểm tra</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Xem lại trước khi commit nền (worker sẽ import bất đồng bộ).
            </p>
          </header>

          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Sheet sẽ tạo BOM"
              value={selectedSheets.length}
            />
            <StatCard label="Tổng dòng" value={totalSelectedRows} />
            <StatCard
              label="Duplicate mode"
              value={DUP_LABEL[duplicateMode]}
              isText
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-zinc-200 bg-white p-3 hover:bg-zinc-50">
            <Checkbox
              checked={autoCreateMissingItems}
              onCheckedChange={(v) => setAutoCreateMissingItems(v === true)}
              className="mt-0.5"
              aria-label="Tự tạo item chưa tồn tại"
            />
            <span>
              <span className="block text-base font-medium text-zinc-900">
                Tự tạo vật tư chưa tồn tại
              </span>
              <span className="mt-0.5 block text-sm text-zinc-500">
                Nếu SKU trong file chưa có trong catalog, worker sẽ tạo item
                mới tạm (status DRAFT, UoM PCS) rồi link vào BOM line.
              </span>
            </span>
          </label>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <strong>{selectedSheets.length}</strong> sheet · ước tính{" "}
            <strong>{totalSelectedRows}</strong> linh kiện
            {autoCreateMissingItems && <> + items mới nếu cần</>}.
          </div>

          <div className="flex justify-between border-t border-zinc-200 pt-4">
            <Button variant="ghost" onClick={() => setStep("map")}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Quay lại
            </Button>
            <Button
              onClick={() => void handleCommit()}
              disabled={commit.isPending}
            >
              {commit.isPending
                ? "Đang gửi…"
                : `Commit ${selectedSheets.length} BOM`}
            </Button>
          </div>
        </section>
      )}

      {step === "result" && uploadData && (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
          <ResultPanel
            status={statusQuery.data?.status ?? "committing"}
            progressPct={progressPct}
            rowSuccess={statusQuery.data?.rowSuccess ?? 0}
            rowFail={statusQuery.data?.rowFail ?? 0}
            rowTotal={statusQuery.data?.rowTotal ?? totalSelectedRows}
            errorMessage={statusQuery.data?.errorMessage ?? null}
            errorPreview={statusQuery.data?.errorPreview ?? []}
          />
          <div className="flex flex-wrap justify-between gap-2 border-t border-zinc-200 pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setStep("upload");
                setFile(null);
                setUploadData(null);
                setSelectedSheets([]);
                setMappings({});
                upload.reset();
                commit.reset();
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Import file khác
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {statusQuery.data &&
                statusQuery.data.status === "failed" && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      // Retry: quay về step 1 và giữ nguyên file để user thử lại
                      setStep("upload");
                      setUploadData(null);
                      setSelectedSheets([]);
                      setMappings({});
                      upload.reset();
                      commit.reset();
                    }}
                  >
                    Thử lại
                  </Button>
                )}
              {statusQuery.data && statusQuery.data.rowFail > 0 && (
                <a
                  href={downloadBomImportErrorsUrl(uploadData.batchId)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-base font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Tải errors.xlsx
                </a>
              )}
            </div>
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
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors",
                state === "current" && "bg-indigo-600 text-white",
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
                "whitespace-nowrap text-base font-medium",
                state === "current" && "text-zinc-900",
                state === "done" && "text-emerald-700",
                state === "pending" && "text-zinc-500",
              )}
            >
              {STEP_LABELS[s]}
            </span>
            {!isLast && (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-2 h-0.5 flex-1",
                  state === "done" ? "bg-emerald-500" : "bg-zinc-200",
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
  label,
  value,
  tone = "muted",
  isText,
}: {
  label: string;
  value: number | string;
  tone?: "success" | "error" | "muted";
  isText?: boolean;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "error"
        ? "text-red-700"
        : "text-zinc-900";
  const displayValue =
    typeof value === "number" ? value.toLocaleString("vi-VN") : value;
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-semibold",
          isText ? "text-base" : "text-xl tabular-nums",
          toneClass,
        )}
      >
        {displayValue}
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
  errorPreview,
}: {
  status: string;
  progressPct: number;
  rowSuccess: number;
  rowFail: number;
  rowTotal: number;
  errorMessage: string | null;
  errorPreview: BomImportErrorPreview[];
}) {
  const isDone = status === "done";
  const isFailed = status === "failed";
  // Empty-state: import xong nhưng không có row nào (file rỗng hoặc mapping sai).
  if (isDone && rowTotal === 0) {
    return (
      <EmptyState
        preset="no-data"
        title="Import không có dòng nào"
        description="File đọc xong nhưng 0 dòng dữ liệu được nhận. Kiểm tra lại header row/mapping cột, hoặc thử file khác."
      />
    );
  }
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
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-500" />
        )}
        <div>
          <div className="text-xl font-semibold tracking-tight text-zinc-900">
            {isDone
              ? rowFail > 0
                ? `Hoàn tất với ${rowFail} dòng lỗi`
                : "Hoàn tất import BOM"
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
              className="h-full bg-indigo-500 transition-all"
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

      {errorPreview.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-900">
              Lỗi chi tiết
              <span className="ml-1.5 text-xs font-normal text-zinc-500">
                ({errorPreview.length}
                {rowFail > errorPreview.length
                  ? `/${rowFail.toLocaleString("vi-VN")} đầu tiên`
                  : ""}
                )
              </span>
            </h3>
          </div>
          <div className="max-h-[240px] overflow-auto rounded-md border border-zinc-200">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-zinc-50">
                <tr className="border-b border-zinc-200 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  <th className="px-2 py-1.5">Sheet</th>
                  <th className="px-2 py-1.5 text-right">Dòng</th>
                  <th className="px-2 py-1.5">Cột</th>
                  <th className="px-2 py-1.5">Lý do</th>
                </tr>
              </thead>
              <tbody>
                {errorPreview.map((e, i) => (
                  <tr
                    key={`${e.sheet}-${e.rowNumber}-${i}`}
                    className="border-b border-zinc-100 last:border-b-0"
                  >
                    <td className="truncate px-2 py-1.5 font-mono text-zinc-700">
                      {e.sheet}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-600">
                      {e.rowNumber}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-zinc-600">
                      {e.field}
                    </td>
                    <td className="px-2 py-1.5 text-zinc-700">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
