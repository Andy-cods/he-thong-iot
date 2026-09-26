"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  UploadCloud,
  X,
} from "lucide-react";
import { LIMITS } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtVND } from "@/components/finance/_format";
import {
  financeImportErrorsUrl,
  financeImportTemplateUrl,
  useCommitFinanceImport,
  useFinanceImportBatch,
  useUploadFinanceImport,
} from "@/hooks/useFinance";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/**
 * Phase D.4/E.5 — Wizard import Excel giao dịch thu/chi. Bám tinh thần
 * `ImportWizard.tsx` (items) nhưng ĐƠN GIẢN HƠN — 3 bước theo đúng yêu cầu
 * wave-2-finance.md §D.4 (tải mẫu → upload xem trước → xác nhận ghi), KHÔNG
 * có bước "khớp cột" (column mapping) vì header cột finance cố định + fuzzy
 * match account/category/supplier đã xử lý ở server (financeImport.ts).
 *
 * Render INLINE (không phải Dialog) vì bảng preview cần bề ngang lớn hơn giới
 * hạn `DialogContent` (max-w-lg = 512px) — dùng pattern collapsible panel như
 * trang `/items/import` (không phải modal).
 */

type Step = "upload" | "preview" | "result";

const IMPORT_STATUS_LABEL: Record<string, string> = {
  preview_ready: "Chờ xác nhận",
  committing: "Đang ghi",
  done: "Hoàn tất",
  failed: "Thất bại",
};
const STEP_ORDER: Step[] = ["upload", "preview", "result"];
const STEP_LABELS: Record<Step, string> = {
  upload: "Tải file",
  preview: "Xem trước",
  result: "Kết quả",
};

export interface ImportTransactionsWizardProps {
  onClose: () => void;
}

export function ImportTransactionsWizard({ onClose }: ImportTransactionsWizardProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);

  const upload = useUploadFinanceImport();
  const commit = useCommitFinanceImport();
  const batchQuery = useFinanceImportBatch(batchId);
  const uploadData = upload.data;
  const qc = useQueryClient();

  // V4.1 TC-21 — worker ghi xong (status `done`) mới làm mới sổ thu chi/số dư;
  // trước đây chỉ làm mới lúc bấm commit (khi worker CHƯA ghi dòng nào).
  const refreshedFor = useRef<string | null>(null);
  const batchStatus = batchQuery.data?.status;
  useEffect(() => {
    if (!batchId || refreshedFor.current === batchId) return;
    if (batchStatus === "done" || batchStatus === "failed") {
      refreshedFor.current = batchId;
      void qc.invalidateQueries({ queryKey: qk.finance.all });
    }
  }, [batchId, batchStatus, qc]);

  const onDrop = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (f.size > LIMITS.FILE_UPLOAD_MAX_BYTES) {
      toast.error(`File vượt quá ${LIMITS.FILE_UPLOAD_MAX_BYTES / 1024 / 1024}MB.`);
      return;
    }
    setFile(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
  });

  const handleUpload = async () => {
    if (!file) return;
    try {
      const res = await upload.mutateAsync(file);
      setBatchId(res.batchId);
      setStep("preview");
      toast.success(
        `Đọc xong: ${res.rowSuccess} dòng mới, ${res.duplicateCount ?? 0} dòng trùng, ${res.rowFail} dòng lỗi.`,
      );
    } catch (err) {
      toast.error(`Tải file thất bại: ${(err as Error).message}`);
    }
  };

  const handleCommit = async () => {
    if (!batchId) return;
    try {
      await commit.mutateAsync(batchId);
      setStep("result");
      toast.info("Đang import nền — bạn có thể theo dõi tiến độ ở đây.");
    } catch (err) {
      toast.error(`Ghi dữ liệu thất bại: ${(err as Error).message}`);
    }
  };

  const resetAll = () => {
    setStep("upload");
    setFile(null);
    setBatchId(null);
    upload.reset();
  };

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:p-6">
      <div className="flex items-center justify-between">
        <StepIndicator step={step} />
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Đóng">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {step === "upload" && (
        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={cn(
              "flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 transition-colors duration-150",
              isDragActive
                ? "border-indigo-500 bg-indigo-50/30 dark:border-indigo-400 dark:bg-indigo-950/30"
                : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60",
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud className="mb-3 h-8 w-8 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
            {file ? (
              <div className="text-center">
                <FileSpreadsheet className="mx-auto mb-2 h-5 w-5 text-emerald-600" aria-hidden="true" />
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{file.name}</p>
                <p className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  {(file.size / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} KB
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  Kéo thả file Excel giao dịch thu/chi vào đây
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  hoặc bấm để chọn · XLSX · {LIMITS.FILE_UPLOAD_MAX_BYTES / 1024 / 1024}MB tối đa
                </p>
              </>
            )}
          </div>

          <a
            href={financeImportTemplateUrl()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Tải file Excel mẫu
          </a>

          <div className="flex justify-end border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <Button onClick={handleUpload} disabled={!file || upload.isPending}>
              {upload.isPending ? "Đang đọc file…" : "Tiếp theo — Xem trước"}
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && uploadData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Tổng dòng" value={uploadData.rowTotal} />
            <StatCard label="Hợp lệ (mới)" value={uploadData.rowSuccess} tone="success" />
            <StatCard label="Trùng — bỏ qua" value={uploadData.duplicateCount ?? 0} tone="muted" icon={Copy} />
            <StatCard label="Lỗi" value={uploadData.rowFail} tone={uploadData.rowFail > 0 ? "error" : "muted"} />
          </div>

          {uploadData.rowFail > 0 && batchId && (
            <a
              href={financeImportErrorsUrl(batchId)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Tải danh sách {uploadData.rowFail} dòng lỗi để sửa
            </a>
          )}

          {uploadData.previewRows && uploadData.previewRows.length > 0 && (
            <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 h-8 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400">
                <span>Xem trước {uploadData.previewRows.length} dòng đầu</span>
                <span className="normal-case tracking-normal text-zinc-500 dark:text-zinc-400">
                  Dòng trùng tô nền vàng
                </span>
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-sticky bg-zinc-50 dark:bg-zinc-800/60">
                    <tr className="text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      <th className="h-8 w-12 px-3">#</th>
                      {["Ngày", "Loại", "Nguồn", "Số tiền", "Diễn giải"].map((h) => (
                        <th key={h} className="h-8 px-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uploadData.previewRows.map((r, i) => (
                      <tr
                        key={i}
                        className={cn(
                          "h-8 border-t border-zinc-100 dark:border-zinc-800",
                          r.duplicate && "border-l-2 border-l-amber-500 bg-amber-50 dark:bg-amber-950/30",
                        )}
                      >
                        <td className="px-3 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">{i + 1}</td>
                        <td className="px-3 text-zinc-800 dark:text-zinc-200">{fmtDate(r.transactionDate)}</td>
                        <td className="px-3">
                          <span className={r.direction === "IN" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                            {r.direction === "IN" ? "Thu" : "Chi"}
                          </span>
                        </td>
                        <td className="px-3 font-mono text-xs text-zinc-900 dark:text-zinc-50">{r.accountCode}</td>
                        <td className="px-3 text-right font-mono tabular-nums text-zinc-900 dark:text-zinc-50">
                          {fmtVND(r.amount)}
                        </td>
                        <td className="max-w-[200px] truncate px-3 text-zinc-600 dark:text-zinc-400">
                          {r.description ?? "—"}
                          {r.duplicate && (
                            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                              Trùng
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {uploadData.warnings && uploadData.warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <p className="font-semibold">
                {uploadData.warnings.length} cảnh báo (không chặn dòng — vẫn nhập):
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {uploadData.warnings.slice(0, 8).map((w, i) => (
                  <li key={i}>Dòng {w.rowNumber}: {w.reason}</li>
                ))}
              </ul>
              {uploadData.warnings.length > 8 && <p className="mt-1">… và {uploadData.warnings.length - 8} cảnh báo khác.</p>}
            </div>
          )}

          <div className="flex justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <Button variant="ghost" onClick={() => setStep("upload")}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Quay lại
            </Button>
            <Button onClick={handleCommit} disabled={uploadData.rowSuccess === 0 || commit.isPending}>
              {commit.isPending ? "Đang gửi…" : `Xác nhận ghi ${uploadData.rowSuccess.toLocaleString("vi-VN")} dòng`}
            </Button>
          </div>
        </div>
      )}

      {step === "result" && batchQuery.data && (
        <div className="space-y-4">
          <ResultPanel
            status={batchQuery.data.status}
            rowSuccess={batchQuery.data.rowSuccess}
            rowFail={batchQuery.data.rowFail}
            rowTotal={batchQuery.data.rowTotal}
            errorMessage={batchQuery.data.errorMessage}
          />
          <div className="flex justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <Button variant="ghost" onClick={resetAll}>
              Import file khác
            </Button>
            <Button onClick={onClose}>Đóng</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const activeIdx = STEP_ORDER.indexOf(step);
  return (
    <ol className="flex items-center gap-0" aria-label="Tiến trình import">
      {STEP_ORDER.map((s, i) => {
        const state: "done" | "current" | "pending" =
          i < activeIdx ? "done" : i === activeIdx ? "current" : "pending";
        const isLast = i === STEP_ORDER.length - 1;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors",
                state === "current" && "bg-indigo-600 text-white",
                state === "done" && "bg-emerald-500 text-white",
                state === "pending" && "border-2 border-zinc-300 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
              )}
            >
              {state === "done" ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
            </span>
            <span className={cn("text-sm font-medium", state === "current" ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-400")}>
              {STEP_LABELS[s]}
            </span>
            {!isLast && <span aria-hidden="true" className="mx-2 h-0.5 w-8 bg-zinc-200 dark:bg-zinc-700" />}
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
  icon: Icon,
}: {
  label: string;
  value: number;
  tone?: "success" | "error" | "muted";
  icon?: typeof Copy;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "error"
        ? "text-red-700 dark:text-red-400"
        : "text-zinc-900 dark:text-zinc-50";
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
        {label}
      </div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", toneClass)}>
        {value.toLocaleString("vi-VN")}
      </div>
    </div>
  );
}

function ResultPanel({
  status,
  rowSuccess,
  rowFail,
  rowTotal,
  errorMessage,
}: {
  status: string;
  rowSuccess: number;
  rowFail: number;
  rowTotal: number;
  errorMessage: string | null;
}) {
  const isDone = status === "done";
  const isFailed = status === "failed";
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        {isDone ? (
          <CheckCircle2 className="h-10 w-10 text-emerald-500" strokeWidth={1.75} aria-hidden="true" />
        ) : isFailed ? (
          <AlertTriangle className="h-10 w-10 text-red-500" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-500 dark:border-zinc-700" />
        )}
        <div>
          <div className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {isDone ? "Hoàn tất import" : isFailed ? "Import thất bại" : "Đang import nền…"}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Trạng thái: {IMPORT_STATUS_LABEL[status] ?? status}
          </div>
        </div>
      </div>
      {isFailed && errorMessage && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage}
        </div>
      )}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard label="Tổng" value={rowTotal} />
        <StatCard label="Thành công" value={rowSuccess} tone="success" />
        <StatCard label="Lỗi/trùng" value={rowFail} tone={rowFail > 0 ? "error" : "muted"} />
      </div>
    </div>
  );
}
