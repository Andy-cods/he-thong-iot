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
import { useCreatePurchaseRequest } from "@/hooks/usePurchaseRequests";
import { ItemPicker, type ItemPickerValue } from "@/components/bom/ItemPicker";
import { useSession } from "@/hooks/useSession";

/**
 * V3.7.55 — `/procurement/purchase-requests/new-mrf` —
 * PHIẾU ĐỀ XUẤT MUA VẬT TƯ (MRF GTAM) cho gia công ngoài.
 *
 * Layout copy form Excel "01 . MẪU ĐỀ XUẤT MUA VẬT TƯ GTAM.xlsx":
 *   I. Thông tin chung (Kính gửi · Bộ phận đề xuất · Lý do)
 *   II. Danh mục vật tư (table 20 dòng max)
 *   III. (Phê duyệt) — gác lại phase sau theo user request
 *
 * Workflow phê duyệt nhiều bước (5 chữ ký) chưa làm. Sau khi tạo PR sẽ
 * auto-submit (giống flow PR cũ) → notify Thu mua qua bell.
 */

export const dynamic = "force-dynamic";

interface MRFLineDraft {
  localId: string;
  item: ItemPickerValue | null;
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
  TOOL: "CCDC (Dao cụ)",
  CONSUMABLE: "Tiêu hao",
  MATERIAL: "Vật tư",
  OTHER: "Khác",
};

function blankLine(): MRFLineDraft {
  return {
    localId: crypto.randomUUID(),
    item: null,
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

export default function NewMRFPage() {
  const router = useRouter();
  const session = useSession();
  const createPR = useCreatePurchaseRequest();

  // Header (I. Thông tin chung)
  const [targetDepartment, setTargetDepartment] = React.useState("Phòng Mua hàng");
  const [proposingDepartment, setProposingDepartment] = React.useState(
    "Bộ phận Gia công",
  );
  const [requestReason, setRequestReason] = React.useState("");
  const [title, setTitle] = React.useState("");

  // Lines (II. Danh mục vật tư)
  const [lines, setLines] = React.useState<MRFLineDraft[]>(() => [blankLine()]);

  // Auto-fill proposing department theo role user
  React.useEffect(() => {
    const roles = session.data?.roles ?? [];
    if (roles.includes("operator")) setProposingDepartment("Bộ phận Gia công");
    else if (roles.includes("planner")) setProposingDepartment("Bộ phận Thiết kế");
    else if (roles.includes("warehouse")) setProposingDepartment("Bộ phận Kho");
    else if (roles.includes("purchaser")) setProposingDepartment("Bộ phận Thu mua");
  }, [session.data?.roles]);

  const validLines = React.useMemo(
    () => lines.filter((l) => l.item && Number(l.qty) > 0),
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
      toast.warning("Form MRF tối đa 20 dòng. Tách thành nhiều phiếu nếu nhiều hơn.");
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
      toast.error("Cần ít nhất 1 dòng có vật tư + số lượng > 0.");
      return;
    }
    if (!requestReason.trim()) {
      toast.error("Vui lòng nhập lý do đề xuất.");
      return;
    }

    const payload: PRCreateInput = {
      title: title.trim() || `MRF ${proposingDepartment} ${new Date().toLocaleDateString("vi-VN")}`,
      source: "MANUAL",
      linkedOrderId: null,
      notes: null,
      targetDepartment: targetDepartment.trim() || null,
      proposingDepartment: proposingDepartment.trim() || null,
      requestReason: requestReason.trim() || null,
      lines: validLines.map((l) => ({
        itemId: l.item!.id,
        qty: Number(l.qty),
        preferredSupplierId: null,
        snapshotLineId: null,
        neededBy: l.neededBy ? new Date(l.neededBy) : null,
        notes: l.notes.trim() || null,
        specification: l.specification.trim() || null,
        uom: l.uom.trim() || l.item!.uom || null,
        priority: l.priority,
        category: l.category,
        estimatedUnitPrice: l.estimatedUnitPrice
          ? Number(l.estimatedUnitPrice)
          : null,
        referenceCode: l.referenceCode.trim() || null,
      })),
    };

    try {
      const res = await createPR.mutateAsync(payload);
      toast.success(`Đã tạo phiếu MRF ${res.data.code}`);
      router.push(`/procurement/purchase-requests/${res.data.id}`);
    } catch (err) {
      toast.error((err as Error).message ?? "Không tạo được MRF");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const pending = createPR.isPending;

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50">
      {/* Header (no print) */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4 print:hidden">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 hover:underline">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <Link
            href="/procurement/purchase-requests"
            className="hover:text-zinc-900 hover:underline"
          >
            Yêu cầu mua hàng
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="font-medium text-zinc-900">Phiếu MRF GTAM</span>
        </nav>
        <div className="mt-1.5 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Phiếu đề xuất mua vật tư (MRF GTAM)
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handlePrint} disabled={pending}>
              <Printer className="h-3.5 w-3.5" />
              In phiếu
            </Button>
            <Button size="sm" onClick={() => void handleSubmit()} disabled={pending}>
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Gửi phiếu
            </Button>
          </div>
        </div>
      </header>

      {/* Form sheet — print-friendly */}
      <div className="mx-auto w-full max-w-[1200px] p-6 print:p-4">
        <article className="rounded-md border border-zinc-300 bg-white shadow-sm print:border-zinc-900 print:shadow-none">
          {/* Title bar */}
          <div className="border-b-2 border-zinc-900 px-6 py-4 text-center print:py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-700">
              CÔNG TY CỔ PHẦN SẢN XUẤT TỰ ĐỘNG HÓA CÔNG NGHỆ TOÀN CẦU (GTAM)
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-wide text-zinc-900">
              PHIẾU ĐỀ XUẤT VẬT TƯ — NPL
            </h2>
            <p className="mt-0.5 text-[10px] text-zinc-500">
              Mẫu No: GTAM/PRD-MRF-02 · Phiên bản 1.0
            </p>
          </div>

          {/* I. Thông tin chung */}
          <section className="border-b border-zinc-200 px-6 py-4">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-800">
              I. Thông tin chung
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="mrf-target">Kính gửi</Label>
                <Input
                  id="mrf-target"
                  value={targetDepartment}
                  onChange={(e) => setTargetDepartment(e.target.value)}
                  placeholder="VD: Phòng Mua hàng"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mrf-proposing">Bộ phận đề xuất</Label>
                <Input
                  id="mrf-proposing"
                  value={proposingDepartment}
                  onChange={(e) => setProposingDepartment(e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="mrf-title">Tiêu đề phiếu (tùy chọn)</Label>
                <Input
                  id="mrf-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="VD: Đề xuất mua dao cụ Q2-2026"
                  maxLength={250}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="mrf-reason" required>
                  Lý do đề xuất
                </Label>
                <Textarea
                  id="mrf-reason"
                  rows={2}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="VD: Cần bổ sung dao cụ cho lệnh sản xuất WO-2026-001"
                  maxLength={2000}
                />
              </div>
              <div className="md:col-span-2">
                <p className="text-[11px] text-zinc-500">
                  Người đề xuất: <strong>{session.data?.fullName ?? "—"}</strong>{" "}
                  · Ngày lập: <strong>{new Date().toLocaleDateString("vi-VN")}</strong>
                </p>
              </div>
            </div>
          </section>

          {/* II. Danh mục vật tư */}
          <section className="px-6 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-800">
                II. Danh mục vật tư
              </h3>
              <Button
                size="sm"
                variant="secondary"
                onClick={addLine}
                disabled={pending || lines.length >= 20}
                className="print:hidden"
              >
                <Plus className="h-3 w-3" />
                Thêm dòng
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border border-zinc-200 print:overflow-visible">
              <table className="w-full text-[11px]">
                <thead className="bg-zinc-100">
                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left w-8">#</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left min-w-[180px]">Tên vật tư · Mã VT</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left min-w-[120px]">Quy cách</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left w-14">ĐVT</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-right w-14">SL</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left w-28">Ngày cần</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left w-24">Ưu tiên</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left w-28">Phân loại</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-right w-24">Đơn giá DK</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-right w-24">Tổng tiền</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left w-20">Mã ref</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left min-w-[100px]">Ghi chú</th>
                    <th className="px-1 py-1.5 text-center w-8 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const lineTotal =
                      (Number(l.qty) || 0) * (Number(l.estimatedUnitPrice) || 0);
                    return (
                      <tr
                        key={l.localId}
                        className="border-t border-zinc-100 align-top hover:bg-zinc-50/40"
                      >
                        <td className="border-r border-zinc-100 px-1 py-1 text-center font-mono text-[10px] text-zinc-500">
                          {idx + 1}
                        </td>
                        <td className="border-r border-zinc-100 px-1 py-1">
                          <ItemPicker
                            value={l.item}
                            onChange={(it) =>
                              updateLine(l.localId, {
                                item: it,
                                uom: l.uom || it?.uom || "",
                              })
                            }
                            disabled={pending}
                          />
                        </td>
                        <td className="border-r border-zinc-100 px-1 py-1">
                          <input
                            type="text"
                            value={l.specification}
                            onChange={(e) =>
                              updateLine(l.localId, { specification: e.target.value })
                            }
                            placeholder="D6x50xL100"
                            className="w-full bg-transparent px-1 py-0.5 text-[11px] outline-none placeholder:text-zinc-300"
                          />
                        </td>
                        <td className="border-r border-zinc-100 px-1 py-1">
                          <input
                            type="text"
                            value={l.uom}
                            onChange={(e) =>
                              updateLine(l.localId, { uom: e.target.value })
                            }
                            placeholder={l.item?.uom ?? "—"}
                            className="w-full bg-transparent px-1 py-0.5 text-[11px] outline-none placeholder:text-zinc-300"
                          />
                        </td>
                        <td className="border-r border-zinc-100 px-1 py-1">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={l.qty}
                            onChange={(e) =>
                              updateLine(l.localId, { qty: e.target.value })
                            }
                            className="w-full bg-transparent px-1 py-0.5 text-right font-mono text-[11px] outline-none"
                          />
                        </td>
                        <td className="border-r border-zinc-100 px-1 py-1">
                          <input
                            type="date"
                            value={l.neededBy}
                            onChange={(e) =>
                              updateLine(l.localId, { neededBy: e.target.value })
                            }
                            className="w-full bg-transparent px-1 py-0.5 text-[11px] outline-none"
                          />
                        </td>
                        <td className="border-r border-zinc-100 px-1 py-1">
                          <select
                            value={l.priority}
                            onChange={(e) =>
                              updateLine(l.localId, {
                                priority: e.target.value as MRFLineDraft["priority"],
                              })
                            }
                            className="w-full bg-transparent px-1 py-0.5 text-[11px] outline-none"
                          >
                            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="border-r border-zinc-100 px-1 py-1">
                          <select
                            value={l.category}
                            onChange={(e) =>
                              updateLine(l.localId, {
                                category: e.target.value as MRFLineDraft["category"],
                              })
                            }
                            className="w-full bg-transparent px-1 py-0.5 text-[11px] outline-none"
                          >
                            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="border-r border-zinc-100 px-1 py-1">
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
                            className="w-full bg-transparent px-1 py-0.5 text-right font-mono text-[11px] outline-none"
                          />
                        </td>
                        <td className="border-r border-zinc-100 px-1 py-1 text-right font-mono text-[11px] text-zinc-700 tabular-nums">
                          {lineTotal > 0 ? lineTotal.toLocaleString("vi-VN") : "—"}
                        </td>
                        <td className="border-r border-zinc-100 px-1 py-1">
                          <input
                            type="text"
                            value={l.referenceCode}
                            onChange={(e) =>
                              updateLine(l.localId, { referenceCode: e.target.value })
                            }
                            placeholder="Link/PO cũ"
                            className="w-full bg-transparent px-1 py-0.5 text-[11px] outline-none placeholder:text-zinc-300"
                          />
                        </td>
                        <td className="border-r border-zinc-100 px-1 py-1">
                          <input
                            type="text"
                            value={l.notes}
                            onChange={(e) =>
                              updateLine(l.localId, { notes: e.target.value })
                            }
                            className="w-full bg-transparent px-1 py-0.5 text-[11px] outline-none"
                          />
                        </td>
                        <td className="px-1 py-1 text-center print:hidden">
                          <button
                            type="button"
                            onClick={() => removeLine(l.localId)}
                            disabled={pending || lines.length === 1}
                            className="text-zinc-400 hover:text-red-600 disabled:opacity-30"
                            title="Xóa dòng"
                            aria-label="Xóa dòng"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-zinc-50">
                  <tr className="border-t-2 border-zinc-300 font-semibold">
                    <td colSpan={9} className="px-2 py-2 text-right text-[11px]">
                      Tổng tiền dự kiến (VNĐ):
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[12px] text-emerald-700 tabular-nums">
                      {totalAmount.toLocaleString("vi-VN")}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Quy tắc */}
            <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
              <strong>Quy tắc</strong>: Vật tư ESD/Non-ESD phân loại riêng · Vật tư
              lỗi ghi rõ nguyên nhân · Mã VT phải có trong danh mục vật tư.
            </div>
          </section>

          {/* III. Phê duyệt — placeholder cho phase sau */}
          <section className="border-t border-zinc-200 px-6 py-4 print:py-3">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-800">
              III. Kiểm tra & Phê duyệt
            </h3>
            <table className="w-full text-[11px]">
              <thead className="bg-zinc-50">
                <tr className="text-[10px] uppercase text-zinc-500">
                  <th className="border border-zinc-200 px-2 py-1 text-left">Vai trò</th>
                  <th className="border border-zinc-200 px-2 py-1 text-left">Họ tên</th>
                  <th className="border border-zinc-200 px-2 py-1 text-left">Ký tên / Ngày</th>
                  <th className="border border-zinc-200 px-2 py-1 text-left">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {[
                  "Người đề xuất",
                  "Kiểm tra tồn kho",
                  "Kiểm tra kỹ thuật",
                  "Trưởng bộ phận",
                  "Giám đốc",
                ].map((role) => (
                  <tr key={role}>
                    <td className="border border-zinc-200 px-2 py-2 font-medium text-zinc-700">
                      {role}
                    </td>
                    <td className="border border-zinc-200 px-2 py-2">&nbsp;</td>
                    <td className="border border-zinc-200 px-2 py-2">&nbsp;</td>
                    <td className="border border-zinc-200 px-2 py-2">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] italic text-zinc-500 print:hidden">
              Workflow phê duyệt nhiều bước sẽ được làm ở phase sau. Hiện tại sau khi
              tạo PR sẽ tự động chuyển sang trạng thái SUBMITTED và thông báo Bộ phận
              Thu mua xử lý.
            </p>
          </section>
        </article>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          body {
            background: white !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
