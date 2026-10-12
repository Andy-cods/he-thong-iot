"use client";

import * as React from "react";
import { QueryError } from "@/components/ui/query-error";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  Download,
  FileSpreadsheet,
  FileText,
  Flag,
  Loader2,
  MoreHorizontal,
  PackageCheck,
  Pencil,
  Printer,
  RotateCcw,
  AlertTriangle,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { downloadFromUrl } from "@/lib/download";
import type { PRStatus } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
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
  useCancelPurchaseRequest,
  useDeletePR,
  useDeptApprovePR,
  useDirectorApprovePR,
  useMarkPRCompleted,
  useRecheckPrStock,
  useRecreatePR,
  useSubmitPR,
  usePurchaseRequestDetail,
  useQuickApprovePR,
  useRejectPurchaseRequest,
  type PRLineEnriched,
} from "@/hooks/usePurchaseRequests";
import { isClosedByPartialReject, REJECTED_PARTIAL_LABEL } from "@/lib/pr-close-policy";
import { canCancelPR, canRejectAtStep, formatCoverageSummary, summarizeLineCoverage, isSelfApprovalBlocked, isStockRecheckableState, isWarehouseIssueStage, prLineToPoLine } from "@/lib/procurement-policy";
import { canEditPRDraft, canExportPrExcel, canRecreatePR } from "@/server/services/prAccess";
import { useConvertPRToPOs } from "@/hooks/usePurchaseOrders";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import { statusLabel, type StatusTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { ConvertPRToPODialog } from "@/components/procurement/ConvertPRToPODialog";
import { MarkPrIssuedDialog } from "@/components/procurement/MarkPrIssuedDialog";
import { PrStockCheckPanel } from "@/components/procurement/PrStockCheckPanel";
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
  | "REJECTED"
  | "CANCELLED";

const STEP_LABEL: Record<ApprovalStep, string> = {
  DRAFT: "Nháp",
  // V4.0 — bước 2 do Kho đảm nhiệm (kiểm lượng tồn rồi duyệt).
  SUBMITTED: "Chờ Kho kiểm tồn",
  DEPT_APPROVED: "Chờ Giám đốc",
  DIRECTOR_APPROVED: "Đã duyệt",
  CONVERTED: "Đã tạo PO",
  DONE: "Hoàn tất",
  REJECTED: "Từ chối",
  // V4.4 (Việc 4) — huỷ bởi người tạo/admin, khác REJECTED.
  CANCELLED: "Đã huỷ",
};

// V4.1 UI-07/08: bước duyệt YCVT (approvalStep) không phải trạng thái chung
// trong lib/status → giữ nhãn riêng ở trên, nhưng tông màu theo 6 tông chuẩn
// (StatusPill), bỏ lớp Tailwind tự khai báo.
const STEP_TONE: Record<ApprovalStep, StatusTone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  DEPT_APPROVED: "info",
  DIRECTOR_APPROVED: "success",
  CONVERTED: "success",
  DONE: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
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
// V4.1 UI-14: số trong biểu mẫu qua formatQty chung (bỏ 0 thừa).
function fmtNum(n: number | string | null | undefined): string {
  return formatQty(n);
}
/** V4.1 UI-13: tiền (đơn giá / thành tiền dự kiến) — làm tròn đồng, thiếu → "—". */
function fmtMoney(n: number | string | null | undefined): string {
  return formatMoney(n, { unit: "none", empty: "—" });
}

export default function PurchaseRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const session = useSession();
  const roles = session.data?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const isPurchaser = roles.includes("purchaser");
  // V4.0 — Kho là "Trưởng bộ phận" duyệt bước 2 của phiếu YCVT.
  const isWarehouse = roles.includes("warehouse");
  // TASK-6VIEC Việc 1 — chỉ admin/purchaser/accountant được xuất Excel (PDF
  // vẫn mở cho mọi vai). Khớp guard server `canExportPrExcel`.
  const canExportExcel = canExportPrExcel(roles);

  const router = useRouter();
  const detail = usePurchaseRequestDetail(id);
  const deptApprove = useDeptApprovePR(id);
  const recheckStock = useRecheckPrStock(id);
  const [recheckOpen, setRecheckOpen] = React.useState(false);
  const directorApprove = useDirectorApprovePR(id);
  const quickApprove = useQuickApprovePR(id);
  const reject = useRejectPurchaseRequest(id);
  const cancel = useCancelPurchaseRequest(id);
  const convert = useConvertPRToPOs();
  const markCompleted = useMarkPRCompleted(id);
  const recreate = useRecreatePR(id);
  const submitPr = useSubmitPR(id);
  const deletePR = useDeletePR(id);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  // V4.1 UX-01: hộp xác nhận chung thay hộp thoại gốc của trình duyệt.
  const askConfirm = useConfirm();
  const [deleteConfirmText, setDeleteConfirmText] = React.useState("");

  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  // V4.4 (Việc 4) — Huỷ phiếu (khác reject).
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  // Kho kiểm tồn: SL cần mua từng dòng (panel trong hộp thoại duyệt Kho / duyệt nhanh).
  const [stockBuy, setStockBuy] = React.useState<{ qtys: Record<string, number>; valid: boolean }>({
    qtys: {},
    valid: true,
  });
  const onStockBuyChange = React.useCallback(
    (qtys: Record<string, number>, valid: boolean) => setStockBuy({ qtys, valid }),
    [],
  );
  const [approveOpen, setApproveOpen] = React.useState<
    null | "dept" | "director" | "quick"
  >(null);
  const [approveNote, setApproveNote] = React.useState("");
  const [convertOpen, setConvertOpen] = React.useState(false);
  // V4.2 (TASK "Trừ tồn luôn") — dialog chọn lô/bin xuất kho khi bấm "Đã xuất kho".
  const [issueDialogOpen, setIssueDialogOpen] = React.useState(false);
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
  // V4.1 UI-05: lỗi API (429/500/403) ≠ "không tìm thấy".
  if (!pr && detail.isError && (detail.error as { status?: number } | null)?.status !== 404) {
    return (
      <QueryError
        error={detail.error}
        onRetry={() => void detail.refetch()}
        retrying={detail.isFetching}
        title="Không tải được phiếu đề xuất vật tư"
      />
    );
  }
  if (!pr) {
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950/40">
        <AlertCircle className="mx-auto h-8 w-8 text-red-400 dark:text-red-500" aria-hidden />
        <p className="mt-2 text-sm font-semibold text-red-700 dark:text-red-300">
          Không tìm thấy phiếu đề xuất vật tư
        </p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/procurement/purchase-requests">Về danh sách</Link>
        </Button>
      </div>
    );
  }

  const step = (pr.approvalStep ?? "DRAFT") as ApprovalStep;
  const status = pr.status as PRStatus;
  // V4.4 UI nhóm C-PR — nhãn loại phiếu ĐÚNG theo record thật (trước hard-code
  // "YCVT" trong mọi dialog/toast dùng chung cho cả 2 loại, kể cả khi record
  // là DNVT — xem UI_INVENTORY.md §5 C.B).
  const formLabel = pr.formType === "DNVT" ? "DNVT" : "MRF";

  // V4.0 — "Trưởng bộ phận" duyệt bước 2 LÀ KHO (kiểm lượng tồn rồi duyệt),
  // không còn là Thiết kế (planner). Phải khớp guard server tại
  // apps/web/src/app/api/purchase-requests/[id]/dept-approve/route.ts.
  // V4.1 D8 — người lập phiếu không tự duyệt (trừ admin) — khớp guard server.
  const selfApprovalBlocked = isSelfApprovalBlocked({
    creatorId: pr.requestedBy,
    actorId: session.data?.id ?? "",
    actorRoles: roles,
  });
  const canDeptApprove =
    (isAdmin || isWarehouse) && step === "SUBMITTED" && !selfApprovalBlocked;
  const canDirectorApprove =
    (isAdmin || isPurchaser) && step === "DEPT_APPROVED" && !selfApprovalBlocked;
  const waitingOthers =
    selfApprovalBlocked &&
    (((isWarehouse) && step === "SUBMITTED") ||
      (isPurchaser && step === "DEPT_APPROVED"));
  // V4.1 TM-06 — phiếu DRAFT (VD tạo từ thiếu hụt) có nút Gửi cho người lập.
  // L5 — nháp chỉ người lập (hoặc admin) gửi/sửa/xoá — khớp guard server.
  const draftSubject = { userId: session.data?.id ?? "", roles };
  const canSubmit = canEditPRDraft(draftSubject, pr);
  // TASK-6VIEC Việc 2 — "Sửa phiếu" (mở lại form tạo ở chế độ sửa nháp) chỉ
  // cho người lập (bất kể role) hoặc vai có update:pr trong RBAC matrix —
  // khớp guard server PATCH /api/purchase-requests/[id].
  const canEditDraft = canEditPRDraft(draftSubject, pr);
  // L6 — "Tạo lại từ phiếu này" cho phiếu bị từ chối/đã huỷ (người lập hoặc admin).
  const canRecreate = canRecreatePR(draftSubject, pr);
  const editDraftHref =
    pr.formType === "DNVT"
      ? `/procurement/purchase-requests/new-dnvt?draftId=${pr.id}`
      : `/procurement/purchase-requests/new-mrf?draftId=${pr.id}`;
  // V3.9 — Admin duyệt nhanh gộp 2 cấp khi phiếu vừa SUBMITTED.
  const canQuickApprove = isAdmin && step === "SUBMITTED";
  // V4.0 — người từ chối phải là người duyệt được bước tương ứng: Kho (bước 2)
  // hoặc Thu mua (bước 3), cộng admin. Planner không còn nằm trong luồng duyệt.
  // A8 — khoá đúng bước: SUBMITTED → Kho/admin; DEPT_APPROVED → Thu mua/admin.
  const canReject = canRejectAtStep(step, [
    ...(isAdmin ? ["admin"] : []),
    ...(isWarehouse ? ["warehouse"] : []),
    ...(isPurchaser ? ["purchaser"] : []),
  ]);
  // Phiếu đã xuất đủ/kết thúc (completedAt) không cần lên PO nữa.
  // Chỉ mua PHẦN CÒN THIẾU: mọi dòng đã được Kho đáp ứng đủ → không có gì để mua.
  const needsBuy = pr.lines.some((l) => prLineToPoLine(l, l.issuedQty ?? 0) !== null);
  const canConvert =
    (isAdmin || isPurchaser) && status === "APPROVED" && !pr.completedAt && needsBuy;
  // V3.7.70 — Manual timeline events
  // L3 — Kho xuất được ngay khi phiếu đã duyệt (APPROVED/CONVERTED) còn tồn khả
  // dụng, KHÔNG cần chờ nhận hàng PO. L8 — còn xuất tiếp nhiều đợt tới khi đủ.
  const warehouseStage = isWarehouseIssueStage({ status, approvalStep: step });
  const issuedAny = (pr.goodsIssues?.length ?? 0) > 0;
  // N5 — chỉ hiện nút khi còn SL xuất được theo trần (gồm trần theo PO chưa về). Ngoại lệ: đã xuất
  // ≥ 1 đợt, không còn phần cần mua chờ về mà còn dòng chưa đủ → vẫn mở hộp thoại để "Kết thúc".
  const issuableLeft = detail.data?.data.warehouseIssuableRemaining ?? 0;
  const canFinishOnly =
    issuedAny &&
    !pr.issueProgress?.outstandingBuy &&
    (pr.issueProgress?.pendingLines ?? 0) > 0;
  const canMarkIssued =
    (isAdmin || isWarehouse) &&
    !pr.goodsIssuedAt &&
    (((status === "APPROVED" || status === "CONVERTED") && (issuableLeft > 0 || canFinishOnly)) ||
      // Giai đoạn Kho (đã qua Kho duyệt, chưa duyệt cuối): chỉ khi còn phần xuất được từ tồn.
      (warehouseStage && issuableLeft > 0));
  // L1 — Kho "Kiểm tồn lại": phiếu đã duyệt, chưa hoàn tất, chưa có PO sống (phiếu có thể bị kẹt
  // vì tồn đã giao cho phiếu khác). Server kiểm lại trạng thái + PO.
  // L4 — "PO sống" = còn PO ĐANG CHỜ hàng về (server tính: chưa huỷ, chưa đóng/nhận đủ).
  const hasPendingPo = detail.data?.data.hasPendingPo ?? false;
  const canRecheckStock =
    (isAdmin || isWarehouse) &&
    !hasPendingPo &&
    isStockRecheckableState({
      status,
      approvalStep: step,
      completedAt: pr.completedAt,
      goodsIssuedAt: pr.goodsIssuedAt,
    });
  // C2 — hoàn tất ở phần đã xuất vì phần mua bị từ chối.
  const closedByPartialReject = isClosedByPartialReject(pr);
  // T1 — trạng thái kết thúc (Từ chối / Đã huỷ / Hoàn tất) luôn ưu tiên hơn "Đang xuất kho".
  const isTerminalState =
    status === "REJECTED" || status === "CANCELLED" || !!pr.completedAt || step === "DONE";
  const inIssuing = issuedAny && !pr.goodsIssuedAt && !isTerminalState;
  const canMarkCompleted =
    isAdmin && !!pr.goodsIssuedAt && !pr.completedAt;
  // V3.7.71 — Hard-delete YCVT, admin only.
  // TASK-6VIEC Việc 2 — hoặc người lập phiếu xoá phiếu NHÁP của chính mình
  // (khớp guard server DELETE /api/purchase-requests/[id]).
  // N6 — đã có phiếu xuất kho (tồn đã trừ) thì không xoá được (server chặn A3).
  const canDelete = (isAdmin || canEditPRDraft(draftSubject, pr)) && !issuedAny;
  // V4.4 (Việc 4) — Huỷ phiếu: người tạo khi còn Nháp/Chờ duyệt, hoặc admin
  // khi đã duyệt xong (APPROVED) mà chưa có PO (server kiểm lại — đây chỉ để
  // ẩn/hiện nút, không phải nguồn sự thật quyền hạn). Dùng chung
  // `canCancelPR` với route API để 2 nơi không lệch logic.
  // N6 — đã có phiếu xuất kho thì không huỷ được (server chặn A3).
  const canCancel =
    !issuedAny &&
    canCancelPR({
      status,
      creatorId: pr.requestedBy,
      actorId: session.data?.id ?? "",
      actorRoles: roles,
    });

  const paperFormNo = pr.paperFormNo ?? "—";
  // A18 — cột Đã xuất / Còn lại chỉ hiện khi đã có xuất kho + API trả issuedQty.
  const showIssued = issuedAny && pr.lines.some((l) => l.issuedQty != null);
  const remainingOfLine = (l: PRLineEnriched): number => {
    const p = pr.issueProgress?.lines.find((x) => x.id === l.id);
    if (p) return p.remaining;
    const cap = Math.min(Number(l.qty) || 0, l.approvedQty != null ? Number(l.approvedQty) : Infinity);
    return Math.max(0, cap - (l.issuedQty ?? 0));
  };
  // A18 — trạng thái PO thật (nếu server trả danh sách PO).
  const poList = pr.purchaseOrders;
  const poAllCancelled = !!poList && poList.length > 0 && poList.every((p) => p.status === "CANCELLED");
  const poTracking = poList && poList.length > 0
    ? poList.map((p) => `${p.poNo ?? p.code ?? "PO"}: ${statusLabel("po", p.status)}`).join(", ")
    : null;
  const todayStr = fmtDateVN(pr.createdAt);

  const handleApproveSubmit = async () => {
    try {
      if (approveOpen === "dept") {
        await deptApprove.mutateAsync({
          note: approveNote.trim() || null,
          buyQtys: stockBuy.valid ? stockBuy.qtys : undefined,
        });
        toast.success("Đã duyệt bước Trưởng bộ phận");
      } else if (approveOpen === "director") {
        await directorApprove.mutateAsync({ note: approveNote.trim() || null });
        toast.success("Đã duyệt cuối — phiếu hoàn tất phê duyệt");
      } else if (approveOpen === "quick") {
        await quickApprove.mutateAsync({
          note: approveNote.trim() || null,
          buyQtys: stockBuy.valid ? stockBuy.qtys : undefined,
        });
        toast.success("Đã duyệt nhanh 2 cấp — phiếu sẵn sàng tạo PO");
      }
      setApproveOpen(null);
      setApproveNote("");
    } catch (err) {
      toast.error(`Duyệt thất bại: ${(err as Error).message}`);
    }
  };

  const handleRecheck = async () => {
    try {
      const r = await recheckStock.mutateAsync({
        buyQtys: stockBuy.valid ? stockBuy.qtys : undefined,
      });
      toast.success(
        r.data.increased
          ? "Cần mua thêm — phiếu đã quay về chờ duyệt cuối cho phần cần mua."
          : "Đã kiểm tồn lại: không phải mua thêm, phiếu giữ nguyên.",
      );
      setRecheckOpen(false);
    } catch (err) {
      toast.error(`Kiểm tồn lại thất bại: ${(err as Error).message}`);
    }
  };

  const handleReject = async () => {
    if (rejectReason.trim().length < 3) {
      toast.error("Lý do từ chối tối thiểu 3 ký tự");
      return;
    }
    try {
      await reject.mutateAsync({
        reason: rejectReason.trim(),
        // M1 — bước đang thấy; phiếu đã sang bước khác → server 409 "tải lại trang".
        ...(step === "SUBMITTED" || step === "DEPT_APPROVED" ? { expectedStep: step } : {}),
      });
      toast.success(`Đã từ chối phiếu ${formLabel}`);
      setRejectOpen(false);
      setRejectReason("");
    } catch (err) {
      toast.error(`Từ chối thất bại: ${(err as Error).message}`);
    }
  };

  const handleCancel = async () => {
    if (cancelReason.trim().length < 3) {
      toast.error("Lý do huỷ tối thiểu 3 ký tự");
      return;
    }
    try {
      await cancel.mutateAsync({ reason: cancelReason.trim() });
      toast.success(`Đã huỷ phiếu ${formLabel}`);
      setCancelOpen(false);
      setCancelReason("");
    } catch (err) {
      toast.error(`Huỷ thất bại: ${(err as Error).message}`);
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
          {/* V4.1 UI-28: thống nhất tên với menu. */}
          Đề xuất vật tư
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 max-w-full items-center gap-3">
            <div className="min-w-0 max-w-full">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {pr.code}
                </span>
                {paperFormNo !== "—" ? (
                  // V4.4 UI nhóm C-PR — trước dùng hex #005D9F cứng (ngoài khung
                  // mô phỏng phiếu giấy, lẫn vào toolbar app) → đổi sang Badge
                  // chuẩn hệ thống (tone info) để không rò màu ngoài hệ.
                  <Badge variant="info" className="font-mono normal-case tracking-normal">
                    {paperFormNo}
                  </Badge>
                ) : null}
                <StatusPill
                  tone={
                    closedByPartialReject
                      ? "warning"
                      : inIssuing
                        ? "info"
                        : STEP_TONE[step]
                  }
                  label={
                    closedByPartialReject
                      ? REJECTED_PARTIAL_LABEL
                      : inIssuing
                        ? warehouseStage
                          ? "Kho đang xuất – chờ duyệt mua"
                          : "Đang xuất kho"
                        : STEP_LABEL[step]
                  }
                  dot
                />
              </div>
              <h1 className="mt-1 line-clamp-2 min-w-0 [overflow-wrap:anywhere] text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                {pr.title || (pr.formType === "DNVT" ? "Phiếu DNVT" : "Phiếu MRF")}
              </h1>
              {detail.data?.data.shortOfCommitment && (isAdmin || isWarehouse || isPurchaser) ? (
                <p
                  role="alert"
                  className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    {canRecheckStock
                      ? "Tồn không đủ cho phần đã cam kết — bấm “Kiểm tồn lại”."
                      : "Tồn đang thiếu so với phần đã giữ — liên hệ Kho kiểm tồn lại các phiếu cùng vật tư."}
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* V4.1 (§2.4): gộp In / Excel / PDF vào 1 nút "Xuất ▾" — bớt nút trên hàng. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" disabled={exporting !== null}>
                  {exporting !== null ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Download className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Xuất
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[11rem]">
                <DropdownMenuItem onSelect={handlePrint}>
                  <Printer className="h-3.5 w-3.5" aria-hidden />
                  In phiếu
                </DropdownMenuItem>
                {canExportExcel && (
                  <DropdownMenuItem
                    disabled={exporting !== null}
                    onSelect={() => void handleExportExcel()}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
                    Excel
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  disabled={exporting !== null}
                  onSelect={() => void handleExportPdf()}
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* TASK-6VIEC Việc 2 — mở lại phiếu NHÁP để sửa tiếp trước khi gửi. */}
            {canEditDraft && (
              <Button asChild size="sm" variant="outline">
                <Link href={editDraftHref}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Sửa phiếu
                </Link>
              </Button>
            )}
            {canRecreate && (
              <Button
                size="sm"
                variant="outline"
                disabled={recreate.isPending}
                onClick={() =>
                  recreate.mutate(undefined, {
                    onSuccess: (res) => {
                      const skipped = res.meta.skippedLines;
                      const issuedFull = res.meta.issuedFullLines ?? [];
                      const reduced = res.meta.reducedLines ?? [];
                      // C2 — liệt kê dòng bị bỏ / giảm SL vì Kho đã xuất.
                      const notes = [
                        skipped.length > 0
                          ? `Bỏ ${skipped.length} dòng vì vật tư đã vô hiệu hoá: ${skipped.map((x) => x.label).join(", ")}`
                          : null,
                        issuedFull.length > 0
                          ? `Bỏ ${issuedFull.length} dòng Kho đã xuất đủ: ${issuedFull.map((x) => x.label).join(", ")}`
                          : null,
                        reduced.length > 0
                          ? `Giảm SL (trừ phần đã xuất): ${reduced
                              .map((x) => `${x.label} ${x.from} → ${x.to}`)
                              .join("; ")}`
                          : null,
                      ].filter(Boolean);
                      toast.success(
                        `Đã tạo phiếu nháp ${res.data.code} từ ${res.meta.sourceCode} (${res.meta.copiedLines} dòng)`,
                        notes.length > 0
                          ? { description: notes.join(" · "), duration: 12_000 }
                          : undefined,
                      );
                      router.push(
                        res.data.formType === "DNVT"
                          ? `/procurement/purchase-requests/new-dnvt?draftId=${res.data.id}`
                          : `/procurement/purchase-requests/new-mrf?draftId=${res.data.id}`,
                      );
                    },
                    onError: (e) => toast.error(`Không tạo lại được: ${(e as Error).message}`),
                  })
                }
              >
                {recreate.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                )}
                Tạo lại từ phiếu này
              </Button>
            )}
            {canSubmit && (
              <Button
                size="sm"
                onClick={() =>
                  submitPr.mutate(undefined, {
                    onSuccess: () => toast.success("Đã gửi phiếu — chờ Kho duyệt"),
                    onError: (e) => toast.error(`Gửi thất bại: ${(e as Error).message}`),
                  })
                }
                disabled={submitPr.isPending}
              >
                {submitPr.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
                Gửi phiếu
              </Button>
            )}
            {waitingOthers && (
              <span className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                Bạn là người lập phiếu — cần người khác duyệt bước này
              </span>
            )}
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
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelOpen(true)}
                className="border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <X className="h-3.5 w-3.5" />
                Huỷ phiếu
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
            {canRecheckStock && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRecheckOpen(true)}
                className="border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-950/40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Kiểm tồn lại
              </Button>
            )}
            {canMarkIssued && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIssueDialogOpen(true)}
                className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/40"
              >
                <Truck className="h-3.5 w-3.5" />
                {issuedAny ? "Xuất kho đợt tiếp" : "Đã xuất kho"}
              </Button>
            )}
            {canMarkCompleted && (
              <Button
                size="sm"
                onClick={() =>
                  void (async () => {
                    const ok = await askConfirm({
                      title: `Đóng phiếu ${formLabel} này?`,
                      description: "Sau khi đóng không sửa được.",
                      confirmLabel: "Hoàn tất",
                    });
                    if (!ok) return;
                    markCompleted.mutate(undefined, {
                      onSuccess: () => toast.success("Phiếu đã hoàn tất"),
                      onError: (e) =>
                        toast.error(`Lỗi: ${(e as Error).message}`),
                    });
                  })()
                }
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

            {/* V4.1 (§2.4): "Xoá phiếu" vào menu "⋯" — không đứng cạnh nút Duyệt. */}
            {canDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Thao tác khác"
                    title="Thao tác khác"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[11rem]">
                  <DropdownMenuItem
                    variant="danger"
                    disabled={deletePR.isPending}
                    onSelect={() => {
                      setDeleteConfirmText("");
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Xoá phiếu
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
          <div className="grid grid-cols-1 items-center gap-2 border-b-2 border-zinc-900 px-4 py-3 text-[12px] md:grid-cols-[1fr_2fr_1fr] print:grid-cols-[1fr_2fr_1fr] print:dark:border-zinc-900">
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
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px] md:block md:space-y-1 md:text-right print:block print:space-y-1 print:text-right">
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
                <span className="min-w-0 [overflow-wrap:anywhere]">{pr.title ?? "—"}</span>
              </FieldRow>
              <FieldRow label="Lý do đề xuất:" wide>
                <span className="min-w-0 whitespace-pre-line [overflow-wrap:anywhere]">
                  {pr.requestReason ?? "—"}
                </span>
              </FieldRow>
            </div>
          </section>

          {/* II. Danh mục vật tư */}
          <section className="border-b border-zinc-300 print:dark:border-zinc-300">
            <SectionTitle>II. Danh mục vật tư</SectionTitle>
            {/* Desktop + IN: bảng 15 cột. Mobile màn hình: ẩn (dùng card bên dưới).
                print:block + print:overflow-visible để bản in A4 LUÔN ra bảng,
                không phụ thuộc breakpoint md (bẫy in trang trắng). */}
            <div className="hidden overflow-x-auto md:block print:block print:overflow-visible">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#F5F5F5] text-xs font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:bg-zinc-100 print:dark:text-zinc-700">
                    <Th w="w-8">STT</Th>
                    <Th w="min-w-[160px]">Tên vật tư</Th>
                    <Th w="w-28">Mã VT</Th>
                    <Th w="min-w-[120px]">Quy cách</Th>
                    <Th w="w-14">ĐVT</Th>
                    <Th w="w-14" align="right">SL</Th>
                    <Th w="w-16" align="right">Tồn kho</Th>
                    <Th w="w-14" align="right">Cần mua</Th>
                    {showIssued ? <Th w="w-16" align="right">Đã xuất</Th> : null}
                    {showIssued ? <Th w="w-16" align="right">Còn lại</Th> : null}
                    <Th w="w-28">Ngày cần</Th>
                    <Th w="w-28">Ưu tiên</Th>
                    <Th w="w-28">Phân loại</Th>
                    <Th w="w-28" align="right">Đơn giá DK</Th>
                    <Th w="w-32" align="right">Tổng tiền</Th>
                    <Th w="w-24">Mã ref</Th>
                    <Th w="w-28">Mã ID</Th>
                    <Th w="min-w-[120px]">Ghi chú</Th>
                  </tr>
                </thead>
                <tbody>
                  {pr.lines.map((l, idx) => {
                    const qty = Number(l.qty) || 0;
                    const onHand =
                      l.availableQty != null
        ? Number(l.availableQty)
        : l.onHandSnapshot != null
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
                          <span className="block [overflow-wrap:anywhere] font-medium">
                            {l.name ?? "—"}
                          </span>
                        </Td>
                        <Td>
                          <span className="block break-words font-mono text-[10.5px] text-zinc-600 dark:text-zinc-400 print:dark:text-zinc-600">
                            {l.sku ?? "—"}
                          </span>
                        </Td>
                        <Td><span className="block [overflow-wrap:anywhere]">{l.specification ?? "—"}</span></Td>
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
                        {showIssued ? (
                          <Td align="right">
                            <span className="font-mono">{(l.issuedQty ?? 0) > 0 ? fmtNum(l.issuedQty ?? 0) : "—"}</span>
                          </Td>
                        ) : null}
                        {showIssued ? (
                          <Td align="right">
                            <span className="font-mono">{fmtNum(remainingOfLine(l))}</span>
                          </Td>
                        ) : null}
                        <Td>{fmtDateVN(l.neededBy)}</Td>
                        <Td>{PRIORITY_LABELS[l.priority ?? "NORMAL"] ?? "—"}</Td>
                        <Td>{(l.category ? CATEGORY_LABELS[l.category] : null) ?? "—"}</Td>
                        <Td align="right">
                          <span className="tabular-nums">
                            {fmtMoney(l.estimatedUnitPrice)}
                          </span>
                        </Td>
                        <Td align="right">
                          <span className="font-semibold tabular-nums">
                            {lineTotal > 0 ? fmtMoney(lineTotal) : "—"}
                          </span>
                        </Td>
                        <Td>{l.referenceCode ?? "—"}</Td>
                        <Td>
                          {l.lineRefCode ? (
                            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
                              {l.lineRefCode}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </Td>
                        <Td>{l.notes ?? "—"}</Td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-700 bg-[#F5F5F5] font-semibold dark:bg-zinc-800 print:dark:bg-zinc-100">
                    <td colSpan={showIssued ? 15 : 13} className="px-2 py-2 text-right text-[11px]">
                      Tổng tiền dự kiến (VNĐ):
                    </td>
                    <td className="px-2 py-2 text-right text-[12px] text-[#005D9F] tabular-nums">
                      {fmtMoney(pr.totalEstimatedAmount)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile: card-list thay bảng (ẩn khi IN — bản in dùng bảng ở trên) */}
            <div className="space-y-2 p-2 md:hidden print:hidden">
              {pr.lines.map((l, idx) => (
                <LineItemCard
                  key={l.id}
                  line={l}
                  idx={idx}
                  remaining={showIssued ? remainingOfLine(l) : null}
                />
              ))}
              {/* tfoot bị ẩn theo bảng → render lại tổng tiền cho mobile */}
              <div className="mt-2 flex items-center justify-between rounded-lg border-2 border-zinc-700 bg-zinc-50 px-3 py-2.5 dark:border-zinc-500 dark:bg-zinc-800">
                <span className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-100">
                  Tổng tiền dự kiến
                </span>
                <span className="text-[15px] font-bold tabular-nums text-[#005D9F] dark:text-sky-300">
                  {formatMoney(pr.totalEstimatedAmount)}
                </span>
              </div>
            </div>
          </section>

          {/* III. Phê duyệt */}
          <section className="border-b border-zinc-300 print:dark:border-zinc-300">
            <SectionTitle>III. Kiểm tra &amp; Phê duyệt</SectionTitle>
            <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#F5F5F5] text-xs font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:bg-zinc-100 print:dark:text-zinc-700">
                  <Th w="md:w-44">Vai trò</Th>
                  <Th w="md:w-48">Họ tên</Th>
                  <Th w="md:w-40">Ký tên / Ngày</Th>
                  <Th>Ghi chú</Th>
                </tr>
              </thead>
              <tbody>
                <ApprovalRow
                  role="Người đề xuất"
                  name={pr.requestedByName ?? "—"}
                  date={fmtDateTimeVN(pr.createdAt)}
                  signed={status !== "DRAFT"}
                  note={status !== "DRAFT" ? "Đã ký khi gửi phiếu" : "Chưa gửi phiếu"}
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
                {(step === "REJECTED" || closedByPartialReject) && pr.rejectionReason ? (
                  <tr className="border-b border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/30">
                    <Td>
                      <span className="font-bold text-red-700 dark:text-red-300">
                        {closedByPartialReject ? "Từ chối phần mua" : "Từ chối"}
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
            </div>
          </section>

          {/* IV. Theo dõi */}
          <section className="border-b border-zinc-300 print:dark:border-zinc-300">
            <SectionTitle>IV. Theo dõi</SectionTitle>
            <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#F5F5F5] text-xs font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:bg-zinc-100 print:dark:text-zinc-700">
                  <Th w="md:w-52">Trạng thái</Th>
                  <Th w="md:w-44">Người phụ trách</Th>
                  <Th w="md:w-40">Ngày thực hiện</Th>
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
                  date={poAllCancelled ? null : (pr.poCreatedAt ?? null)}
                  who={null}
                  note={
                    poTracking
                      ? poAllCancelled
                        ? `Tất cả PO đã huỷ (${poTracking})`
                        : poTracking
                      : pr.poCreatedAt
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
                  note={
                    pr.goodsIssues && pr.goodsIssues.length > 0
                      ? `${pr.goodsIssuedAt ? "" : "Đã xuất một phần — "}Phiếu xuất ${pr.goodsIssues.map((g) => g.issueNo).join(", ")}`
                      : pr.goodsIssuedAt
                        ? "Đã xuất (không trừ tồn)"
                        : "—"
                  }
                />
                <TrackingRow
                  label="Hoàn tất"
                  date={pr.completedAt ?? null}
                  who={null}
                  note={pr.completedAt ? "Phiếu hoàn tất" : "—"}
                />
              </tbody>
            </table>
            </div>
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
            <DialogTitle>Từ chối phiếu {formLabel}</DialogTitle>
            <DialogDescription>
              Phiếu sẽ chuyển sang trạng thái "Từ chối". Người đề xuất sẽ nhận
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

      {/* V4.4 (Việc 4) — Huỷ phiếu dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Huỷ phiếu {formLabel}</DialogTitle>
            <DialogDescription>
              {status === "APPROVED"
                ? "Phiếu đã duyệt xong nhưng chưa có Đơn hàng mua — huỷ sẽ dừng hẳn quy trình, không tạo PO nữa."
                : "Phiếu sẽ chuyển sang trạng thái Đã huỷ — không thể khôi phục, tạo phiếu mới nếu vẫn cần."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason" required>
              Lý do huỷ
            </Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="VD: Tạo nhầm, không còn cần mua nữa, đổi phương án..."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Đóng
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleCancel()}
              disabled={cancel.isPending}
            >
              {cancel.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Huỷ phiếu
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
                ? "Kiểm tồn rồi nhập SL cần mua từng dòng. Nếu mọi dòng cần mua = 0 (Kho đáp ứng đủ), phiếu bỏ qua duyệt cuối; ngược lại chuyển sang chờ Giám đốc/Mua hàng duyệt cuối."
                : approveOpen === "quick"
                  ? "Tên bạn sẽ hiện ở CẢ 2 ô ký (Trưởng bộ phận + Giám đốc). Phiếu chuyển thẳng sang Đã duyệt, sẵn sàng tạo PO. Kế toán sẽ nhận thông báo tải PDF/Excel."
                  : "Sau khi duyệt cuối, phiếu sẵn sàng để tạo PO. Bộ phận Mua hàng sẽ nhận thông báo."}
            </DialogDescription>
          </DialogHeader>
          {(approveOpen === "dept" || approveOpen === "quick") && (
            <PrStockCheckPanel prId={id} onChange={onStockBuyChange} />
          )}
          {approveOpen === "director" && (
            <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
              {formatCoverageSummary(summarizeLineCoverage(pr.lines))}
            </p>
          )}
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
                quickApprove.isPending ||
                ((approveOpen === "dept" || approveOpen === "quick") && !stockBuy.valid)
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

      {/* L1 — Kiểm tồn lại (phiếu đã duyệt, chưa có PO) */}
      <Dialog open={recheckOpen} onOpenChange={setRecheckOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kiểm tồn lại</DialogTitle>
            <DialogDescription>
              Tính lại SL cần mua theo tồn khả dụng hiện tại (đã trừ phần dành cho phiếu khác). Nếu
              phải mua thêm, phiếu quay về chờ duyệt cuối cho phần cần mua; nếu không, giữ nguyên.
            </DialogDescription>
          </DialogHeader>
          {recheckOpen && <PrStockCheckPanel prId={id} recheck onChange={onStockBuyChange} />}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRecheckOpen(false)}>
              Huỷ
            </Button>
            <Button
              onClick={() => void handleRecheck()}
              disabled={recheckStock.isPending || !stockBuy.valid}
            >
              {recheckStock.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Xác nhận kiểm tồn lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* V3.7.71 — Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoá phiếu {formLabel} — không thể hoàn tác</DialogTitle>
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

      {/* V4.2 (TASK "Trừ tồn luôn") — dialog chọn lô/bin xuất kho */}
      <MarkPrIssuedDialog
        open={issueDialogOpen}
        onOpenChange={setIssueDialogOpen}
        prId={id}
        prLabel={paperFormNo !== "—" ? paperFormNo : pr.code}
        stage={warehouseStage ? "WAREHOUSE" : "FINAL"}
        lines={pr.lines.map((l) => ({
          id: l.id,
          lineNo: l.lineNo,
          itemId: l.itemId,
          sku: l.sku,
          name: l.name,
          uom: l.uom,
          itemUom: l.itemUom,
          qty: l.qty,
          approvedQty: l.approvedQty,
          issuedQty: l.issuedQty,
          issueCap: l.issueCap,
          issueRemaining: l.issueRemaining,
          availableQty: l.availableQty,
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

/**
 * V3.12.3 — Card 1 dòng vật tư cho MOBILE (mục II). Bảng 15 cột giữ nguyên cho
 * desktop + IN; card này chỉ hiện <md. Tính lại qty/onHand/approvedQty/lineTotal
 * 1 lần (DRY với <tr> bảng). Giữ tín hiệu màu lowStock (rose) + approvedQty (emerald).
 */
function LineItemCard({
  line: l,
  idx,
  remaining,
}: {
  line: PRLineEnriched;
  idx: number;
  remaining?: number | null;
}) {
  const qty = Number(l.qty) || 0;
  const onHand = l.availableQty != null
        ? Number(l.availableQty)
        : l.onHandSnapshot != null
          ? Number(l.onHandSnapshot)
          : null;
  const approvedQty = l.approvedQty != null ? Number(l.approvedQty) : null;
  const lowStock = onHand != null && qty > 0 ? onHand < qty : false;
  const lineTotal =
    l.lineTotal != null
      ? Number(l.lineTotal)
      : qty * (Number(l.estimatedUnitPrice) || 0);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {/* Cấp 1 — tên + mã + STT/phân loại */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-[14px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
            {l.name ?? "—"}
          </div>
          <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
            {l.sku ?? "—"}
          </div>
        </div>
        <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          #{idx + 1} · {(l.category ? CATEGORY_LABELS[l.category] : null) ?? "—"}
        </span>
      </div>
      {/* Cấp 2 — khối số quyết định */}
      <div className="grid grid-cols-3 gap-2 rounded-md bg-zinc-50 p-2 dark:bg-zinc-800/50">
        <Metric label="SL cần" value={fmtNum(qty)} unit={l.uom ?? l.itemUom} />
        <Metric
          label="Tồn kho"
          value={onHand != null ? fmtNum(onHand) : "—"}
          className={
            lowStock
              ? "font-semibold text-rose-600 dark:text-rose-400"
              : onHand != null
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-zinc-400"
          }
        />
        <Metric
          label="Cần mua"
          value={approvedQty != null ? fmtNum(approvedQty) : "—"}
          className={
            approvedQty != null
              ? "font-semibold text-emerald-700 dark:text-emerald-400"
              : "text-zinc-400"
          }
        />
      </div>
      {remaining != null ? (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-zinc-50 p-2 dark:bg-zinc-800/50">
          <Metric label="Đã xuất" value={(l.issuedQty ?? 0) > 0 ? fmtNum(l.issuedQty ?? 0) : "—"} />
          <Metric label="Còn lại" value={fmtNum(remaining)} />
        </div>
      ) : null}
      {/* Cấp 2b — tiền */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Metric
          label="Đơn giá DK"
          value={fmtMoney(l.estimatedUnitPrice)}
          className="font-sans"
        />
        <Metric
          label="Tổng tiền"
          value={lineTotal > 0 ? fmtMoney(lineTotal) : "—"}
          className="font-sans font-semibold text-[#005D9F] dark:text-sky-300"
        />
      </div>
      {/* Cấp 3 — phụ (ẩn field rỗng) */}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-zinc-100 pt-2 text-[11px] text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <Meta label="Quy cách" value={l.specification} />
        <Meta label="Ngày cần" value={fmtDateVN(l.neededBy)} />
        <Meta label="Ưu tiên" value={PRIORITY_LABELS[l.priority ?? "NORMAL"]} />
        <Meta label="Mã ref" value={l.referenceCode} />
        <Meta label="Mã ID" value={l.lineRefCode} />
        <Meta label="Ghi chú" value={l.notes} wide />
      </dl>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  className,
}: {
  label: string;
  value: string;
  unit?: string | null;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className={cn("font-mono text-[15px] tabular-nums", className)}>
        {value}
        {unit ? (
          <span className="ml-1 text-[11px] font-normal text-zinc-400">
            {" "}
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Field phụ cấp 3 — ẩn hẳn nếu rỗng/"—" để card gọn. */
function Meta({
  label,
  value,
  wide,
}: {
  label: string;
  value: string | null | undefined;
  wide?: boolean;
}) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className={cn("min-w-0", wide ? "col-span-2" : "")}>
      <span className="text-zinc-400">{label}: </span>
      <span className="[overflow-wrap:anywhere] text-zinc-700 dark:text-zinc-300">
        {value}
      </span>
    </div>
  );
}

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
        "grid grid-cols-[110px_minmax(0,1fr)] border-b border-zinc-200 md:grid-cols-[140px_minmax(0,1fr)] dark:border-zinc-700 print:dark:border-zinc-300",
        wide ? "md:col-span-2" : "",
      )}
    >
      <div className="border-r border-zinc-200 bg-[#F5F5F5] px-3 py-2 text-[12px] font-bold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:border-zinc-300 print:dark:bg-zinc-100 print:dark:text-zinc-800">
        {label}
      </div>
      <div className="flex min-h-[28px] min-w-0 items-center px-3 py-1 text-[12px] [overflow-wrap:anywhere]">
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
