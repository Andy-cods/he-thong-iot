"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Command as CommandPrimitive } from "cmdk";
import {
  Check,
  ChevronsUpDown,
  Factory,
  GripVertical,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUpdateBomLine } from "@/hooks/useBom";
import { useSuppliersList, type SupplierRow } from "@/hooks/useSuppliers";
import type { BomFlatRow } from "@/lib/bom-grid/flatten-tree";
import { cn } from "@/lib/utils";

/**
 * V1.7-beta.2.3 — Side sheet sửa BOM line, form 2 flow Thương mại / Gia công
 * enriched:
 *   - Thương mại: Supplier autocomplete (cmdk + popover) + Mã NCC ref +
 *     Lead time + MOQ + Giá mua + Điều khoản thanh toán.
 *   - Gia công: Material select (nhóm theo group) + Kích thước phôi +
 *     Route công đoạn (multi-chip, thứ tự) + Thời gian ước tính + Ghi chú.
 *
 * Lưu:
 *   metadata.kind = "com" | "fab"
 *   metadata.sourcing = { supplierId, supplierCode, supplierPartNumber,
 *     leadTimeDays, moq, estimatedPrice, paymentTerms }
 *   metadata.routing = { materialCode, materialName, blankSize,
 *     processRoute[], estimatedHours, technicalNotes }
 *   metadata.size (mirror blankSize) để BomGridPro cột "Kích thước" hiển thị.
 */

export interface BomLineSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  templateCode: string;
  line: BomFlatRow | null;
}

type KindMode = "com" | "fab";

/** Bảng vật liệu cứng Tier 1 V1.7-beta.2.3 (sẽ chuyển sang master V1.8). */
const MATERIALS: Array<{ code: string; name: string; group: string }> = [
  { code: "POM", name: "POM (nhựa kỹ thuật)", group: "Plastic" },
  { code: "POM_ESD_BLACK", name: "POM ESD đen (chống tĩnh điện)", group: "Plastic" },
  { code: "PB108", name: "PB108 (nhựa chịu nhiệt)", group: "Plastic" },
  { code: "ACETAL_BLACK", name: "Acetal đen (POM đen)", group: "Plastic" },
  { code: "AL6061", name: "Nhôm AL6061 anode đen", group: "Aluminum" },
  { code: "AL6061_ANODE_CLEAR", name: "Nhôm AL6061 anode trong", group: "Aluminum" },
  { code: "MIC6", name: "Nhôm MIC6 (tấm cán)", group: "Aluminum" },
  { code: "SUS304", name: "Thép không gỉ SUS304", group: "Stainless steel" },
  { code: "SUS304_ELECTROPOLISH", name: "SUS304 điện hóa", group: "Stainless steel" },
  { code: "SUS316", name: "Thép không gỉ SUS316L", group: "Stainless steel" },
  { code: "SS400", name: "Thép SS400 (kết cấu)", group: "Carbon steel" },
  { code: "BRASS_C360", name: "Đồng C360 (đồng thau)", group: "Brass" },
];

/** Công đoạn chuẩn — user chọn multi theo thứ tự. */
const PROCESSES: Array<{ code: string; name: string }> = [
  { code: "CUT", name: "Cắt" },
  { code: "WIRE_CUT", name: "Cắt dây EDM" },
  { code: "MILLING", name: "Phay CNC" },
  { code: "MCT", name: "MCT (Machining Center)" },
  { code: "DRILLING", name: "Khoan" },
  { code: "TAPPING", name: "Ta-rô" },
  { code: "LATHE", name: "Tiện CNC" },
  { code: "GRINDING", name: "Mài" },
  { code: "POLISHING", name: "Đánh bóng" },
  { code: "ANODIZING", name: "Anode (nhôm)" },
  { code: "BLACK_OXIDE", name: "Nhuộm đen (thép)" },
  { code: "ELECTROPOLISH", name: "Điện hóa" },
  { code: "HEAT_TREAT", name: "Nhiệt luyện" },
  { code: "LASER_MARK", name: "Khắc laser" },
  { code: "ASSEMBLY", name: "Lắp ráp" },
];

const PROCESS_MAP = new Map(PROCESSES.map((p) => [p.code, p]));

interface FormState {
  // Common
  kind: KindMode;
  qtyPerParent: string;
  scrapPercent: string;
  uom: string;
  description: string;
  // Commercial (com) — enriched
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  supplierPartNumber: string;
  leadTimeDays: string;
  moq: string;
  estimatedPrice: string;
  paymentTerms: string;
  // Fabricated (fab) — enriched
  materialCode: string;
  materialName: string;
  blankSize: string;
  processRoute: string[];
  estimatedHours: string;
  technicalNotes: string;
}

function deriveDefaultKind(line: BomFlatRow | null): KindMode {
  if (!line) return "com";
  const meta = (line.node.metadata ?? {}) as { kind?: unknown };
  if (meta.kind === "com" || meta.kind === "fab") return meta.kind;
  const t = (line.node.componentItemType ?? "").toUpperCase();
  if (t === "FABRICATED" || t === "SUB_ASSEMBLY") return "fab";
  return "com";
}

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function buildInitial(line: BomFlatRow | null): FormState {
  if (!line) {
    return {
      kind: "com",
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "",
      description: "",
      supplierId: "",
      supplierCode: "",
      supplierName: "",
      supplierPartNumber: "",
      leadTimeDays: "",
      moq: "",
      estimatedPrice: "",
      paymentTerms: "",
      materialCode: "",
      materialName: "",
      blankSize: "",
      processRoute: [],
      estimatedHours: "",
      technicalNotes: "",
    };
  }
  const meta = (line.node.metadata ?? {}) as {
    size?: unknown;
    sourcing?: Record<string, unknown>;
    routing?: Record<string, unknown>;
  };
  const sourcing = meta.sourcing ?? {};
  const routing = meta.routing ?? {};

  const routeRaw = routing.processRoute;
  let processRoute: string[] = [];
  if (Array.isArray(routeRaw)) {
    processRoute = routeRaw.filter((x): x is string => typeof x === "string");
  } else if (typeof routeRaw === "string" && routeRaw.trim()) {
    // Back-compat V1.7-beta.2.1: processRoute từng là free text —
    // split theo newline / "/" / "→" để migrate nhẹ.
    processRoute = routeRaw
      .split(/[\n/→>]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((txt) => {
        const upper = txt.toUpperCase();
        const found = PROCESSES.find(
          (p) =>
            p.code === upper ||
            p.name.toUpperCase() === upper ||
            upper.includes(p.code),
        );
        return found?.code ?? "";
      })
      .filter(Boolean);
  }

  return {
    kind: deriveDefaultKind(line),
    qtyPerParent: String(line.node.qtyPerParent ?? "1"),
    scrapPercent: String(line.node.scrapPercent ?? "0"),
    uom: line.node.uom ?? "",
    description: line.node.description ?? "",
    supplierId: toStr(sourcing.supplierId),
    supplierCode:
      toStr(sourcing.supplierCode) || (line.node.supplierItemCode ?? ""),
    supplierName: toStr(sourcing.supplierName),
    supplierPartNumber:
      toStr(sourcing.supplierPartNumber) ||
      (line.node.supplierItemCode ?? ""),
    leadTimeDays: toStr(sourcing.leadTimeDays),
    moq: toStr(sourcing.moq),
    estimatedPrice: toStr(sourcing.estimatedPrice),
    paymentTerms: toStr(sourcing.paymentTerms),
    materialCode:
      toStr(routing.materialCode) || (line.node.componentCategory ?? ""),
    materialName: toStr(routing.materialName),
    blankSize:
      toStr(routing.blankSize) ||
      (typeof meta.size === "string" ? meta.size : ""),
    processRoute,
    estimatedHours: toStr(routing.estimatedHours),
    technicalNotes: toStr(routing.technicalNotes),
  };
}

export function BomLineSheet({
  open,
  onOpenChange,
  templateId,
  templateCode,
  line,
}: BomLineSheetProps) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(() => buildInitial(line));
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const mutation = useUpdateBomLine(templateId);

  React.useEffect(() => {
    if (open && line) {
      setForm(buildInitial(line));
      setErrors({});
    }
  }, [open, line]);

  const updateInput =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
      if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }));
    };

  const setKind = (next: KindMode) => {
    setForm((prev) => ({ ...prev, kind: next }));
  };

  const setSupplier = (s: SupplierRow | null) => {
    setForm((prev) => ({
      ...prev,
      supplierId: s?.id ?? "",
      supplierCode: s?.code ?? "",
      supplierName: s?.name ?? "",
    }));
  };

  const setMaterial = (code: string, name: string) => {
    setForm((prev) => ({ ...prev, materialCode: code, materialName: name }));
    if (errors.materialCode)
      setErrors((p) => ({ ...p, materialCode: undefined }));
  };

  const addProcess = (code: string) => {
    setForm((prev) =>
      prev.processRoute.includes(code)
        ? prev
        : { ...prev, processRoute: [...prev.processRoute, code] },
    );
  };

  const removeProcess = (code: string) => {
    setForm((prev) => ({
      ...prev,
      processRoute: prev.processRoute.filter((c) => c !== code),
    }));
  };

  const moveProcess = (code: string, dir: -1 | 1) => {
    setForm((prev) => {
      const idx = prev.processRoute.indexOf(code);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.processRoute.length) return prev;
      const next = [...prev.processRoute];
      [next[idx], next[nextIdx]] = [next[nextIdx]!, next[idx]!];
      return { ...prev, processRoute: next };
    });
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    const qty = Number(form.qtyPerParent);
    if (!Number.isFinite(qty) || qty < 0.01) {
      next.qtyPerParent = "Số lượng phải ≥ 0.01";
    }
    const scrap = Number(form.scrapPercent);
    if (!Number.isFinite(scrap) || scrap < 0 || scrap > 100) {
      next.scrapPercent = "Hao hụt 0-100%";
    }
    if (form.uom.length > 16) next.uom = "ĐVT tối đa 16 ký tự";
    if (form.description.length > 500)
      next.description = "Mô tả tối đa 500 ký tự";

    if (form.kind === "com") {
      if (form.supplierCode.length > 64)
        next.supplierCode = "Mã NCC tối đa 64 ký tự";
      if (form.supplierPartNumber.length > 64)
        next.supplierPartNumber = "Mã NCC tối đa 64 ký tự";
      if (form.leadTimeDays !== "") {
        const n = Number(form.leadTimeDays);
        if (!Number.isFinite(n) || n < 0)
          next.leadTimeDays = "Lead time phải ≥ 0";
      }
      if (form.moq !== "") {
        const n = Number(form.moq);
        if (!Number.isFinite(n) || n < 1) next.moq = "MOQ phải ≥ 1";
      }
      if (form.estimatedPrice !== "") {
        const n = Number(form.estimatedPrice);
        if (!Number.isFinite(n) || n < 0)
          next.estimatedPrice = "Giá phải ≥ 0";
      }
      if (form.paymentTerms.length > 64)
        next.paymentTerms = "Điều khoản tối đa 64 ký tự";
    } else {
      if (form.materialCode.length > 64)
        next.materialCode = "Vật liệu tối đa 64 ký tự";
      if (form.blankSize.length > 64)
        next.blankSize = "Kích thước tối đa 64 ký tự";
      if (form.estimatedHours !== "") {
        const n = Number(form.estimatedHours);
        if (!Number.isFinite(n) || n < 0)
          next.estimatedHours = "Thời gian phải ≥ 0";
      }
      if (form.technicalNotes.length > 500)
        next.technicalNotes = "Ghi chú tối đa 500 ký tự";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // V1.7-beta.2.5 — sau khi save thành công, có thể redirect sang /work-orders/new
  // kèm prefill để user tạo WO cho linh kiện gia công.
  const [createWOAfterSave, setCreateWOAfterSave] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line) return;
    if (!validate()) return;

    const existingMeta = (line.node.metadata ?? {}) as Record<string, unknown>;
    const nextMeta: Record<string, unknown> = { ...existingMeta };
    nextMeta.kind = form.kind;

    if (form.kind === "com") {
      const sourcing: Record<string, unknown> = {};
      if (form.supplierId) sourcing.supplierId = form.supplierId;
      if (form.supplierCode.trim())
        sourcing.supplierCode = form.supplierCode.trim();
      if (form.supplierName.trim())
        sourcing.supplierName = form.supplierName.trim();
      if (form.supplierPartNumber.trim())
        sourcing.supplierPartNumber = form.supplierPartNumber.trim();
      if (form.leadTimeDays !== "")
        sourcing.leadTimeDays = Number(form.leadTimeDays);
      if (form.moq !== "") sourcing.moq = Number(form.moq);
      if (form.estimatedPrice !== "")
        sourcing.estimatedPrice = Number(form.estimatedPrice);
      if (form.paymentTerms.trim())
        sourcing.paymentTerms = form.paymentTerms.trim();
      if (Object.keys(sourcing).length > 0) nextMeta.sourcing = sourcing;
      else delete nextMeta.sourcing;
      // Giữ nguyên metadata.routing để user revert nếu cần.
    } else {
      const routing: Record<string, unknown> = {};
      if (form.materialCode.trim())
        routing.materialCode = form.materialCode.trim();
      if (form.materialName.trim())
        routing.materialName = form.materialName.trim();
      if (form.blankSize.trim()) routing.blankSize = form.blankSize.trim();
      if (form.processRoute.length > 0)
        routing.processRoute = form.processRoute;
      if (form.estimatedHours !== "")
        routing.estimatedHours = Number(form.estimatedHours);
      if (form.technicalNotes.trim())
        routing.technicalNotes = form.technicalNotes.trim();
      if (Object.keys(routing).length > 0) nextMeta.routing = routing;
      else delete nextMeta.routing;
      // Mirror blankSize → metadata.size cho grid.
      if (form.blankSize.trim()) {
        nextMeta.size = form.blankSize.trim();
      }
    }

    // Đồng bộ supplierItemCode để BomGridPro cột NCC hiển thị ngay.
    // Khi Thương mại: ưu tiên supplierPartNumber (mã NCC dùng trong PO)
    // fallback supplierCode nếu trống.
    const nextSupplierItemCode =
      form.kind === "com"
        ? form.supplierPartNumber.trim() ||
          form.supplierCode.trim() ||
          null
        : (line.node.supplierItemCode ?? null);

    try {
      await mutation.mutateAsync({
        lineId: line.id,
        data: {
          qtyPerParent: Number(form.qtyPerParent),
          scrapPercent: Number(form.scrapPercent),
          uom: form.uom.trim() || null,
          description: form.description.trim() || null,
          supplierItemCode: nextSupplierItemCode,
          metadata: nextMeta,
        },
      });
      toast.success("Đã lưu thay đổi");
      onOpenChange(false);

      if (createWOAfterSave && form.kind === "fab" && line) {
        // Redirect sang /work-orders/new với prefill note (WO yêu cầu
        // orderId + snapshotLineIds nên không thể prefill trực tiếp item —
        // ghi chú sẽ giúp user biết ngữ cảnh).
        const routeNames = form.processRoute
          .map((c) => PROCESS_MAP.get(c)?.name ?? c)
          .join(" → ");
        const q = new URLSearchParams();
        q.set("bomLineId", line.id);
        q.set("bomTemplateId", templateId);
        if (line.node.componentSku) q.set("sku", line.node.componentSku);
        if (form.materialCode) q.set("materialCode", form.materialCode);
        if (form.processRoute.length > 0)
          q.set("processRoute", form.processRoute.join(","));
        const noteParts = [
          `Tạo từ BOM ${templateCode}`,
          `dòng ${line.node.componentSku ?? ""}`,
        ];
        if (form.materialCode) noteParts.push(`Vật liệu: ${form.materialCode}`);
        if (routeNames) noteParts.push(`Quy trình: ${routeNames}`);
        if (form.blankSize) noteParts.push(`Phôi: ${form.blankSize}`);
        q.set("note", noteParts.join(" · "));
        router.push(`/work-orders/new?${q.toString()}`);
      }
    } catch (err) {
      toast.error((err as Error)?.message ?? "Không cập nhật được linh kiện");
    }
  };

  const pending = mutation.isPending;
  const sku = line?.node.componentSku ?? "—";
  const name = line?.node.componentName ?? "(chưa có tên)";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="md:w-[560px]">
        <SheetHeader>
          <div className="flex flex-col">
            <SheetTitle className="text-[15px]">Chỉnh sửa linh kiện</SheetTitle>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
              <span>{templateCode}</span>
              <span>·</span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700">
                {sku}
              </span>
            </div>
          </div>
        </SheetHeader>
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <SheetBody className="space-y-5">
            {/* Kind toggle — pin top */}
            <div className="space-y-1.5">
              <Label>Loại linh kiện</Label>
              <div className="grid grid-cols-2 gap-2">
                <KindRadio
                  checked={form.kind === "com"}
                  onClick={() => setKind("com")}
                  label="Thương mại"
                  hint="Mua ngoài · NCC · MOQ"
                  accent="blue"
                />
                <KindRadio
                  checked={form.kind === "fab"}
                  onClick={() => setKind("fab")}
                  label="Gia công"
                  hint="Phôi · Route · CNC"
                  accent="emerald"
                />
              </div>
            </div>

            {/* Section 1 — Common */}
            <Section title="Thông tin chung">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>SKU</Label>
                  <div className="flex h-9 items-center rounded-md border border-zinc-100 bg-zinc-50 px-3 font-mono text-[13px] text-zinc-500">
                    {sku}
                  </div>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Tên linh kiện</Label>
                  <div className="flex min-h-9 items-center rounded-md border border-zinc-100 bg-zinc-50 px-3 text-[13px] text-zinc-600">
                    {name}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="bls-qty" required>
                    Số lượng / bộ
                  </Label>
                  <Input
                    id="bls-qty"
                    type="number"
                    step="0.001"
                    min="0.01"
                    value={form.qtyPerParent}
                    onChange={updateInput("qtyPerParent")}
                    error={!!errors.qtyPerParent}
                  />
                  {errors.qtyPerParent && (
                    <p className="text-[11px] text-red-600">
                      {errors.qtyPerParent}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="bls-scrap">Hao hụt (%)</Label>
                  <Input
                    id="bls-scrap"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={form.scrapPercent}
                    onChange={updateInput("scrapPercent")}
                    error={!!errors.scrapPercent}
                  />
                  {errors.scrapPercent && (
                    <p className="text-[11px] text-red-600">
                      {errors.scrapPercent}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="bls-uom">ĐVT</Label>
                  <Input
                    id="bls-uom"
                    maxLength={16}
                    value={form.uom}
                    onChange={updateInput("uom")}
                    placeholder="cái, kg, m..."
                    error={!!errors.uom}
                  />
                  {errors.uom && (
                    <p className="text-[11px] text-red-600">{errors.uom}</p>
                  )}
                </div>

                <div className="col-span-2 space-y-1">
                  <Label htmlFor="bls-desc">Mô tả / Ghi chú</Label>
                  <Textarea
                    id="bls-desc"
                    maxLength={500}
                    rows={2}
                    value={form.description}
                    onChange={updateInput("description")}
                    placeholder="Ghi chú chi tiết…"
                    error={!!errors.description}
                  />
                  <div className="flex items-center justify-between text-[11px]">
                    {errors.description ? (
                      <span className="text-red-600">{errors.description}</span>
                    ) : (
                      <span className="text-zinc-400">Tối đa 500 ký tự.</span>
                    )}
                    <span className="font-mono text-zinc-400">
                      {form.description.length}/500
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* Section 2A — Commercial (enriched) */}
            {form.kind === "com" && (
              <Section
                title="Thông tin thương mại"
                accent="blue"
                hint="Mua ngoài từ nhà cung cấp"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label>Nhà cung cấp</Label>
                    <SupplierCombobox
                      value={{
                        id: form.supplierId,
                        code: form.supplierCode,
                        name: form.supplierName,
                      }}
                      onChange={setSupplier}
                    />
                    <p className="text-[11px] text-zinc-400">
                      Chọn từ danh mục NCC · hoặc để trống nếu chưa xác định.
                    </p>
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="bls-supplier-pn">
                      Mã NCC (part number)
                    </Label>
                    <Input
                      id="bls-supplier-pn"
                      maxLength={64}
                      value={form.supplierPartNumber}
                      onChange={updateInput("supplierPartNumber")}
                      placeholder="Mã linh kiện do NCC cấp (dùng trên PO)"
                      error={!!errors.supplierPartNumber}
                    />
                    {errors.supplierPartNumber && (
                      <p className="text-[11px] text-red-600">
                        {errors.supplierPartNumber}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bls-lead">Lead time (ngày)</Label>
                    <Input
                      id="bls-lead"
                      type="number"
                      min="0"
                      step="1"
                      value={form.leadTimeDays}
                      onChange={updateInput("leadTimeDays")}
                      placeholder="VD: 7"
                      error={!!errors.leadTimeDays}
                    />
                    {errors.leadTimeDays ? (
                      <p className="text-[11px] text-red-600">
                        {errors.leadTimeDays}
                      </p>
                    ) : (
                      <p className="text-[11px] text-zinc-400">
                        Số ngày từ đặt đến nhận.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bls-moq">MOQ (tối thiểu)</Label>
                    <Input
                      id="bls-moq"
                      type="number"
                      min="1"
                      step="1"
                      value={form.moq}
                      onChange={updateInput("moq")}
                      placeholder="VD: 100"
                      error={!!errors.moq}
                    />
                    {errors.moq ? (
                      <p className="text-[11px] text-red-600">{errors.moq}</p>
                    ) : (
                      <p className="text-[11px] text-zinc-400">
                        Số lượng tối thiểu / đơn.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bls-price">Giá mua ước tính</Label>
                    <div className="relative">
                      <Input
                        id="bls-price"
                        type="number"
                        min="0"
                        step="1"
                        value={form.estimatedPrice}
                        onChange={updateInput("estimatedPrice")}
                        placeholder="125000"
                        error={!!errors.estimatedPrice}
                        className="pr-16"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-zinc-400">
                        ₫/đơn vị
                      </span>
                    </div>
                    {errors.estimatedPrice && (
                      <p className="text-[11px] text-red-600">
                        {errors.estimatedPrice}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bls-payment">Điều khoản thanh toán</Label>
                    <Input
                      id="bls-payment"
                      maxLength={64}
                      value={form.paymentTerms}
                      onChange={updateInput("paymentTerms")}
                      placeholder="NET 30 / COD / T/T"
                      error={!!errors.paymentTerms}
                    />
                    {errors.paymentTerms && (
                      <p className="text-[11px] text-red-600">
                        {errors.paymentTerms}
                      </p>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {/* Section 2B — Fabricated (enriched) */}
            {form.kind === "fab" && (
              <Section
                title="Thông tin gia công"
                accent="emerald"
                hint="Sản xuất nội bộ · CNC/phay/tiện"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label>Vật liệu gốc</Label>
                    <MaterialCombobox
                      value={form.materialCode}
                      onChange={setMaterial}
                    />
                    {errors.materialCode && (
                      <p className="text-[11px] text-red-600">
                        {errors.materialCode}
                      </p>
                    )}
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="bls-blank">Kích thước phôi</Label>
                    <Input
                      id="bls-blank"
                      maxLength={64}
                      value={form.blankSize}
                      onChange={updateInput("blankSize")}
                      placeholder="DxRxS (mm) · VD 100x50x20"
                      error={!!errors.blankSize}
                    />
                    {errors.blankSize ? (
                      <p className="text-[11px] text-red-600">
                        {errors.blankSize}
                      </p>
                    ) : (
                      <p className="text-[11px] text-zinc-400">
                        Định dạng DxRxS (mm). Hiển thị ở cột "Kích thước" Grid.
                      </p>
                    )}
                  </div>

                  <div className="col-span-2 space-y-1.5">
                    <Label>Quy trình gia công</Label>
                    <ProcessRouteBuilder
                      selected={form.processRoute}
                      onAdd={addProcess}
                      onRemove={removeProcess}
                      onMove={moveProcess}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bls-hours">
                      Thời gian ước tính (giờ)
                    </Label>
                    <Input
                      id="bls-hours"
                      type="number"
                      min="0"
                      step="0.5"
                      value={form.estimatedHours}
                      onChange={updateInput("estimatedHours")}
                      placeholder="VD: 2.5"
                      error={!!errors.estimatedHours}
                    />
                    {errors.estimatedHours && (
                      <p className="text-[11px] text-red-600">
                        {errors.estimatedHours}
                      </p>
                    )}
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="bls-tech">Ghi chú kỹ thuật</Label>
                    <Textarea
                      id="bls-tech"
                      maxLength={500}
                      rows={2}
                      value={form.technicalNotes}
                      onChange={updateInput("technicalNotes")}
                      placeholder="Dung sai, bề mặt, xử lý nhiệt…"
                      error={!!errors.technicalNotes}
                    />
                    <div className="flex items-center justify-between text-[11px]">
                      {errors.technicalNotes ? (
                        <span className="text-red-600">
                          {errors.technicalNotes}
                        </span>
                      ) : (
                        <span className="text-zinc-400">Tối đa 500 ký tự.</span>
                      )}
                      <span className="font-mono text-zinc-400">
                        {form.technicalNotes.length}/500
                      </span>
                    </div>
                  </div>
                </div>
              </Section>
            )}
          </SheetBody>
          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Huỷ
            </Button>
            {form.kind === "fab" && (
              <Button
                type="submit"
                variant="secondary"
                disabled={pending}
                onClick={() => setCreateWOAfterSave(true)}
                title="Lưu và chuyển sang trang tạo Lệnh Sản Xuất"
              >
                {pending && createWOAfterSave ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Factory className="h-3.5 w-3.5" aria-hidden />
                )}
                Lưu + Tạo Lệnh SX
              </Button>
            )}
            <Button
              type="submit"
              disabled={pending}
              onClick={() => setCreateWOAfterSave(false)}
            >
              {pending && !createWOAfterSave ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Lưu
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  hint,
  accent,
  children,
}: {
  title: string;
  hint?: string;
  accent?: "blue" | "emerald";
  children: React.ReactNode;
}) {
  const accentClass =
    accent === "blue"
      ? "border-l-4 border-blue-200 pl-3"
      : accent === "emerald"
        ? "border-l-4 border-emerald-200 pl-3"
        : "";
  return (
    <section className={cn("space-y-3", accentClass)}>
      <div>
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-600">
          {title}
        </h3>
        {hint ? (
          <p className="mt-0.5 text-[11px] text-zinc-400">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function KindRadio({
  checked,
  onClick,
  label,
  hint,
  accent,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  accent: "blue" | "emerald";
}) {
  const ringClass = checked
    ? accent === "blue"
      ? "ring-2 ring-blue-400 bg-blue-50"
      : "ring-2 ring-emerald-400 bg-emerald-50"
    : "ring-1 ring-zinc-200 bg-white hover:bg-zinc-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start rounded-md px-3 py-2 text-left transition-colors",
        ringClass,
      )}
    >
      <span className="text-[13px] font-medium text-zinc-900">{label}</span>
      <span className="text-[11px] text-zinc-500">{hint}</span>
    </button>
  );
}

/* ─────────────────────────── Supplier combobox ─────────────────────────── */

interface SupplierComboboxProps {
  value: { id: string; code: string; name: string };
  onChange: (s: SupplierRow | null) => void;
}

function SupplierCombobox({ value, onChange }: SupplierComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const suppliersQuery = useSuppliersList({
    q: query,
    pageSize: 50,
    isActive: true,
  });
  const suppliers = suppliersQuery.data?.data ?? [];

  const display = value.code
    ? `${value.code}${value.name ? ` — ${value.name}` : ""}`
    : "";

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 text-left text-[13px] transition-colors",
              "hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
            )}
          >
            <span
              className={cn(
                "truncate",
                display ? "text-zinc-800" : "text-zinc-400",
              )}
            >
              {display || "Chọn nhà cung cấp…"}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[440px] p-0"
          sideOffset={4}
        >
          <CommandPrimitive shouldFilter={false} className="flex flex-col" loop>
            <div className="flex items-center border-b border-zinc-200 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
              <CommandPrimitive.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Tìm NCC theo mã / tên…"
                className="flex-1 bg-transparent px-2 text-[13px] outline-none placeholder:text-zinc-400"
              />
            </div>
            <CommandPrimitive.List className="max-h-[280px] overflow-y-auto p-1">
              {suppliersQuery.isLoading ? (
                <div className="px-3 py-4 text-center text-xs text-zinc-500">
                  Đang tải…
                </div>
              ) : suppliers.length === 0 ? (
                <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-zinc-500">
                  {query
                    ? `Không tìm thấy "${query}".`
                    : "Chưa có NCC trong danh mục."}
                </CommandPrimitive.Empty>
              ) : (
                <CommandPrimitive.Group>
                  {suppliers.map((s) => (
                    <CommandPrimitive.Item
                      key={s.id}
                      value={`${s.code} ${s.name}`}
                      onSelect={() => {
                        onChange(s);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px]",
                        "aria-selected:bg-zinc-100",
                      )}
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          s.id === value.id
                            ? "text-indigo-600"
                            : "text-transparent",
                        )}
                      />
                      <span className="font-mono text-xs font-medium text-zinc-800">
                        {s.code}
                      </span>
                      <span className="truncate text-zinc-700">{s.name}</span>
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              )}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverContent>
      </Popover>
      {value.id || value.code ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-700"
          title="Bỏ chọn NCC"
          aria-label="Bỏ chọn NCC"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── Material combobox ─────────────────────────── */

interface MaterialComboboxProps {
  value: string;
  onChange: (code: string, name: string) => void;
}

function MaterialCombobox({ value, onChange }: MaterialComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const current = MATERIALS.find((m) => m.code === value);
  const display = current
    ? `${current.code} — ${current.name}`
    : value
      ? value
      : "";

  const groups = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? MATERIALS.filter(
          (m) =>
            m.code.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q),
        )
      : MATERIALS;
    const map = new Map<string, typeof MATERIALS>();
    for (const m of filtered) {
      if (!map.has(m.group)) map.set(m.group, []);
      map.get(m.group)!.push(m);
    }
    return Array.from(map.entries());
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 text-left text-[13px] transition-colors",
            "hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
          )}
        >
          <span
            className={cn(
              "truncate",
              display ? "text-zinc-800" : "text-zinc-400",
            )}
          >
            {display || "Chọn vật liệu…"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[440px] p-0" sideOffset={4}>
        <CommandPrimitive shouldFilter={false} className="flex flex-col" loop>
          <div className="flex items-center border-b border-zinc-200 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
            <CommandPrimitive.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Tìm vật liệu theo mã / tên…"
              className="flex-1 bg-transparent px-2 text-[13px] outline-none placeholder:text-zinc-400"
            />
          </div>
          <CommandPrimitive.List className="max-h-[320px] overflow-y-auto p-1">
            {groups.length === 0 ? (
              <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-zinc-500">
                Không tìm thấy vật liệu khớp "{query}".
              </CommandPrimitive.Empty>
            ) : (
              groups.map(([group, items]) => (
                <CommandPrimitive.Group
                  key={group}
                  heading={group}
                  className="px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-zinc-500"
                >
                  {items.map((m) => (
                    <CommandPrimitive.Item
                      key={m.code}
                      value={`${m.code} ${m.name}`}
                      onSelect={() => {
                        onChange(m.code, m.name);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px]",
                        "aria-selected:bg-zinc-100",
                      )}
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          m.code === value
                            ? "text-indigo-600"
                            : "text-transparent",
                        )}
                      />
                      <span className="font-mono text-xs font-medium text-zinc-800">
                        {m.code}
                      </span>
                      <span className="truncate text-zinc-700">{m.name}</span>
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ))
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}

/* ─────────────────────────── Process route builder ─────────────────────────── */

interface ProcessRouteBuilderProps {
  selected: string[];
  onAdd: (code: string) => void;
  onRemove: (code: string) => void;
  onMove: (code: string, dir: -1 | 1) => void;
}

function ProcessRouteBuilder({
  selected,
  onAdd,
  onRemove,
  onMove,
}: ProcessRouteBuilderProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const available = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROCESSES.filter((p) => {
      if (selected.includes(p.code)) return false;
      if (!q) return true;
      return (
        p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      );
    });
  }, [query, selected]);

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      {selected.length > 0 ? (
        <ol className="flex flex-wrap gap-1.5">
          {selected.map((code, idx) => {
            const proc = PROCESS_MAP.get(code);
            return (
              <li
                key={code}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 py-1 pl-1 pr-1 text-[12px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200"
              >
                <span className="inline-flex items-center gap-0.5 text-emerald-400">
                  <GripVertical className="h-3 w-3" aria-hidden />
                  <span className="font-mono text-[10px] text-emerald-600">
                    {idx + 1}
                  </span>
                </span>
                <span className="pl-0.5">{proc?.name ?? code}</span>
                <div className="ml-0.5 flex items-center">
                  <button
                    type="button"
                    onClick={() => onMove(code, -1)}
                    disabled={idx === 0}
                    className="rounded px-1 text-emerald-500 hover:bg-emerald-100 hover:text-emerald-800 disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Chuyển lên trước"
                    aria-label="Chuyển lên trước"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(code, 1)}
                    disabled={idx === selected.length - 1}
                    className="rounded px-1 text-emerald-500 hover:bg-emerald-100 hover:text-emerald-800 disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Chuyển xuống sau"
                    aria-label="Chuyển xuống sau"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(code)}
                    className="ml-0.5 rounded p-0.5 text-emerald-500 hover:bg-emerald-100 hover:text-emerald-800"
                    title="Xoá công đoạn"
                    aria-label="Xoá công đoạn"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-md border border-dashed border-zinc-200 px-3 py-2 text-[11px] text-zinc-400">
          Chưa chọn công đoạn nào. Click "Thêm công đoạn" để bắt đầu.
        </p>
      )}

      {/* Add button + popover */}
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              + Thêm công đoạn
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[360px] p-0" sideOffset={4}>
            <CommandPrimitive
              shouldFilter={false}
              className="flex flex-col"
              loop
            >
              <div className="flex items-center border-b border-zinc-200 px-3 py-2">
                <Search className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                <CommandPrimitive.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Tìm công đoạn…"
                  className="flex-1 bg-transparent px-2 text-[13px] outline-none placeholder:text-zinc-400"
                />
              </div>
              <CommandPrimitive.List className="max-h-[280px] overflow-y-auto p-1">
                {available.length === 0 ? (
                  <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-zinc-500">
                    {selected.length === PROCESSES.length
                      ? "Đã chọn đủ tất cả công đoạn."
                      : `Không tìm thấy "${query}".`}
                  </CommandPrimitive.Empty>
                ) : (
                  <CommandPrimitive.Group>
                    {available.map((p) => (
                      <CommandPrimitive.Item
                        key={p.code}
                        value={`${p.code} ${p.name}`}
                        onSelect={() => {
                          onAdd(p.code);
                          setQuery("");
                        }}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px]",
                          "aria-selected:bg-zinc-100",
                        )}
                      >
                        <span className="font-mono text-xs font-medium text-zinc-500">
                          {p.code}
                        </span>
                        <span className="truncate text-zinc-700">{p.name}</span>
                      </CommandPrimitive.Item>
                    ))}
                  </CommandPrimitive.Group>
                )}
              </CommandPrimitive.List>
            </CommandPrimitive>
          </PopoverContent>
        </Popover>
        <span className="font-mono text-[11px] text-zinc-400">
          {selected.length} công đoạn
        </span>
      </div>
    </div>
  );
}
