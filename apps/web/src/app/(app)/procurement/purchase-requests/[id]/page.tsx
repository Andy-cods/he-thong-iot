"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Download,
  FileSpreadsheet,
  FileText,
  Flag,
  Loader2,
  PackageCheck,
  Printer,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { downloadFromUrl } from "@/lib/download";
import type { PRStatus } from "@iot/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/useSession";
import {
  useDeletePR,
  useDeptApprovePR,
  useDirectorApprovePR,
  useMarkPRCompleted,
  useMarkPRIssued,
  usePurchaseRequestDetail,
  useQuickApprovePR,
  useRejectPurchaseRequest,
} from "@/hooks/usePurchaseRequests";
import { useConvertPRToPOs } from "@/hooks/usePurchaseOrders";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConvertPRToPODialog } from "@/components/procurement/ConvertPRToPODialog";
import {
  DnvtDetailBody,
  type DnvtDetailPr,
} from "@/components/procurement/DnvtDetailBody";

/**
 * V3.7.69 — Detail page YCVT (Yêu cầu Vật tư).
 *
 * Layout khớp 100% với Excel "Phiếu MRF" mẫu. Read-only render kèm 3-step
 * approval workflow (Người đề xuất → Trưởng bộ phận → Giám đốc/Mua hàng).
 *
 * Sections:
 *   Header: XƯỞNG SXKD + Tên công ty + Số phiếu thực + Ngày lập
 *   I.   Thông tin chung (Kính gửi, Bộ phận đề xuất, Người đề xuất, Lý do)
 *   II.  Danh mục vật tư (15 cột, Tồn kho từ snapshot, Duyệt từ approvedQty)
 *   III. Phê duyệt — 3 chữ ký với state realtime
 *   IV.  Theo dõi — 5 timeline rows
 *   V.   Quy tắc quản lý (5 bullets)
 *
 * Toolbar (no-print):
 *   - Back to list, status pill
 *   - Duyệt step current (Trưởng bộ phận hoặc Giám đốc) — chỉ hiện cho role tương ứng
 *   - Từ chối — chỉ khi đang trong flow approval
 *   - In phiếu (window.print)
 *   - Xuất Excel / Xuất PDF
 *   - Tạo PO (nếu status APPROVED)
 */

type ApprovalStep =
  | "DRAFT"
  | "SUBMITTED"
  | "DEPT_APPROVED"
  | "DIRECTOR_APPROVED"
  | "CONVERTED"
  | "DONE"
  | "REJECTED";

const STEP_LABEL: Record<ApprovalStep, string> = {
  DRAFT: "Nháp",
  SUBMITTED: "Chờ Trưởng bộ phận",
  DEPT_APPROVED: "Chờ Giám đốc",
  DIRECTOR_APPROVED: "Đã duyệt",
  CONVERTED: "Đã tạo PO",
  DONE: "Hoàn tất",
  REJECTED: "Từ chối",
};

const STEP_PILL: Record<ApprovalStep, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
  SUBMITTED:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800",
  DEPT_APPROVED:
    "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800",
  DIRECTOR_APPROVED:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800",
  CONVERTED:
    "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800",
  DONE: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800",
  REJECTED:
    "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800",
};

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: "Khẩn",
  NORMAL: "Bình thường",
  RESERVE: "Dự phòng",
};
const CATEGORY_LABELS: Record<string, string> = {
  TOOL: "CCDC",
  CONSUMABLE: "Tiêu hao",
  MATERIAL: "Vật tư phục vụ SX",
  OTHER: "Khác",
};

function fmtDateVN(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return formatDate(d, "dd/MM/yyyy");
}
function fmtDateTimeVN(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return formatDate(d, "dd/MM/yyyy HH:mm");
}
function fmtNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("vi-VN");
}

export default function PurchaseRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const session = useSession();
  const roles = session.data?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const isPlanner = roles.includes("planner");
  const isPurchaser = roles.includes("purchaser");

  const router = useRouter();
  const detail = usePurchaseRequestDetail(id);
  const deptApprove = useDeptApprovePR(id);
  const directorApprove = useDirectorApprovePR(id);
  const quickApprove = useQuickApprovePR(id);
  const reject = useRejectPurchaseRequest(id);
  const convert = useConvertPRToPOs();
  const markIssued = useMarkPRIssued(id);
  const markCompleted = useMarkPRCompleted(id);
  const deletePR = useDeletePR(id);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = React.useState("");

  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [approveOpen, setApproveOpen] = React.useState<
    null | "dept" | "director" | "quick"
  >(null);
  const [approveNote, setApproveNote] = React.useState("");
  const [convertOpen, setConvertOpen] = React.useState(false);
  // Hooks phải luôn chạy trước mọi nhánh return. Nếu state này nằm sau
  // loading/not-found return, render có dữ liệu sẽ gọi thêm một Hook và React
  // ném lỗi #310 (Rendered more hooks than during the previous render).
  const [exporting, setExporting] = React.useState<null | "excel" | "pdf">(
    null,
  );

  if (detail.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Đang tải phiếu…
      </div>
    );
  }
  const pr = detail.data?.data;
  if (!pr) {
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950/40">
        <AlertCircle className="mx-auto h-8 w-8 text-red-400 dark:text-red-500" aria-hidden />
        <p className="mt-2 text-sm font-semibold text-red-700 dark:text-red-300">
          Không tìm thấy phiếu YCVT
        </p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/procurement/purchase-requests">Về danh sách</Link>
        </Button>
      </div>
    );
  }

  const step = (pr.approvalStep ?? "DRAFT") as ApprovalStep;
  const status = pr.status as PRStatus;

  const canDeptApprove = (isAdmin || isPlanner) && step === "SUBMITTED";
  const canDirectorApprove =
    (isAdmin || isPurchaser) && step === "DEPT_APPROVED";
  // V3.9 — Admin duyệt nhanh gộp 2 cấp khi phiếu vừa SUBMITTED.
  const canQuickApprove = isAdmin && step === "SUBMITTED";
  const canReject =
    (isAdmin || isPlanner || isPurchaser) &&
    (step === "SUBMITTED" || step === "DEPT_APPROVED");
  const canConvert = (isAdmin || isPurchaser) && status === "APPROVED";
  // V3.7.70 — Manual timeline events
  const canMarkIssued =
    (isAdmin || roles.includes("warehouse")) &&
    !!pr.goodsReceivedAt &&
    !pr.goodsIssuedAt;
  const canMarkCompleted =
    isAdmin && !!pr.goodsIssuedAt && !pr.completedAt;
  // V3.7.71 — Hard-delete YCVT, admin only
  const canDelete = isAdmin;

  const paperFormNo = pr.paperFormNo ?? "—";
  const todayStr = fmtDateVN(pr.createdAt);

  const handleApproveSubmit = async () => {
    try {
      if (approveOpen === "dept") {
        await deptApprove.mutateAsync({ note: approveNote.trim() || null });
        toast.success("Đã duyệt bước Trưởng bộ phận");
      } else if (approveOpen === "director") {
        await directorApprove.mutateAsync({ note: approveNote.trim() || null });
        toast.success("Đã duyệt cuối — phiếu hoàn tất phê duyệt");
      } else if (approveOpen === "quick") {
        await quickApprove.mutateAsync({ note: approveNote.trim() || null });
        toast.success("Đã duyệt nhanh 2 cấp — phiếu sẵn sàng tạo PO");
      }
      setApproveOpen(null);
      setApproveNote("");
    } catch (err) {
      toast.error(`Duyệt thất bại: ${(err as Error).message}`);
    }
  };

  const handleReject = async () => {
    if (rejectReason.trim().length < 3) {
      toast.error("Lý do từ chối tối thiểu 3 ký tự");
      return;
    }
    try {
      await reject.mutateAsync({ reason: rejectReason.trim() });
      toast.success("Đã từ chối phiếu YCVT");
      setRejectOpen(false);
      setRejectReason("");
    } catch (err) {
      toast.error(`Từ chối thất bại: ${(err as Error).message}`);
    }
  };

  const handlePrint = () => window.print();
  // V3.11.1 — fetch→blob→download (ổn định, đọc được lỗi) thay window.open.
  const handleExportExcel = async () => {
    setExporting("excel");
    try {
      await downloadFromUrl(
        `/api/purchase-requests/${id}/export-excel`,
        "phieu.xlsx",
      );
    } catch (e) {
      toast.error(`Không xuất được Excel: ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  };
  const handleExportPdf = async () => {
    setExporting("pdf");
    try {
      await downloadFromUrl(
        `/api/purchase-requests/${id}/export-pdf`,
        "phieu.pdf",
      );
    } catch (e) {
      toast.error(`Không xuất được PDF: ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex flex-col bg-zinc-100 md:h-full md:overflow-auto dark:bg-zinc-950 print:bg-white">
      {/* ===== Toolbar (no print) ===== */}
      <header className="border-b border-zinc-200 bg-white px-6 py-3 print:hidden dark:border-zinc-800 dark:bg-zinc-900">
        <Link
          href="/procurement/purchase-requests"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Yêu cầu mua hàng
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {pr.code}
                </span>
                {paperFormNo !== "—" ? (
                  <span className="rounded bg-[#005D9F] px-2 py-0.5 font-mono text-[11px] text-white">
                    {paperFormNo}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                    STEP_PILL[step],
                  )}
                >
                  <Circle className="h-1.5 w-1.5 fill-current" aria-hidden />
                  {STEP_LABEL[step]}
                </span>
              </div>
              <h1 className="mt-1 truncate text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                {pr.title || "Phiếu YCVT"}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" aria-hidden />
              In
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleExportExcel()}
              disabled={exporting !== null}
            >
              {exporting === "excel" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
              )}
              Excel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleExportPdf()}
              disabled={exporting !== null}
            >
              {exporting === "pdf" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden />
              )}
              PDF
            </Button>

            {canReject && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejectOpen(true)}
                className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <X className="h-3.5 w-3.5" />
                Từ chối
              </Button>
            )}
            {canQuickApprove && (
              <Button
                size="sm"
                onClick={() => {
                  setApproveOpen("quick");
                  setApproveNote("");
                }}
                disabled={quickApprove.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              >
                {quickApprove.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Duyệt nhanh (Admin)
              </Button>
            )}
            {canDeptApprove && (
              <Button
                size="sm"
                variant={canQuickApprove ? "outline" : "default"}
                onClick={() => {
                  setApproveOpen("dept");
                  setApproveNote("");
                }}
                disabled={deptApprove.isPending}
                className={
                  canQuickApprove
                    ? undefined
                    : "bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400"
                }
              >
                {deptApprove.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Duyệt (Trưởng bộ phận)
              </Button>
            )}
            {canDirectorApprove && (
              <Button
                size="sm"
                onClick={() => {
                  setApproveOpen("director");
                  setApproveNote("");
                }}
                disabled={directorApprove.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              >
                {directorApprove.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Duyệt (Giám đốc/Mua hàng)
              </Button>
            )}
            {canConvert && (
              <Button
                size="sm"
                onClick={() => setConvertOpen(true)}
                disabled={convert.isPending}
              >
                {convert.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
                Tạo PO
              </Button>
            )}
            {canMarkIssued && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (window.confirm("Xác nhận vật tư đã xuất kho cho bộ phận yêu cầu?")) {
                    markIssued.mutate(undefined, {
                      onSuccess: () => toast.success("Đã ghi nhận xuất kho"),
                      onError: (e) =>
                        toast.error(`Lỗi: ${(e as Error).message}`),
                    });
                  }
                }}
                disabled={markIssued.isPending}
                className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/40"
              >
                {markIssued.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Truck className="h-3.5 w-3.5" />
                )}
                Đã xuất kho
              </Button>
            )}
            {canMarkCompleted && (
              <Button
                size="sm"
                onClick={() => {
                  if (window.confirm("Đóng phiếu YCVT này? Sau khi đóng không sửa được.")) {
                    markCompleted.mutate(undefined, {
                      onSuccess: () => toast.success("Phiếu đã hoàn tất"),
                      onError: (e) =>
                        toast.error(`Lỗi: ${(e as Error).message}`),
                    });
                  }
                }}
                disabled={markCompleted.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              >
                {markCompleted.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Flag className="h-3.5 w-3.5" />
                )}
                Hoàn tất
              </Button>
            )}

            {canDelete && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDeleteConfirmText("");
                  setDeleteOpen(true);
                }}
                disabled={deletePR.isPending}
                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xoá phiếu
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ===== Phiếu body — A4 landscape ===== */}
      <div className="mx-auto w-full max-w-[1440px] p-3 sm:p-6 print:p-0 print:max-w-none">
        {/* V3.10 — branch layout theo loại phiếu. DNVT khớp form giấy (14 cột,
            không giá/IV/V); MRF giữ nguyên layout cũ. Toolbar + dialog chung. */}
        {pr.formType === "DNVT" ? (
          <DnvtDetailBody pr={pr as unknown as DnvtDetailPr} />
        ) : (
        <article className="border-2 border-zinc-900 bg-white text-zinc-900 shadow-md print:border print:border-zinc-900 print:shadow-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 print:dark:border-zinc-900 print:dark:bg-white print:dark:text-zinc-900">
          {/* Header */}
          <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-2 border-b-2 border-zinc-900 px-4 py-3 text-[12px] print:dark:border-zinc-900">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/img/logo-gtam.png"
                alt="GTAM"
                width={56}
                height={60}
                className="h-14 w-auto shrink-0 object-contain"
              />
              <div className="font-bold tracking-wide">XƯỞNG SXKD</div>
            </div>
            <div className="text-center text-[14px] font-bold">
              CÔNG TY CỔ PHẦN SẢN XUẤT TỰ ĐỘNG HÓA
              <br />
              CÔNG NGHỆ TOÀN CẦU
            </div>
            <div className="space-y-1 text-right text-[12px]">
              <div>
                <span className="font-bold">Số phiếu: </span>
                <span className="rounded bg-[#005D9F] px-2 py-0.5 font-mono text-[12px] text-white">
                  {paperFormNo}
                </span>
              </div>
              <div>
                <span className="font-bold">Ngày lập: </span>
                <span className="font-mono">{todayStr}</span>
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="border-b-2 border-zinc-900 bg-[#F5F5F5] px-4 py-2 text-center print:dark:border-zinc-900 print:dark:bg-zinc-100 dark:bg-zinc-800">
            <h2 className="text-[20px] font-bold tracking-wide text-zinc-900 dark:text-zinc-50 print:dark:text-zinc-900">
              PHIẾU ĐỀ XUẤT VẬT TƯ — NPL
            </h2>
          </div>

          {/* I. Thông tin chung */}
          <section className="border-b border-zinc-300 print:dark:border-zinc-300">
            <SectionTitle>I. Thông tin chung</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2">
              <FieldRow label="Kính gửi:">
                <span>{pr.targetDepartment ?? "—"}</span>
              </FieldRow>
              <FieldRow label="Bộ phận đề xuất:">
                <span>{pr.proposingDepartment ?? "—"}</span>
              </FieldRow>
              <FieldRow label="Người đề xuất:">
                <span className="font-medium">{pr.requestedByName ?? "—"}</span>
              </FieldRow>
              <FieldRow label="Tiêu đề:">
                <span>{pr.title ?? "—"}</span>
              </FieldRow>
              <FieldRow label="Lý do đề xuất:" wide>
                <span className="whitespace-pre-line">
                  {pr.requestReason ?? "—"}
                </span>
              </FieldRow>
            </div>
          </section>

          {/* II. Danh mục vật tư */}
          <section className="border-b border-zinc-300 print:dark:border-zinc-300">
            <SectionTitle>II. Danh mục vật tư</SectionTitle>
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#F5F5F5] text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:bg-zinc-100 print:dark:text-zinc-700">
                    <Th w="w-8">STT</Th>
                    <Th w="min-w-[160px]">Tên vật tư</Th>
                    <Th w="w-28">Mã VT</Th>
                    <Th w="min-w-[120px]">Quy cách</Th>
                    <Th w="w-14">ĐVT</Th>
                    <Th w="w-14" align="right">SL</Th>
                    <Th w="w-16" align="right">Tồn kho</Th>
                    <Th w="w-14" align="right">Duyệt</Th>
                    <Th w="w-28">Ngày cần</Th>
                    <Th w="w-28">Ưu tiên</Th>
                    <Th w="w-28">Phân loại</Th>
                    <Th w="w-28" align="right">Đơn giá DK</Th>
                    <Th w="w-32" align="right">Tổng tiền</Th>
                    <Th w="w-24">Mã ref</Th>
                    <Th w="min-w-[120px]">Ghi chú</Th>
                  </tr>
                </thead>
                <tbody>
                  {pr.lines.map((l, idx) => {
                    const qty = Number(l.qty) || 0;
                    const onHand =
                      l.onHandSnapshot != null
                        ? Number(l.onHandSnapshot)
                        : null;
                    const approvedQty =
                      l.approvedQty != null ? Number(l.approvedQty) : null;
                    const lowStock =
                      onHand != null && qty > 0 ? onHand < qty : false;
                    const lineTotal =
                      l.lineTotal != null
                        ? Number(l.lineTotal)
                        : qty * (Number(l.estimatedUnitPrice) || 0);
                    return (
                      <tr
                        key={l.id}
                        className={cn(
                          "border-b border-zinc-200 align-top dark:border-zinc-700 print:dark:border-zinc-300",
                          idx % 2 === 1
                            ? "bg-zinc-50/40 dark:bg-zinc-800/30 print:dark:bg-zinc-50/40"
                            : "",
                        )}
                      >
                        <Td>
                          <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
                            {idx + 1}
                          </span>
                        </Td>
                        <Td>
                          <span className="block break-words font-medium">
                            {l.name ?? "—"}
                          </span>
                        </Td>
                        <Td>
                          <span className="block break-words font-mono text-[10.5px] text-zinc-600 dark:text-zinc-400 print:dark:text-zinc-600">
                            {l.sku ?? "—"}
                          </span>
                        </Td>
                        <Td>{l.specification ?? "—"}</Td>
                        <Td align="center">{l.uom ?? l.itemUom ?? "—"}</Td>
                        <Td align="right">
                          <span className="font-mono">{fmtNum(qty)}</span>
                        </Td>
                        <Td align="right">
                          {onHand != null ? (
                            <span
                              className={cn(
                                "font-mono",
                                lowStock
                                  ? "font-semibold text-rose-600 dark:text-rose-400 print:dark:text-rose-600"
                                  : "text-emerald-700 dark:text-emerald-400 print:dark:text-emerald-700",
                              )}
                            >
                              {fmtNum(onHand)}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </Td>
                        <Td align="right">
                          {approvedQty != null ? (
                            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 print:dark:text-emerald-700">
                              {fmtNum(approvedQty)}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </Td>
                        <Td>{fmtDateVN(l.neededBy)}</Td>
                        <Td>{PRIORITY_LABELS[l.priority ?? "NORMAL"] ?? "—"}</Td>
                        <Td>{CATEGORY_LABELS[l.category ?? "OTHER"] ?? "—"}</Td>
                        <Td align="right">
                          <span className="font-mono">
                            {fmtNum(l.estimatedUnitPrice)}
                          </span>
                        </Td>
                        <Td align="right">
                          <span className="font-mono font-semibold">
                            {lineTotal > 0 ? fmtNum(lineTotal) : "—"}
                          </span>
                        </Td>
                        <Td>{l.referenceCode ?? "—"}</Td>
                        <Td>{l.notes ?? "—"}</Td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-700 bg-[#F5F5F5] font-semibold dark:bg-zinc-800 print:dark:bg-zinc-100">
                    <td colSpan={12} className="px-2 py-2 text-right text-[11px]">
                      Tổng tiền dự kiến (VNĐ):
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[12px] text-[#005D9F] tabular-nums">
                      {fmtNum(pr.totalEstimatedAmount)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* III. Phê duyệt */}
          <section className="border-b border-zinc-300 print:dark:border-zinc-300">
            <SectionTitle>III. Kiểm tra &amp; Phê duyệt</SectionTitle>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#F5F5F5] text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:bg-zinc-100 print:dark:text-zinc-700">
                  <Th w="w-44">Vai trò</Th>
                  <Th w="w-48">Họ tên</Th>
                  <Th w="w-40">Ký tên / Ngày</Th>
                  <Th>Ghi chú</Th>
                </tr>
              </thead>
              <tbody>
                <ApprovalRow
                  role="Người đề xuất"
                  name={pr.requestedByName ?? "—"}
                  date={fmtDateTimeVN(pr.createdAt)}
                  signed
                  note="Đã ký khi gửi phiếu"
                />
                <ApprovalRow
                  role="Trưởng bộ phận"
                  name={pr.deptApprovedByName ?? null}
                  date={fmtDateTimeVN(pr.deptApprovedAt)}
                  signed={!!pr.deptApprovedAt}
                  note={
                    pr.deptApprovalNote ??
                    (step === "SUBMITTED"
                      ? "Đang chờ duyệt"
                      : pr.deptApprovedAt
                        ? "Đã duyệt"
                        : "—")
                  }
                />
                <ApprovalRow
                  role="Giám đốc / Mua hàng"
                  name={pr.directorApprovedByName ?? null}
                  date={fmtDateTimeVN(pr.directorApprovedAt)}
                  signed={!!pr.directorApprovedAt}
                  note={
                    pr.directorApprovalNote ??
                    (step === "DEPT_APPROVED"
                      ? "Đang chờ duyệt cuối"
                      : pr.directorApprovedAt
                        ? "Đã duyệt cuối"
                        : "—")
                  }
                />
                {step === "REJECTED" && pr.rejectionReason ? (
                  <tr className="border-b border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/30">
                    <Td>
                      <span className="font-bold text-red-700 dark:text-red-300">
                        Từ chối
                      </span>
                    </Td>
                    <Td>{pr.rejectedByName ?? "—"}</Td>
                    <Td>{fmtDateTimeVN(pr.rejectedAt)}</Td>
                    <Td>
                      <span className="text-red-700 dark:text-red-300">
                        {pr.rejectionReason}
                      </span>
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          {/* IV. Theo dõi */}
          <section className="border-b border-zinc-300 print:dark:border-zinc-300">
            <SectionTitle>IV. Theo dõi</SectionTitle>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#F5F5F5] text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:bg-zinc-100 print:dark:text-zinc-700">
                  <Th w="w-52">Trạng thái</Th>
                  <Th w="w-44">Người phụ trách</Th>
                  <Th w="w-40">Ngày thực hiện</Th>
                  <Th>Ghi chú</Th>
                </tr>
              </thead>
              <tbody>
                <TrackingRow
                  label="Đã duyệt đề xuất"
                  date={pr.directorApprovedAt ?? null}
                  who={pr.directorApprovedByName ?? null}
                  note={pr.directorApprovedAt ? "Giám đốc đã duyệt" : "Chưa duyệt cuối"}
                />
                <TrackingRow
                  label="Đã tạo đơn mua (PR/PO)"
                  date={pr.poCreatedAt ?? null}
                  who={null}
                  note={
                    pr.poCreatedAt
                      ? "Đã tạo PO từ phiếu này"
                      : status === "APPROVED"
                        ? "Sẵn sàng tạo PO"
                        : "—"
                  }
                />
                <TrackingRow
                  label="Đã nhận hàng"
                  date={pr.goodsReceivedAt ?? null}
                  who={null}
                  note={pr.goodsReceivedAt ? "Hàng về kho" : "—"}
                />
                <TrackingRow
                  label="Đã xuất kho"
                  date={pr.goodsIssuedAt ?? null}
                  who={null}
                  note={pr.goodsIssuedAt ? "Đã xuất cho bộ phận yêu cầu" : "—"}
                />
                <TrackingRow
                  label="Hoàn tất"
                  date={pr.completedAt ?? null}
                  who={null}
                  note={pr.completedAt ? "Phiếu hoàn tất" : "—"}
                />
              </tbody>
            </table>
          </section>

          {/* V. Quy tắc quản lý */}
          <section>
            <div className="bg-[#005D9F] px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-white">
              V. Quy tắc quản lý
            </div>
            <ul className="space-y-1 bg-[#F5F5F5] px-6 py-3 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:bg-zinc-100 print:dark:text-zinc-700">
              <li>• Vật tư ESD / Non-ESD phải phân loại riêng</li>
              <li>• Vật tư lỗi ghi rõ nguyên nhân</li>
              <li>• Mua dự phòng cần có giải trình</li>
              <li>• Mỗi phiếu chỉ cho 1 dự án / WO</li>
              <li>• Khi hàng về kho, cập nhật trạng thái "Đã nhận hàng"</li>
            </ul>
          </section>
        </article>
        )}
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối phiếu YCVT</DialogTitle>
            <DialogDescription>
              Phiếu sẽ chuyển sang trạng thái REJECTED. Người đề xuất sẽ nhận
              thông báo và có thể tạo phiếu mới.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason" required>
              Lý do từ chối
            </Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="VD: Đã có đủ tồn kho, đơn giá quá cao, thiếu spec..."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleReject()}
              disabled={reject.isPending}
            >
              {reject.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Từ chối phiếu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve dialog (dept + director chung) */}
      <Dialog
        open={!!approveOpen}
        onOpenChange={(o) => {
          if (!o) setApproveOpen(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approveOpen === "dept"
                ? "Duyệt — Trưởng bộ phận"
                : approveOpen === "quick"
                  ? "Duyệt nhanh — gộp 2 cấp"
                  : "Duyệt cuối — Giám đốc / Mua hàng"}
            </DialogTitle>
            <DialogDescription>
              {approveOpen === "dept"
                ? "Sau khi duyệt, phiếu sẽ chuyển sang chờ Giám đốc/Mua hàng duyệt cuối."
                : approveOpen === "quick"
                  ? "Tên bạn sẽ hiện ở CẢ 2 ô ký (Trưởng bộ phận + Giám đốc). Phiếu chuyển thẳng sang Đã duyệt, sẵn sàng tạo PO. Kế toán sẽ nhận thông báo tải PDF/Excel."
                  : "Sau khi duyệt cuối, phiếu sẵn sàng để tạo PO. Bộ phận Mua hàng sẽ nhận thông báo."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="approve-note">Ghi chú (tùy chọn)</Label>
            <Textarea
              id="approve-note"
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              rows={2}
              placeholder="VD: Đồng ý theo đề xuất, đẩy nhanh giúp lệnh sản xuất WO-..."
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApproveOpen(null)}>
              Huỷ
            </Button>
            <Button
              onClick={() => void handleApproveSubmit()}
              disabled={
                deptApprove.isPending ||
                directorApprove.isPending ||
                quickApprove.isPending
              }
              className={
                approveOpen === "dept"
                  ? "bg-sky-600 hover:bg-sky-700 dark:bg-sky-500"
                  : "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500"
              }
            >
              {(deptApprove.isPending ||
                directorApprove.isPending ||
                quickApprove.isPending) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {approveOpen === "quick" ? "Xác nhận duyệt nhanh" : "Xác nhận duyệt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* V3.7.71 — Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoá phiếu YCVT — không thể hoàn tác</DialogTitle>
            <DialogDescription>
              Hành động này sẽ xoá vĩnh viễn phiếu{" "}
              <strong className="font-mono">
                {pr.paperFormNo ?? pr.code}
              </strong>{" "}
              + toàn bộ dòng vật tư + lịch sử audit. Nếu đã có PO link, hệ
              thống sẽ bỏ link (set NULL) trước khi xoá.
              <br />
              <span className="mt-2 block text-red-700 dark:text-red-400">
                Chỉ dùng khi cần loại bỏ phiếu sai/test. Cân nhắc dùng "Từ chối"
                nếu muốn giữ vết audit.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="del-confirm" required>
              Nhập "XOA" để xác nhận
            </Label>
            <input
              id="del-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              autoComplete="off"
              autoFocus
              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm font-mono uppercase outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={
                deleteConfirmText.trim() !== "XOA" || deletePR.isPending
              }
              onClick={() => {
                deletePR.mutate(
                  { force: true },
                  {
                    onSuccess: () => {
                      toast.success(
                        `Đã xoá phiếu ${pr.paperFormNo ?? pr.code}`,
                      );
                      setDeleteOpen(false);
                      router.push("/procurement/purchase-requests");
                    },
                    onError: (e) =>
                      toast.error(`Lỗi: ${(e as Error).message}`),
                  },
                );
              }}
            >
              {deletePR.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Xoá vĩnh viễn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert dialog (existing) */}
      <ConvertPRToPODialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        prId={id}
        prCode={pr.code}
        lines={pr.lines.map((l) => ({
          id: l.id,
          lineNo: l.lineNo,
          itemId: l.itemId,
          sku: l.sku ?? "",
          name: l.name ?? "",
          qty: l.qty,
          preferredSupplierId: l.preferredSupplierId ?? null,
        }))}
      />

      {/* Print A4 landscape */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          html,
          body {
            background: white !important;
            color: #18181b !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ---------- helpers ---------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center bg-[#005D9F] px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-white print:py-1">
      {children}
    </div>
  );
}

function FieldRow({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[140px_1fr] border-b border-zinc-200 dark:border-zinc-700 print:dark:border-zinc-300",
        wide ? "md:col-span-2" : "",
      )}
    >
      <div className="border-r border-zinc-200 bg-[#F5F5F5] px-3 py-2 text-[12px] font-bold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:border-zinc-300 print:dark:bg-zinc-100 print:dark:text-zinc-800">
        {label}
      </div>
      <div className="flex min-h-[28px] items-center px-3 py-1 text-[12px]">
        {children}
      </div>
    </div>
  );
}

function Th({
  children,
  w,
  align = "left",
}: {
  children: React.ReactNode;
  w?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={cn(
        "border-b border-r border-zinc-300 px-2 py-1.5 dark:border-zinc-700 print:dark:border-zinc-300",
        w,
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  colSpan,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-r border-zinc-200 px-2 py-1 align-top whitespace-normal break-words dark:border-zinc-700 print:dark:border-zinc-300",
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
      )}
    >
      {children}
    </td>
  );
}

function ApprovalRow({
  role,
  name,
  date,
  signed,
  note,
}: {
  role: string;
  name: string | null;
  date: string;
  signed?: boolean;
  note: string;
}) {
  return (
    <tr
      className={cn(
        "border-b border-zinc-200 dark:border-zinc-700 print:dark:border-zinc-300",
        signed
          ? "bg-emerald-50/40 dark:bg-emerald-950/20 print:dark:bg-emerald-50/40"
          : "",
      )}
    >
      <Td>
        <span className="font-bold">{role}</span>
      </Td>
      <Td>
        {name ? (
          <span className="font-medium">{name}</span>
        ) : (
          <span className="italic text-zinc-400">Chờ duyệt</span>
        )}
      </Td>
      <Td>
        {signed ? (
          <span className="inline-flex items-center gap-1 font-mono text-[10.5px]">
            <CheckCircle2
              className="h-3 w-3 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
            {date}
          </span>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </Td>
      <Td>
        <span className="text-[10.5px] text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
          {note}
        </span>
      </Td>
    </tr>
  );
}

function TrackingRow({
  label,
  date,
  who,
  note,
}: {
  label: string;
  date: string | Date | null;
  who: string | null;
  note: string;
}) {
  const done = !!date;
  return (
    <tr
      className={cn(
        "border-b border-zinc-200 dark:border-zinc-700 print:dark:border-zinc-300",
        done
          ? "bg-emerald-50/40 dark:bg-emerald-950/20 print:dark:bg-emerald-50/40"
          : "",
      )}
    >
      <Td>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-medium",
            done
              ? "text-emerald-700 dark:text-emerald-300 print:dark:text-emerald-700"
              : "text-zinc-700 dark:text-zinc-300 print:dark:text-zinc-700",
          )}
        >
          {done ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Circle className="h-3.5 w-3.5" aria-hidden />
          )}
          {label}
        </span>
      </Td>
      <Td>
        {who ? (
          <span className="font-mono text-[10.5px]">{who}</span>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </Td>
      <Td>
        <span className="font-mono text-[10.5px]">
          {done ? fmtDateTimeVN(date) : "—"}
        </span>
      </Td>
      <Td>
        <span className="text-[10.5px] text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
          {note}
        </span>
      </Td>
    </tr>
  );
}
