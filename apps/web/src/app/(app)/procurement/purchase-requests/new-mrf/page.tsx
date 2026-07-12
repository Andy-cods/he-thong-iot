"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Printer, Trash2 } from "lucide-react";
import type { PRCreateInput } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreatePurchaseRequest,
  usePreviewPaperFormNo,
} from "@/hooks/usePurchaseRequests";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

/**
 * V3.7.69 — `/procurement/purchase-requests/new-mrf` —
 * PHIẾU ĐỀ XUẤT VẬT TƯ (YCVT) khớp 100% Excel mẫu "YCVT Z0000002-262422.xlsx".
 *
 * Sections (theo Excel "Phiếu MRF"):
 *   Header: Logo XƯỞNG SXKD + Tên công ty + Số phiếu auto `52/PRD-MRF/0526` + Ngày lập (today)
 *   I.  Thông tin chung: Kính gửi · Bộ phận đề xuất · Người đề xuất · Lý do
 *   II. Danh mục vật tư (15 cột): STT · Tên · Mã VT · Quy cách · ĐVT · SL · Tồn kho ·
 *       Duyệt · Ngày cần · Ưu tiên · Phân loại · Đơn giá · Tổng tiền · Mã ref · Ghi chú
 *   III. Phê duyệt (5 hàng đọc-only, sẽ ký ở detail page)
 *   IV. Theo dõi (5 hàng đọc-only)
 *   V.  Quy tắc quản lý (5 bullets)
 *
 * Flow: tạo PR DRAFT → preview paper_form_no → user bấm "Gửi phiếu" → submit
 * transition sinh paper_form_no thực + chuyển SUBMITTED. Code này tạo DRAFT
 * và auto-submit trong cùng action để giữ UX 1-click cho user.
 */

export const dynamic = "force-dynamic";

/**
 * V3.7.72 — Free-text item name + SKU. itemId nullable.
 * Nếu user gõ Mã VT trùng với item trong master → backend resolve.
 * Còn lại lưu name + sku free-text.
 */
interface MRFLineDraft {
  localId: string;
  itemName: string;
  itemSku: string;
  specification: string;
  uom: string;
  qty: string;
  neededBy: string;
  priority: "URGENT" | "NORMAL" | "RESERVE";
  category: "TOOL" | "CONSUMABLE" | "MATERIAL" | "OTHER";
  estimatedUnitPrice: string;
  referenceCode: string;
  notes: string;
}

const PRIORITY_LABELS: Record<MRFLineDraft["priority"], string> = {
  URGENT: "Khẩn",
  NORMAL: "Bình thường",
  RESERVE: "Dự phòng",
};

const CATEGORY_LABELS: Record<MRFLineDraft["category"], string> = {
  TOOL: "CCDC",
  CONSUMABLE: "Tiêu hao",
  MATERIAL: "Vật tư",
  OTHER: "Khác",
};

const DEPT_OPTIONS = [
  "Bộ phận Thiết kế",
  "Bộ phận Kho",
  "Bộ phận Lắp ráp",
  "Bộ phận Gia công",
  "Bộ phận Thu mua",
  "Phòng Kế hoạch",
] as const;

function blankLine(): MRFLineDraft {
  return {
    localId: crypto.randomUUID(),
    itemName: "",
    itemSku: "",
    specification: "",
    uom: "",
    qty: "1",
    neededBy: "",
    priority: "NORMAL",
    category: "MATERIAL",
    estimatedUnitPrice: "",
    referenceCode: "",
    notes: "",
  };
}

function formatDateVN(d: Date): string {
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function NewMRFPage() {
  const router = useRouter();
  const session = useSession();
  const createPR = useCreatePurchaseRequest();
  const previewNo = usePreviewPaperFormNo();

  // Header (I. Thông tin chung)
  const [targetDepartment, setTargetDepartment] = React.useState(
    "Bộ phận Kế toán / Mua hàng",
  );
  const [proposingDepartment, setProposingDepartment] = React.useState(
    "Bộ phận Lắp ráp",
  );
  const [requestReason, setRequestReason] = React.useState("");
  const [title, setTitle] = React.useState("");

  // Auto-fill proposing department theo role user
  React.useEffect(() => {
    const roles = session.data?.roles ?? [];
    if (roles.includes("operator")) setProposingDepartment("Bộ phận Lắp ráp");
    else if (roles.includes("planner"))
      setProposingDepartment("Bộ phận Thiết kế");
    else if (roles.includes("warehouse")) setProposingDepartment("Bộ phận Kho");
    else if (roles.includes("purchaser"))
      setProposingDepartment("Bộ phận Thu mua");
    // V3.9 — qc + accountant tự đề xuất mua vật tư.
    else if (roles.includes("qc")) setProposingDepartment("Tổ QC/KCS");
    else if (roles.includes("accountant"))
      setProposingDepartment("Bộ phận Kế toán");
  }, [session.data?.roles]);

  // Lines (II. Danh mục vật tư) — V3.7.72 free-text name+sku
  const [lines, setLines] = React.useState<MRFLineDraft[]>(() => [blankLine()]);

  const validLines = React.useMemo(
    () =>
      lines.filter(
        (l) => l.itemName.trim().length > 0 && Number(l.qty) > 0,
      ),
    [lines],
  );

  const totalAmount = React.useMemo(
    () =>
      validLines.reduce((sum, l) => {
        const price = Number(l.estimatedUnitPrice) || 0;
        const qty = Number(l.qty) || 0;
        return sum + price * qty;
      }, 0),
    [validLines],
  );

  const updateLine = (id: string, patch: Partial<MRFLineDraft>) => {
    setLines((prev) =>
      prev.map((l) => (l.localId === id ? { ...l, ...patch } : l)),
    );
  };

  const addLine = () => {
    if (lines.length >= 20) {
      toast.warning("Phiếu YCVT tối đa 20 dòng. Tách nhiều phiếu nếu cần.");
      return;
    }
    setLines((prev) => [...prev, blankLine()]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => {
      const next = prev.filter((l) => l.localId !== id);
      return next.length === 0 ? [blankLine()] : next;
    });
  };

  const handleSubmit = async () => {
    if (validLines.length === 0) {
      toast.error("Cần ít nhất 1 dòng có Tên vật tư + số lượng > 0.");
      return;
    }
    if (!requestReason.trim()) {
      toast.error("Vui lòng nhập lý do đề xuất.");
      return;
    }

    const payload: PRCreateInput = {
      title:
        title.trim() ||
        `YCVT ${proposingDepartment} ${formatDateVN(new Date())}`,
      source: "MANUAL",
      linkedOrderId: null,
      notes: null,
      targetDepartment: targetDepartment.trim() || null,
      proposingDepartment: proposingDepartment.trim() || null,
      requestReason: requestReason.trim() || null,
      lines: validLines.map((l) => ({
        // V3.7.72 — free-text item name + sku (itemId không cần)
        itemId: null,
        itemName: l.itemName.trim() || null,
        itemSku: l.itemSku.trim() || null,
        qty: Number(l.qty),
        preferredSupplierId: null,
        snapshotLineId: null,
        neededBy: l.neededBy ? new Date(l.neededBy) : null,
        notes: l.notes.trim() || null,
        specification: l.specification.trim() || null,
        uom: l.uom.trim() || null,
        priority: l.priority,
        category: l.category,
        estimatedUnitPrice: l.estimatedUnitPrice
          ? Number(l.estimatedUnitPrice)
          : null,
        referenceCode: l.referenceCode.trim() || null,
        onHandSnapshot: null,
      })),
    };

    try {
      const res = await createPR.mutateAsync(payload);
      const formNo = res.data.paperFormNo ?? res.data.code;
      toast.success(`Đã gửi phiếu YCVT ${formNo}`);
      router.push(`/procurement/purchase-requests/${res.data.id}`);
    } catch (err) {
      toast.error((err as Error).message ?? "Không tạo được phiếu YCVT");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const pending = createPR.isPending;
  const paperFormNoPreview = previewNo.data?.data.paperFormNo ?? "—/PRD-MRF/—";
  const todayStr = formatDateVN(new Date());

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-100 dark:bg-zinc-950 print:bg-white">
      {/* Toolbar (no print) */}
      <header className="border-b border-zinc-200 bg-white px-6 py-3 print:hidden dark:border-zinc-800 dark:bg-zinc-900">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-50">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">›</span>
          <Link
            href="/procurement/purchase-requests"
            className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-50"
          >
            Yêu cầu mua hàng
          </Link>
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">›</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">
            Tạo phiếu YCVT mới
          </span>
        </nav>
        <div className="mt-1.5 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Phiếu Yêu cầu Vật tư (YCVT)
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrint}
              disabled={pending}
            >
              <Printer className="h-3.5 w-3.5" />
              In phiếu
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={pending}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Gửi phiếu
            </Button>
          </div>
        </div>
      </header>

      {/* Form sheet — print-friendly A4 landscape */}
      <div className="mx-auto w-full max-w-[1440px] p-6 print:p-0 print:max-w-none">
        <article className="border-2 border-zinc-900 bg-white text-zinc-900 shadow-md print:border print:border-zinc-900 print:shadow-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 print:dark:border-zinc-900 print:dark:bg-white print:dark:text-zinc-900">
          {/* ===== HEADER ===== */}
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
                  {paperFormNoPreview}
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

          {/* ===== I. Thông tin chung ===== */}
          <section className="border-b border-zinc-300 print:dark:border-zinc-300">
            <SectionTitle>I. Thông tin chung</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2">
              <FieldRow label="Kính gửi:">
                <input
                  value={targetDepartment}
                  onChange={(e) => setTargetDepartment(e.target.value)}
                  className="w-full bg-transparent text-[12px] outline-none"
                />
              </FieldRow>
              <FieldRow label="Bộ phận đề xuất:">
                <select
                  value={proposingDepartment}
                  onChange={(e) => setProposingDepartment(e.target.value)}
                  className="w-full bg-transparent text-[12px] outline-none"
                >
                  {DEPT_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  {!DEPT_OPTIONS.includes(
                    proposingDepartment as (typeof DEPT_OPTIONS)[number],
                  ) ? (
                    <option value={proposingDepartment}>
                      {proposingDepartment}
                    </option>
                  ) : null}
                </select>
              </FieldRow>
              <FieldRow label="Người đề xuất:">
                <span className="font-medium">
                  {session.data?.fullName ?? session.data?.username ?? "—"}
                </span>
              </FieldRow>
              <FieldRow label="Tiêu đề (tùy chọn):">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`VD: YCVT ${proposingDepartment} ${todayStr}`}
                  className="w-full bg-transparent text-[12px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                />
              </FieldRow>
              <FieldRow label="Lý do đề xuất:" required wide>
                <textarea
                  rows={2}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="VD: Mua vật tư để lắp ráp hàng hóa cho lệnh sản xuất WO-2026-001"
                  className="w-full resize-none bg-transparent text-[12px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                  maxLength={2000}
                />
              </FieldRow>
            </div>
          </section>

          {/* ===== II. Danh mục vật tư ===== */}
          <section className="border-b border-zinc-300 print:dark:border-zinc-300">
            <SectionTitle>
              II. Danh mục vật tư
              <Button
                size="sm"
                variant="secondary"
                onClick={addLine}
                disabled={pending || lines.length >= 20}
                className="ml-auto print:hidden"
              >
                <Plus className="h-3 w-3" />
                Thêm dòng
              </Button>
            </SectionTitle>

            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#F5F5F5] text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:bg-zinc-100 print:dark:text-zinc-700">
                    <Th w="w-8">STT</Th>
                    <Th w="min-w-[160px]">Tên vật tư</Th>
                    <Th w="w-28">Mã VT</Th>
                    <Th w="min-w-[120px]">Quy cách</Th>
                    <Th w="w-14">ĐVT</Th>
                    <Th w="w-14" align="right">
                      SL
                    </Th>
                    <Th w="w-16" align="right">
                      Tồn kho
                    </Th>
                    <Th w="w-14" align="right">
                      Duyệt
                    </Th>
                    <Th w="w-28">Ngày cần</Th>
                    <Th w="w-28">Ưu tiên</Th>
                    <Th w="w-28">Phân loại</Th>
                    <Th w="w-28" align="right">
                      Đơn giá DK
                    </Th>
                    <Th w="w-32" align="right">
                      Tổng tiền
                    </Th>
                    <Th w="w-24">Mã ref</Th>
                    <Th w="min-w-[120px]">Ghi chú</Th>
                    <Th w="w-8" hideOnPrint>
                      &nbsp;
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const lineTotal =
                      (Number(l.qty) || 0) *
                      (Number(l.estimatedUnitPrice) || 0);
                    return (
                      <tr
                        key={l.localId}
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
                          {/* V3.7.72 — Free-text Tên vật tư (textarea wrap) */}
                          <textarea
                            value={l.itemName}
                            onChange={(e) =>
                              updateLine(l.localId, {
                                itemName: e.target.value,
                              })
                            }
                            placeholder="VD: Ốc M3 đầu nấm"
                            rows={1}
                            className="w-full resize-none bg-transparent text-[11px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                            style={{ minHeight: 18 }}
                          />
                        </Td>
                        <Td>
                          <input
                            type="text"
                            value={l.itemSku}
                            onChange={(e) =>
                              updateLine(l.localId, { itemSku: e.target.value })
                            }
                            placeholder="VD: VT-0001"
                            className="w-full bg-transparent font-mono text-[10.5px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                          />
                        </Td>
                        <Td>
                          <textarea
                            value={l.specification}
                            onChange={(e) =>
                              updateLine(l.localId, {
                                specification: e.target.value,
                              })
                            }
                            placeholder="VD: D6x50xL100"
                            rows={1}
                            className="w-full resize-none bg-transparent text-[11px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                            style={{ minHeight: 18 }}
                          />
                        </Td>
                        <Td>
                          <input
                            type="text"
                            value={l.uom}
                            onChange={(e) =>
                              updateLine(l.localId, { uom: e.target.value })
                            }
                            placeholder="Cái"
                            className="w-full bg-transparent text-center text-[11px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                          />
                        </Td>
                        <Td>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={l.qty}
                            onChange={(e) =>
                              updateLine(l.localId, { qty: e.target.value })
                            }
                            className="w-full bg-transparent text-right font-mono text-[11px] outline-none"
                          />
                        </Td>
                        <Td align="right">
                          <span
                            className="block text-center font-mono text-[10.5px] text-zinc-300 dark:text-zinc-600 print:dark:text-zinc-300"
                            title="Kho điền khi duyệt"
                          >
                            —
                          </span>
                        </Td>
                        <Td align="right">
                          <span
                            className="block text-center font-mono text-[10.5px] text-zinc-300 dark:text-zinc-600 print:dark:text-zinc-300"
                            title="Kho điền khi duyệt"
                          >
                            —
                          </span>
                        </Td>
                        <Td>
                          <input
                            type="date"
                            value={l.neededBy}
                            onChange={(e) =>
                              updateLine(l.localId, {
                                neededBy: e.target.value,
                              })
                            }
                            className="w-full bg-transparent text-[11px] outline-none"
                          />
                        </Td>
                        <Td>
                          <select
                            value={l.priority}
                            onChange={(e) =>
                              updateLine(l.localId, {
                                priority: e.target
                                  .value as MRFLineDraft["priority"],
                              })
                            }
                            className="w-full min-w-0 bg-transparent pr-1 text-[11px] outline-none"
                          >
                            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </Td>
                        <Td>
                          <select
                            value={l.category}
                            onChange={(e) =>
                              updateLine(l.localId, {
                                category: e.target
                                  .value as MRFLineDraft["category"],
                              })
                            }
                            className="w-full min-w-0 bg-transparent pr-1 text-[11px] outline-none"
                          >
                            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </Td>
                        <Td align="right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={l.estimatedUnitPrice}
                            onChange={(e) =>
                              updateLine(l.localId, {
                                estimatedUnitPrice: e.target.value,
                              })
                            }
                            placeholder="0"
                            className="w-full bg-transparent text-right font-mono text-[11px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                          />
                        </Td>
                        <Td align="right">
                          <span className="block break-words font-mono text-[11px] text-zinc-700 tabular-nums dark:text-zinc-300 print:dark:text-zinc-700">
                            {lineTotal > 0
                              ? lineTotal.toLocaleString("vi-VN")
                              : "—"}
                          </span>
                        </Td>
                        <Td>
                          <input
                            type="text"
                            value={l.referenceCode}
                            onChange={(e) =>
                              updateLine(l.localId, {
                                referenceCode: e.target.value,
                              })
                            }
                            placeholder="Link/PO"
                            className="w-full bg-transparent text-[11px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                          />
                        </Td>
                        <Td>
                          <textarea
                            value={l.notes}
                            onChange={(e) =>
                              updateLine(l.localId, { notes: e.target.value })
                            }
                            rows={1}
                            className="w-full resize-none bg-transparent text-[11px] outline-none"
                            style={{ minHeight: 18 }}
                          />
                        </Td>
                        <Td hideOnPrint>
                          <button
                            type="button"
                            onClick={() => removeLine(l.localId)}
                            disabled={pending || lines.length === 1}
                            className="text-zinc-400 hover:text-red-600 disabled:opacity-30 dark:text-zinc-500 dark:hover:text-red-400"
                            title="Xóa dòng"
                            aria-label="Xóa dòng"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-700 bg-[#F5F5F5] font-semibold dark:bg-zinc-800 print:dark:bg-zinc-100">
                    <td
                      colSpan={12}
                      className="px-2 py-2 text-right text-[11px]"
                    >
                      Tổng tiền dự kiến (VNĐ):
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[12px] text-[#005D9F] tabular-nums">
                      {totalAmount.toLocaleString("vi-VN")}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* ===== III. Kiểm tra & Phê duyệt ===== */}
          <section className="border-b border-zinc-300 print:dark:border-zinc-300">
            <SectionTitle>III. Kiểm tra &amp; Phê duyệt</SectionTitle>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#F5F5F5] text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:bg-zinc-100 print:dark:text-zinc-700">
                  <Th w="w-40">Vai trò</Th>
                  <Th w="w-44">Họ tên</Th>
                  <Th w="w-40">Ký tên / Ngày</Th>
                  <Th>Ghi chú</Th>
                </tr>
              </thead>
              <tbody>
                <ApprovalRow
                  role="Người đề xuất"
                  name={session.data?.fullName ?? session.data?.username ?? "—"}
                  date={todayStr}
                  note="Tự động ký khi gửi phiếu"
                />
                <ApprovalRow
                  role="Trưởng bộ phận"
                  name="—"
                  date="—"
                  note="Chờ duyệt sau khi gửi"
                />
                <ApprovalRow
                  role="Giám đốc / Mua hàng"
                  name="—"
                  date="—"
                  note="Chờ duyệt cuối"
                />
              </tbody>
            </table>
          </section>

          {/* ===== IV. Theo dõi ===== */}
          <section className="border-b border-zinc-300 print:dark:border-zinc-300">
            <SectionTitle>IV. Theo dõi</SectionTitle>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#F5F5F5] text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:bg-zinc-100 print:dark:text-zinc-700">
                  <Th w="w-44">Trạng thái</Th>
                  <Th w="w-44">Người phụ trách</Th>
                  <Th w="w-32">Ngày thực hiện</Th>
                  <Th>Ghi chú</Th>
                </tr>
              </thead>
              <tbody>
                {[
                  "Đã duyệt đề xuất",
                  "Đã tạo đơn mua (PR/PO)",
                  "Đã nhận hàng",
                  "Đã xuất kho",
                  "Hoàn tất",
                ].map((s, i) => (
                  <tr
                    key={s}
                    className={cn(
                      "border-b border-zinc-200 dark:border-zinc-700 print:dark:border-zinc-300",
                      i % 2 === 1
                        ? "bg-zinc-50/40 dark:bg-zinc-800/30 print:dark:bg-zinc-50/40"
                        : "",
                    )}
                  >
                    <Td>
                      <span className="font-medium">{s}</span>
                    </Td>
                    <Td>
                      <span className="text-zinc-400 dark:text-zinc-500 print:dark:text-zinc-400">
                        —
                      </span>
                    </Td>
                    <Td>
                      <span className="text-zinc-400 dark:text-zinc-500 print:dark:text-zinc-400">
                        —
                      </span>
                    </Td>
                    <Td>
                      <span className="text-zinc-400 dark:text-zinc-500 print:dark:text-zinc-400">
                        —
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ===== V. Quy tắc quản lý ===== */}
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
      </div>

      {/* Print styles — A4 landscape */}
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
  required,
  wide,
  children,
}: {
  label: string;
  required?: boolean;
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
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </div>
      <div className="flex min-h-[28px] items-center px-3 py-1">{children}</div>
    </div>
  );
}

function Th({
  children,
  w,
  align = "left",
  hideOnPrint,
}: {
  children: React.ReactNode;
  w?: string;
  align?: "left" | "right" | "center";
  hideOnPrint?: boolean;
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
        hideOnPrint ? "print:hidden" : "",
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
  noPad,
  hideOnPrint,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  colSpan?: number;
  noPad?: boolean;
  hideOnPrint?: boolean;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-r border-zinc-200 align-top whitespace-normal break-words dark:border-zinc-700 print:dark:border-zinc-300",
        noPad ? "" : "px-2 py-1",
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
        hideOnPrint ? "print:hidden" : "",
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
  note,
}: {
  role: string;
  name: string;
  date: string;
  note: string;
}) {
  return (
    <tr className="border-b border-zinc-200 dark:border-zinc-700 print:dark:border-zinc-300">
      <Td>
        <span className="font-medium">{role}</span>
      </Td>
      <Td>{name}</Td>
      <Td>
        <span className="font-mono text-[10.5px]">{date}</span>
      </Td>
      <Td>
        <span className="text-[10.5px] text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
          {note}
        </span>
      </Td>
    </tr>
  );
}
