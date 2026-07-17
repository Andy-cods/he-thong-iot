"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ItemPicker, type ItemPickerValue } from "@/components/bom/ItemPicker";
import { useSession } from "@/hooks/useSession";
import {
  useCreateLsxWorkOrder,
  type CreateLsxWoInput,
  type RoutingStep,
  type MaterialRequirement,
  type ToolRequirement,
} from "@/hooks/useWorkOrders";
import { cn } from "@/lib/utils";

/**
 * V3.7.58 — `/work-orders/new-lsx` — Phiếu Lệnh Sản Xuất GTAM.
 *
 * Layout copy form Excel "07 . LSX.xlsx":
 *   Header: Số/Loại lệnh/Trạng thái/Người lập/Bộ phận
 *   I. Sản phẩm: Mã SP + Tên + SL + ĐVT + Kích thước + YC kỹ thuật
 *   II. Nguyên vật liệu: STT + Mã VT + Tên + ĐVT + Định mức + SL cấp + Kho cấp
 *   III. Routing: Tên CĐ + Thiết bị + Người phụ trách + Thời gian + QC yêu cầu
 *   IV. Tài liệu đính kèm: URL bản vẽ kỹ thuật
 *   V. Dao cụ/CCDC: Tên + Mã hiệu + Máy SD + SL + Tình trạng
 *   VI. Phê duyệt 4 chữ ký — placeholder phase 3.
 */

export const dynamic = "force-dynamic";

type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type OrderType = "NEW" | "REPAIR" | "TRIAL";

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  NEW: "Sản xuất mới",
  REPAIR: "Sửa chữa",
  TRIAL: "Thí nghiệm",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Thấp",
  NORMAL: "Bình thường",
  HIGH: "Cao",
  URGENT: "Khẩn",
};

const TOOL_STATUS_LABELS: Record<string, string> = {
  OK: "OK · sẵn dùng",
  WORN: "Mòn · cần thay",
  DAMAGED: "Hỏng",
  MISSING: "Thiếu",
};

interface MaterialDraft {
  localId: string;
  item: ItemPickerValue | null;
  qty: string;
  uom: string;
  allocatedQty: string;
  warehouseCode: string;
  notes: string;
}

interface RoutingDraft {
  localId: string;
  name: string;
  equipment: string;
  assignedOperator: string;
  durationMin: string;
  qcRequired: boolean;
  notes: string;
}

interface ToolDraft {
  localId: string;
  name: string;
  code: string;
  machine: string;
  qty: string;
  uom: string;
  status: string;
  notes: string;
}

const blankMaterial = (): MaterialDraft => ({
  localId: crypto.randomUUID(),
  item: null,
  qty: "1",
  uom: "",
  allocatedQty: "",
  warehouseCode: "",
  notes: "",
});

const blankRouting = (): RoutingDraft => ({
  localId: crypto.randomUUID(),
  name: "",
  equipment: "",
  assignedOperator: "",
  durationMin: "",
  qcRequired: false,
  notes: "",
});

const blankTool = (): ToolDraft => ({
  localId: crypto.randomUUID(),
  name: "",
  code: "",
  machine: "",
  qty: "1",
  uom: "PCS",
  status: "OK",
  notes: "",
});

export default function NewLsxPage() {
  const router = useRouter();
  const session = useSession();
  const createLsx = useCreateLsxWorkOrder();

  // Header
  const [orderType, setOrderType] = React.useState<OrderType>("NEW");
  const [priority, setPriority] = React.useState<Priority>("NORMAL");
  const [creatorDepartment, setCreatorDepartment] = React.useState("Bộ phận Kế hoạch SX");
  const [plannedStart, setPlannedStart] = React.useState("");
  const [plannedEnd, setPlannedEnd] = React.useState("");

  // I. Sản phẩm
  const [product, setProduct] = React.useState<ItemPickerValue | null>(null);
  const [plannedQty, setPlannedQty] = React.useState("1");
  const [productUom, setProductUom] = React.useState("PCS");
  const [productDimensions, setProductDimensions] = React.useState("");
  const [technicalRequirements, setTechnicalRequirements] = React.useState("");
  const [productNotes, setProductNotes] = React.useState("");

  // II. Materials
  const [materials, setMaterials] = React.useState<MaterialDraft[]>([blankMaterial()]);

  // III. Routing
  const [routings, setRoutings] = React.useState<RoutingDraft[]>([blankRouting()]);

  // V. Documents
  const [technicalDrawingUrl, setTechnicalDrawingUrl] = React.useState("");

  // VI. Tools
  const [tools, setTools] = React.useState<ToolDraft[]>([blankTool()]);

  // Notes / footer
  const [notes, setNotes] = React.useState("");

  // Auto-fill creator department theo role
  React.useEffect(() => {
    const roles = session.data?.roles ?? [];
    if (roles.includes("planner")) setCreatorDepartment("Bộ phận Kế hoạch SX");
    else if (roles.includes("operator")) setCreatorDepartment("Bộ phận Gia công");
    else if (roles.includes("admin")) setCreatorDepartment("Quản trị");
  }, [session.data?.roles]);

  // Tổng thời gian routing
  const totalRoutingMin = React.useMemo(
    () =>
      routings.reduce((sum, r) => {
        const v = Number(r.durationMin);
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0),
    [routings],
  );

  const updateMaterial = (id: string, patch: Partial<MaterialDraft>) =>
    setMaterials((prev) => prev.map((m) => (m.localId === id ? { ...m, ...patch } : m)));
  const updateRouting = (id: string, patch: Partial<RoutingDraft>) =>
    setRoutings((prev) => prev.map((r) => (r.localId === id ? { ...r, ...patch } : r)));
  const updateTool = (id: string, patch: Partial<ToolDraft>) =>
    setTools((prev) => prev.map((t) => (t.localId === id ? { ...t, ...patch } : t)));

  const removeAt = <T extends { localId: string }>(
    list: T[],
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    blank: () => T,
  ) => (id: string) =>
    setter(() => {
      const next = list.filter((x) => x.localId !== id);
      return next.length === 0 ? [blank()] : next;
    });

  const handleSubmit = async () => {
    if (!product) {
      toast.error("Vui lòng chọn sản phẩm cần sản xuất.");
      return;
    }
    const qtyNum = Number(plannedQty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      toast.error("Số lượng kế hoạch phải > 0.");
      return;
    }

    const validMaterials: MaterialRequirement[] = materials
      .filter((m) => m.item || m.qty)
      .map((m) => ({
        item_id: m.item?.id ?? null,
        sku: m.item?.sku ?? null,
        name: m.item?.name ?? "(chưa rõ)",
        qty: Number(m.qty) || 0,
        uom: m.uom.trim() || m.item?.uom || null,
        allocated_qty: Number(m.allocatedQty) || 0,
        warehouse_code: m.warehouseCode.trim() || null,
      }));

    const validRoutings: RoutingStep[] = routings
      .filter((r) => r.name.trim())
      .map((r, idx) => ({
        step_no: idx + 1,
        name: r.name.trim(),
        equipment: r.equipment.trim() || null,
        machine: r.equipment.trim() || null,
        assigned_operator: r.assignedOperator.trim() || null,
        duration_min: Number(r.durationMin) || null,
        qc_required: r.qcRequired,
        notes: r.notes.trim() || null,
      }));

    const validTools: ToolRequirement[] = tools
      .filter((t) => t.name.trim())
      .map((t) => ({
        name: t.name.trim(),
        code: t.code.trim() || null,
        machine: t.machine.trim() || null,
        qty: Number(t.qty) || 0,
        uom: t.uom.trim() || null,
        status: t.status,
        notes: t.notes.trim() || null,
      }));

    const payload: CreateLsxWoInput = {
      productItemId: product.id,
      plannedQty: qtyNum,
      priority,
      plannedStart: plannedStart || undefined,
      plannedEnd: plannedEnd || undefined,
      notes: notes.trim() || null,
      orderType,
      creatorDepartment: creatorDepartment.trim() || null,
      materialRequirements: validMaterials.length > 0 ? validMaterials : undefined,
      routingPlan: validRoutings.length > 0 ? validRoutings : undefined,
      toolsRequired: validTools.length > 0 ? validTools : undefined,
      productSpecification: {
        dimensions: productDimensions.trim() || null,
        technicalRequirements: technicalRequirements.trim() || null,
        notes: productNotes.trim() || null,
      },
      technicalDrawingUrl: technicalDrawingUrl.trim() || null,
      estimatedHours: totalRoutingMin > 0 ? totalRoutingMin / 60 : null,
    };

    try {
      const res = await createLsx.mutateAsync(payload);
      toast.success(`Đã tạo Lệnh Sản Xuất ${res.data.woNo}`);
      router.push(`/work-orders/${res.data.id}`);
    } catch (err) {
      toast.error((err as Error).message ?? "Không tạo được LSX");
    }
  };

  const pending = createLsx.isPending;

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50 dark:bg-zinc-950">
      {/* Header (no print) */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4 print:hidden dark:border-zinc-800 dark:bg-zinc-900">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">Tổng quan</Link>
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">›</span>
          <Link href="/operations" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">Gia công</Link>
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">›</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">Phiếu LSX GTAM</span>
        </nav>
        <div className="mt-1.5 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Phiếu Lệnh Sản Xuất (LSX GTAM)
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => window.print()} disabled={pending}>
              <Printer className="h-3.5 w-3.5" /> In phiếu
            </Button>
            <Button size="sm" onClick={() => void handleSubmit()} disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Gửi LSX
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1200px] p-6 print:p-4">
        <article className="rounded-md border border-zinc-300 bg-white shadow-sm print:border-zinc-900 print:shadow-none dark:border-zinc-700 dark:bg-zinc-900">
          {/* Title bar */}
          <div className="flex items-center gap-4 border-b-2 border-zinc-900 px-6 py-4 print:py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/img/logo-gtam.png"
              alt="GTAM"
              width={64}
              height={70}
              className="h-16 w-auto shrink-0 object-contain"
            />
            <div className="flex-1 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">
                CÔNG TY CỔ PHẦN SẢN XUẤT TỰ ĐỘNG HÓA CÔNG NGHỆ TOÀN CẦU (GTAM)
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-wide text-zinc-900 dark:text-zinc-50">
                LỆNH SẢN XUẤT
              </h2>
              <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                Mẫu No: GTAM/PRD-LSX · Phiên bản 1.0
              </p>
            </div>
            {/* Spacer to balance flex layout */}
            <div className="w-16 shrink-0" aria-hidden />
          </div>

          {/* Header info */}
          <section className="grid grid-cols-1 gap-3 border-b border-zinc-200 px-6 py-4 md:grid-cols-3 dark:border-zinc-700">
            <div className="space-y-1">
              <Label>Loại lệnh</Label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as OrderType)}
                className="flex h-9 w-full items-center rounded-md border border-zinc-200 bg-white px-3 text-[13px] focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {Object.entries(ORDER_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Bộ phận lập</Label>
              <Input value={creatorDepartment} onChange={(e) => setCreatorDepartment(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Ưu tiên</Label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="flex h-9 w-full items-center rounded-md border border-zinc-200 bg-white px-3 text-[13px] focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Người lập</Label>
              <Input value={session.data?.fullName ?? ""} disabled className="bg-zinc-50 dark:bg-zinc-800" />
            </div>
            <div className="space-y-1">
              <Label>Ngày bắt đầu</Label>
              <Input type="date" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Ngày kết thúc</Label>
              <Input type="date" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
            </div>
          </section>

          {/* I. Sản phẩm */}
          <section className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100">
              I. Thông tin sản phẩm
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1 md:col-span-2">
                <Label required>Sản phẩm cần sản xuất</Label>
                <ItemPicker value={product} onChange={(v) => { setProduct(v); if (v?.uom) setProductUom(v.uom); }} disabled={pending} />
              </div>
              <div className="space-y-1">
                <Label required>Số lượng (SL)</Label>
                <div className="flex gap-1">
                  <Input
                    type="number" step="0.001" min="0.001"
                    value={plannedQty}
                    onChange={(e) => setPlannedQty(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    value={productUom}
                    onChange={(e) => setProductUom(e.target.value)}
                    className="w-16 font-mono text-xs"
                    placeholder="ĐVT"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Kích thước</Label>
                <Input
                  value={productDimensions}
                  onChange={(e) => setProductDimensions(e.target.value)}
                  placeholder="VD: 124,5x13x8"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Yêu cầu kỹ thuật</Label>
                <Textarea
                  rows={2}
                  value={technicalRequirements}
                  onChange={(e) => setTechnicalRequirements(e.target.value)}
                  placeholder="Tolerance, độ bóng, vật liệu..."
                />
              </div>
            </div>
          </section>

          {/* II. Materials */}
          <section className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100">
                II. Nguyên vật liệu (BOM)
              </h3>
              <Button size="sm" variant="secondary" onClick={() => setMaterials([...materials, blankMaterial()])} disabled={pending} className="print:hidden">
                <Plus className="h-3 w-3" /> Thêm vật liệu
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-zinc-200 print:overflow-visible dark:border-zinc-700">
              <table className="w-full text-[11px]">
                <thead className="bg-zinc-100 dark:bg-zinc-800">
                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                    <th className="border-r border-zinc-200 px-1 py-1.5 w-8 dark:border-zinc-700">#</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left min-w-[200px] dark:border-zinc-700">Mã VT · Tên</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-right w-20 dark:border-zinc-700">Định mức</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left w-14 dark:border-zinc-700">ĐVT</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-right w-20 dark:border-zinc-700">SL cấp</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left w-24 dark:border-zinc-700">Kho cấp</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left min-w-[100px] dark:border-zinc-700">Ghi chú</th>
                    <th className="px-1 py-1.5 w-8 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m, idx) => (
                    <tr key={m.localId} className="border-t border-zinc-100 align-top dark:border-zinc-800">
                      <td className="border-r border-zinc-100 px-1 py-1 text-center font-mono text-[10px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">{idx + 1}</td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <ItemPicker value={m.item} onChange={(it) => updateMaterial(m.localId, { item: it, uom: m.uom || it?.uom || "" })} disabled={pending} />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input type="number" step="0.001" min="0" value={m.qty} onChange={(e) => updateMaterial(m.localId, { qty: e.target.value })} className="w-full bg-transparent px-1 text-right font-mono text-[11px] outline-none" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input value={m.uom} onChange={(e) => updateMaterial(m.localId, { uom: e.target.value })} placeholder={m.item?.uom ?? "—"} className="w-full bg-transparent px-1 text-[11px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input type="number" step="0.001" min="0" value={m.allocatedQty} onChange={(e) => updateMaterial(m.localId, { allocatedQty: e.target.value })} className="w-full bg-transparent px-1 text-right font-mono text-[11px] outline-none" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input value={m.warehouseCode} onChange={(e) => updateMaterial(m.localId, { warehouseCode: e.target.value })} placeholder="WH-01" className="w-full bg-transparent px-1 font-mono text-[11px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input value={m.notes} onChange={(e) => updateMaterial(m.localId, { notes: e.target.value })} className="w-full bg-transparent px-1 text-[11px] outline-none" />
                      </td>
                      <td className="px-1 py-1 text-center print:hidden">
                        <button type="button" onClick={() => removeAt(materials, setMaterials, blankMaterial)(m.localId)} disabled={pending || materials.length === 1} className="text-zinc-400 hover:text-red-600 disabled:opacity-30 dark:text-zinc-500 dark:hover:text-red-400">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* III. Routing */}
          <section className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100">
                III. Công đoạn sản xuất (Routing)
              </h3>
              <Button size="sm" variant="secondary" onClick={() => setRoutings([...routings, blankRouting()])} disabled={pending} className="print:hidden">
                <Plus className="h-3 w-3" /> Thêm công đoạn
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-zinc-200 print:overflow-visible dark:border-zinc-700">
              <table className="w-full text-[11px]">
                <thead className="bg-zinc-100 dark:bg-zinc-800">
                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                    <th className="border-r border-zinc-200 px-1 py-1.5 w-8 dark:border-zinc-700">#</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left min-w-[140px] dark:border-zinc-700">Tên công đoạn</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left min-w-[140px] dark:border-zinc-700">Thiết bị</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left min-w-[120px] dark:border-zinc-700">Người phụ trách</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-right w-20 dark:border-zinc-700">Phút</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-center w-12 dark:border-zinc-700">QC</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left min-w-[100px] dark:border-zinc-700">Ghi chú</th>
                    <th className="px-1 py-1.5 w-8 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {routings.map((r, idx) => (
                    <tr key={r.localId} className="border-t border-zinc-100 align-top dark:border-zinc-800">
                      <td className="border-r border-zinc-100 px-1 py-1 text-center font-mono text-[10px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">{idx + 1}</td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input value={r.name} onChange={(e) => updateRouting(r.localId, { name: e.target.value })} placeholder="VD: CNC, Lắp ráp" className="w-full bg-transparent px-1 text-[11px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input value={r.equipment} onChange={(e) => updateRouting(r.localId, { equipment: e.target.value })} placeholder="máy 01+02+05" className="w-full bg-transparent px-1 text-[11px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input value={r.assignedOperator} onChange={(e) => updateRouting(r.localId, { assignedOperator: e.target.value })} placeholder="Cường, Long..." className="w-full bg-transparent px-1 text-[11px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input type="number" step="0.1" min="0" value={r.durationMin} onChange={(e) => updateRouting(r.localId, { durationMin: e.target.value })} className="w-full bg-transparent px-1 text-right font-mono text-[11px] outline-none" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 text-center dark:border-zinc-800">
                        <input type="checkbox" checked={r.qcRequired} onChange={(e) => updateRouting(r.localId, { qcRequired: e.target.checked })} className="h-3.5 w-3.5" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input value={r.notes} onChange={(e) => updateRouting(r.localId, { notes: e.target.value })} className="w-full bg-transparent px-1 text-[11px] outline-none" />
                      </td>
                      <td className="px-1 py-1 text-center print:hidden">
                        <button type="button" onClick={() => removeAt(routings, setRoutings, blankRouting)(r.localId)} disabled={pending || routings.length === 1} className="text-zinc-400 hover:text-red-600 disabled:opacity-30 dark:text-zinc-500 dark:hover:text-red-400">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-zinc-50 dark:bg-zinc-800/60">
                  <tr className="border-t-2 border-zinc-300 font-semibold dark:border-zinc-700">
                    <td colSpan={4} className="px-2 py-1.5 text-right text-[11px]">Tổng thời gian:</td>
                    <td className="px-1 py-1.5 text-right font-mono text-[12px] text-emerald-700 tabular-nums dark:text-emerald-400">
                      {totalRoutingMin.toLocaleString("vi-VN")} phút
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* IV. Documents */}
          <section className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100">
              IV. Tài liệu đính kèm
            </h3>
            <div className="space-y-1">
              <Label>URL bản vẽ kỹ thuật</Label>
              <Input
                type="url"
                value={technicalDrawingUrl}
                onChange={(e) => setTechnicalDrawingUrl(e.target.value)}
                placeholder="https://drive.example.com/drawing-RI00401I.pdf"
                className="font-mono text-xs"
              />
            </div>
          </section>

          {/* V. Tools */}
          <section className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100">
                V. Công cụ dụng cụ / Dao cụ
              </h3>
              <Button size="sm" variant="secondary" onClick={() => setTools([...tools, blankTool()])} disabled={pending} className="print:hidden">
                <Plus className="h-3 w-3" /> Thêm dao cụ
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-zinc-200 print:overflow-visible dark:border-zinc-700">
              <table className="w-full text-[11px]">
                <thead className="bg-zinc-100 dark:bg-zinc-800">
                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                    <th className="border-r border-zinc-200 px-1 py-1.5 w-8 dark:border-zinc-700">#</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left min-w-[140px] dark:border-zinc-700">Tên dao/CCDC</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left min-w-[120px] dark:border-zinc-700">Mã hiệu</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left min-w-[140px] dark:border-zinc-700">Máy sử dụng</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-right w-14 dark:border-zinc-700">SL</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left w-14 dark:border-zinc-700">ĐVT</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left w-32 dark:border-zinc-700">Tình trạng</th>
                    <th className="border-r border-zinc-200 px-1 py-1.5 text-left min-w-[100px] dark:border-zinc-700">Ghi chú</th>
                    <th className="px-1 py-1.5 w-8 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {tools.map((t, idx) => (
                    <tr key={t.localId} className="border-t border-zinc-100 align-top dark:border-zinc-800">
                      <td className="border-r border-zinc-100 px-1 py-1 text-center font-mono text-[10px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">{idx + 1}</td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input value={t.name} onChange={(e) => updateTool(t.localId, { name: e.target.value })} placeholder="VD: Mũi phay R3" className="w-full bg-transparent px-1 text-[11px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input value={t.code} onChange={(e) => updateTool(t.localId, { code: e.target.value })} placeholder="R3-D8-60-4F" className="w-full bg-transparent px-1 font-mono text-[11px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input value={t.machine} onChange={(e) => updateTool(t.localId, { machine: e.target.value })} placeholder="CNC 01+02" className="w-full bg-transparent px-1 text-[11px] outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input type="number" step="1" min="0" value={t.qty} onChange={(e) => updateTool(t.localId, { qty: e.target.value })} className="w-full bg-transparent px-1 text-right font-mono text-[11px] outline-none" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input value={t.uom} onChange={(e) => updateTool(t.localId, { uom: e.target.value })} className="w-full bg-transparent px-1 text-[11px] outline-none" />
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <select value={t.status} onChange={(e) => updateTool(t.localId, { status: e.target.value })} className="w-full bg-transparent px-1 text-[11px] outline-none">
                          {Object.entries(TOOL_STATUS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </td>
                      <td className="border-r border-zinc-100 px-1 py-1 dark:border-zinc-800">
                        <input value={t.notes} onChange={(e) => updateTool(t.localId, { notes: e.target.value })} className="w-full bg-transparent px-1 text-[11px] outline-none" />
                      </td>
                      <td className="px-1 py-1 text-center print:hidden">
                        <button type="button" onClick={() => removeAt(tools, setTools, blankTool)(t.localId)} disabled={pending || tools.length === 1} className="text-zinc-400 hover:text-red-600 disabled:opacity-30 dark:text-zinc-500 dark:hover:text-red-400">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Notes */}
          <section className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <Label>Ghi chú chung</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="VD: Nhựa thiếu 7 tấm — chờ NCC ngày 06/05" />
          </section>

          {/* VI. Phê duyệt — placeholder phase 3 */}
          <section className="px-6 py-4 print:py-3">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100">
              VI. Phê duyệt
            </h3>
            <table className="w-full text-[11px]">
              <thead className="bg-zinc-50 dark:bg-zinc-800">
                <tr className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400">
                  <th className="border border-zinc-200 px-2 py-1 text-left dark:border-zinc-700">Người lập</th>
                  <th className="border border-zinc-200 px-2 py-1 text-left dark:border-zinc-700">Kế toán</th>
                  <th className="border border-zinc-200 px-2 py-1 text-left dark:border-zinc-700">QLSX</th>
                  <th className="border border-zinc-200 px-2 py-1 text-left dark:border-zinc-700">Giám đốc</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[1, 2, 3, 4].map((i) => (
                    <td key={i} className="border border-zinc-200 px-2 py-6 align-bottom dark:border-zinc-700">&nbsp;</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[10px] italic text-zinc-500 print:hidden dark:text-zinc-400">
              Workflow phê duyệt 4 chữ ký + xác nhận liên bộ phận (Kho/Máy/Nhân sự/QLSX/QC) sẽ làm phase 3.
            </p>
          </section>
        </article>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
