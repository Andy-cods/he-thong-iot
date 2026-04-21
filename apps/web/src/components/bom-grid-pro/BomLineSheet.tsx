"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUpdateBomLine } from "@/hooks/useBom";
import type { BomFlatRow } from "@/lib/bom-grid/flatten-tree";
import { cn } from "@/lib/utils";

/**
 * V1.7-beta.2.1 — Side sheet sửa 1 BOM line, form conditional theo `kind`.
 *
 * Cấu trúc 3 section:
 *   1. Thông tin chung (qty/scrap/uom/description) — luôn hiển thị.
 *   2. Thương mại (kind=com) — supplierCode / leadTimeDays / moq / estimatedPrice
 *      → lưu vào `metadata.sourcing = { supplierCode, leadTimeDays, moq, estimatedPrice }`.
 *   3. Gia công (kind=fab) — materialCode / blankSize / processRoute / technicalNotes
 *      → lưu vào `metadata.routing = { materialCode, blankSize, processRoute, technicalNotes }`.
 *
 * Radio toggle Thương mại / Gia công ở đầu sheet. Khi chọn fab thì ẩn section
 * Thương mại và ngược lại — 2 flow distinct, không mix.
 *
 * Submit: merge metadata JSONB — `{ ...existing, kind, sourcing?|null, routing?|null, size }`.
 */

export interface BomLineSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  templateCode: string;
  line: BomFlatRow | null;
}

type KindMode = "com" | "fab";

interface FormState {
  // Common
  kind: KindMode;
  qtyPerParent: string;
  scrapPercent: string;
  uom: string;
  description: string;
  // Commercial (com)
  supplierCode: string;
  leadTimeDays: string;
  moq: string;
  estimatedPrice: string;
  // Fabricated (fab)
  materialCode: string;
  blankSize: string;
  processRoute: string;
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

function buildInitial(line: BomFlatRow | null): FormState {
  if (!line) {
    return {
      kind: "com",
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "",
      description: "",
      supplierCode: "",
      leadTimeDays: "",
      moq: "",
      estimatedPrice: "",
      materialCode: "",
      blankSize: "",
      processRoute: "",
      technicalNotes: "",
    };
  }
  const meta = (line.node.metadata ?? {}) as {
    size?: unknown;
    sourcing?: {
      supplierCode?: unknown;
      leadTimeDays?: unknown;
      moq?: unknown;
      estimatedPrice?: unknown;
    };
    routing?: {
      materialCode?: unknown;
      blankSize?: unknown;
      processRoute?: unknown;
      technicalNotes?: unknown;
    };
  };
  const sourcing = meta.sourcing ?? {};
  const routing = meta.routing ?? {};
  return {
    kind: deriveDefaultKind(line),
    qtyPerParent: String(line.node.qtyPerParent ?? "1"),
    scrapPercent: String(line.node.scrapPercent ?? "0"),
    uom: line.node.uom ?? "",
    description: line.node.description ?? "",
    supplierCode:
      line.node.supplierItemCode ??
      (typeof sourcing.supplierCode === "string" ? sourcing.supplierCode : ""),
    leadTimeDays:
      typeof sourcing.leadTimeDays === "number"
        ? String(sourcing.leadTimeDays)
        : typeof sourcing.leadTimeDays === "string"
          ? sourcing.leadTimeDays
          : "",
    moq:
      typeof sourcing.moq === "number"
        ? String(sourcing.moq)
        : typeof sourcing.moq === "string"
          ? sourcing.moq
          : "",
    estimatedPrice:
      typeof sourcing.estimatedPrice === "number"
        ? String(sourcing.estimatedPrice)
        : typeof sourcing.estimatedPrice === "string"
          ? sourcing.estimatedPrice
          : "",
    materialCode:
      typeof routing.materialCode === "string"
        ? routing.materialCode
        : (line.node.componentCategory ?? ""),
    blankSize:
      typeof routing.blankSize === "string"
        ? routing.blankSize
        : typeof meta.size === "string"
          ? meta.size
          : "",
    processRoute:
      typeof routing.processRoute === "string" ? routing.processRoute : "",
    technicalNotes:
      typeof routing.technicalNotes === "string" ? routing.technicalNotes : "",
  };
}

export function BomLineSheet({
  open,
  onOpenChange,
  templateId,
  templateCode,
  line,
}: BomLineSheetProps) {
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

  const update =
    (k: keyof FormState) =>
    (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
      if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }));
    };

  const setKind = (next: KindMode) => {
    setForm((prev) => ({ ...prev, kind: next }));
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
      if (form.leadTimeDays !== "") {
        const n = Number(form.leadTimeDays);
        if (!Number.isFinite(n) || n < 0)
          next.leadTimeDays = "Lead time phải ≥ 0";
      }
      if (form.moq !== "") {
        const n = Number(form.moq);
        if (!Number.isFinite(n) || n < 0) next.moq = "MOQ phải ≥ 0";
      }
      if (form.estimatedPrice !== "") {
        const n = Number(form.estimatedPrice);
        if (!Number.isFinite(n) || n < 0)
          next.estimatedPrice = "Giá phải ≥ 0";
      }
    } else {
      if (form.materialCode.length > 64)
        next.materialCode = "Vật liệu tối đa 64 ký tự";
      if (form.blankSize.length > 64)
        next.blankSize = "Kích thước tối đa 64 ký tự";
      if (form.processRoute.length > 1000)
        next.processRoute = "Route tối đa 1000 ký tự";
      if (form.technicalNotes.length > 500)
        next.technicalNotes = "Ghi chú tối đa 500 ký tự";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line) return;
    if (!validate()) return;

    const existingMeta = (line.node.metadata ?? {}) as Record<string, unknown>;
    const nextMeta: Record<string, unknown> = { ...existingMeta };
    nextMeta.kind = form.kind;

    if (form.kind === "com") {
      const sourcing: Record<string, unknown> = {};
      if (form.supplierCode.trim())
        sourcing.supplierCode = form.supplierCode.trim();
      if (form.leadTimeDays !== "")
        sourcing.leadTimeDays = Number(form.leadTimeDays);
      if (form.moq !== "") sourcing.moq = Number(form.moq);
      if (form.estimatedPrice !== "")
        sourcing.estimatedPrice = Number(form.estimatedPrice);
      if (Object.keys(sourcing).length > 0) nextMeta.sourcing = sourcing;
      else delete nextMeta.sourcing;
      // Gia công data không còn relevant khi chuyển sang Thương mại — giữ
      // nguyên metadata.routing để user revert nếu cần. Không xoá tự động.
    } else {
      const routing: Record<string, unknown> = {};
      if (form.materialCode.trim())
        routing.materialCode = form.materialCode.trim();
      if (form.blankSize.trim()) routing.blankSize = form.blankSize.trim();
      if (form.processRoute.trim())
        routing.processRoute = form.processRoute.trim();
      if (form.technicalNotes.trim())
        routing.technicalNotes = form.technicalNotes.trim();
      if (Object.keys(routing).length > 0) nextMeta.routing = routing;
      else delete nextMeta.routing;
      // Mirror blankSize ra `metadata.size` để các chỗ khác (grid cột Kích
      // thước) hiển thị ngay không cần migration.
      if (form.blankSize.trim()) {
        nextMeta.size = form.blankSize.trim();
      }
    }

    try {
      await mutation.mutateAsync({
        lineId: line.id,
        data: {
          qtyPerParent: Number(form.qtyPerParent),
          scrapPercent: Number(form.scrapPercent),
          uom: form.uom.trim() || null,
          description: form.description.trim() || null,
          // Giữ supplierItemCode đồng bộ với sourcing.supplierCode để BomGridPro
          // cột NCC hiển thị đúng (V1 đọc supplierItemCode).
          supplierItemCode:
            form.kind === "com"
              ? form.supplierCode.trim() || null
              : (line.node.supplierItemCode ?? null),
          metadata: nextMeta,
        },
      });
      toast.success("Đã lưu thay đổi");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error)?.message ?? "Không cập nhật được linh kiện");
    }
  };

  const pending = mutation.isPending;
  const sku = line?.node.componentSku ?? "—";
  const name = line?.node.componentName ?? "(chưa có tên)";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="md:w-[520px]">
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
                  label="🛒 Thương mại"
                  hint="Mua ngoài · NCC · MOQ"
                  accent="blue"
                />
                <KindRadio
                  checked={form.kind === "fab"}
                  onClick={() => setKind("fab")}
                  label="🔧 Gia công"
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
                    onChange={update("qtyPerParent")}
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
                    onChange={update("scrapPercent")}
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
                    onChange={update("uom")}
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
                    onChange={update("description")}
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

            {/* Section 2A — Commercial */}
            {form.kind === "com" && (
              <Section
                title="Thông tin thương mại"
                accent="blue"
                hint="Mua ngoài từ nhà cung cấp"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="bls-supplier">Mã nhà cung cấp</Label>
                    <Input
                      id="bls-supplier"
                      maxLength={64}
                      value={form.supplierCode}
                      onChange={update("supplierCode")}
                      placeholder="VD: SUP-A123"
                      error={!!errors.supplierCode}
                    />
                    {errors.supplierCode && (
                      <p className="text-[11px] text-red-600">
                        {errors.supplierCode}
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
                      onChange={update("leadTimeDays")}
                      placeholder="VD: 7"
                      error={!!errors.leadTimeDays}
                    />
                    {errors.leadTimeDays && (
                      <p className="text-[11px] text-red-600">
                        {errors.leadTimeDays}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bls-moq">MOQ (tối thiểu)</Label>
                    <Input
                      id="bls-moq"
                      type="number"
                      min="0"
                      step="1"
                      value={form.moq}
                      onChange={update("moq")}
                      placeholder="VD: 100"
                      error={!!errors.moq}
                    />
                    {errors.moq && (
                      <p className="text-[11px] text-red-600">{errors.moq}</p>
                    )}
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="bls-price">Giá mua ước tính (VND)</Label>
                    <Input
                      id="bls-price"
                      type="number"
                      min="0"
                      step="1"
                      value={form.estimatedPrice}
                      onChange={update("estimatedPrice")}
                      placeholder="VD: 125000"
                      error={!!errors.estimatedPrice}
                    />
                    {errors.estimatedPrice && (
                      <p className="text-[11px] text-red-600">
                        {errors.estimatedPrice}
                      </p>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {/* Section 2B — Fabricated */}
            {form.kind === "fab" && (
              <Section
                title="Thông tin gia công"
                accent="emerald"
                hint="Sản xuất nội bộ · CNC/phay/tiện"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="bls-material">Vật liệu gốc</Label>
                    <Input
                      id="bls-material"
                      maxLength={64}
                      value={form.materialCode}
                      onChange={update("materialCode")}
                      placeholder="POM · AL6061 · SUS304…"
                      error={!!errors.materialCode}
                    />
                    {errors.materialCode && (
                      <p className="text-[11px] text-red-600">
                        {errors.materialCode}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bls-blank">Kích thước phôi</Label>
                    <Input
                      id="bls-blank"
                      maxLength={64}
                      value={form.blankSize}
                      onChange={update("blankSize")}
                      placeholder="50x50x10"
                      error={!!errors.blankSize}
                    />
                    {errors.blankSize && (
                      <p className="text-[11px] text-red-600">
                        {errors.blankSize}
                      </p>
                    )}
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="bls-route">Quy trình / Route</Label>
                    <Textarea
                      id="bls-route"
                      maxLength={1000}
                      rows={3}
                      value={form.processRoute}
                      onChange={update("processRoute")}
                      placeholder={`Mill → Drill → Tap → QC\n(mỗi bước 1 dòng hoặc Mill/Drill/Lathe cách nhau dấu "/")`}
                      error={!!errors.processRoute}
                    />
                    <div className="flex items-center justify-between text-[11px]">
                      {errors.processRoute ? (
                        <span className="text-red-600">
                          {errors.processRoute}
                        </span>
                      ) : (
                        <span className="text-zinc-400">
                          Liệt kê các công đoạn theo thứ tự.
                        </span>
                      )}
                      <span className="font-mono text-zinc-400">
                        {form.processRoute.length}/1000
                      </span>
                    </div>
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="bls-tech">Ghi chú kỹ thuật</Label>
                    <Textarea
                      id="bls-tech"
                      maxLength={500}
                      rows={2}
                      value={form.technicalNotes}
                      onChange={update("technicalNotes")}
                      placeholder="Dung sai, bề mặt, xử lý nhiệt…"
                      error={!!errors.technicalNotes}
                    />
                    <div className="flex items-center justify-between text-[11px]">
                      {errors.technicalNotes ? (
                        <span className="text-red-600">
                          {errors.technicalNotes}
                        </span>
                      ) : (
                        <span className="text-zinc-400">
                          Tối đa 500 ký tự.
                        </span>
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
            <Button type="submit" disabled={pending}>
              {pending ? (
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
