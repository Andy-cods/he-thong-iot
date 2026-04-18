"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { bomLineUpdateSchema, type BomLineUpdate } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateBomLine, type BomTreeNodeRaw } from "@/hooks/useBom";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

export interface BomLineInspectorProps {
  templateId: string;
  node: BomTreeNodeRaw | null;
  onClose: () => void;
}

export function BomLineInspector({
  templateId,
  node,
  onClose,
}: BomLineInspectorProps) {
  const [editMode, setEditMode] = React.useState(false);

  React.useEffect(() => {
    setEditMode(false);
  }, [node?.id]);

  const updateLine = useUpdateBomLine(templateId);
  const isMobile = useIsMobile();

  const form = useForm<BomLineUpdate>({
    resolver: zodResolver(bomLineUpdateSchema),
    defaultValues: {
      qtyPerParent: node ? Number(node.qtyPerParent) : 1,
      scrapPercent: node ? Number(node.scrapPercent) : 0,
      uom: node?.uom ?? null,
      description: node?.description ?? null,
      supplierItemCode: node?.supplierItemCode ?? null,
    },
    mode: "onBlur",
  });

  React.useEffect(() => {
    if (node) {
      form.reset({
        qtyPerParent: Number(node.qtyPerParent),
        scrapPercent: Number(node.scrapPercent),
        uom: node.uom ?? null,
        description: node.description ?? null,
        supplierItemCode: node.supplierItemCode ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id]);

  const handleSave = async (values: BomLineUpdate) => {
    if (!node) return;
    try {
      await updateLine.mutateAsync({ lineId: node.id, data: values });
      toast.success("Đã lưu linh kiện.");
      setEditMode(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Sheet open={!!node} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        size={isMobile ? "lg" : "md"}
      >
        <SheetHeader>
          <SheetTitle>
            {node?.componentSku ? (
              <span className="flex items-center gap-2">
                <span className="font-mono text-base">{node.componentSku}</span>
                <span className="text-zinc-500">·</span>
                <span className="truncate text-base">
                  {node.componentName ?? ""}
                </span>
              </span>
            ) : (
              "Chi tiết linh kiện"
            )}
          </SheetTitle>
        </SheetHeader>

        <SheetBody>
          {!node ? null : !editMode ? (
            <dl className="space-y-3 text-base">
              <ReadRow label="SKU" value={node.componentSku ?? "—"} mono />
              <ReadRow label="Tên" value={node.componentName ?? "—"} />
              <ReadRow
                label="Số lượng / cha"
                value={`${formatNumber(Number(node.qtyPerParent))} ${
                  node.uom ?? node.componentUom ?? ""
                }`}
                mono
              />
              <ReadRow
                label="Scrap %"
                value={`${Number(node.scrapPercent).toFixed(2)}%`}
                mono
              />
              <ReadRow
                label="UoM override"
                value={node.uom ?? "(kế thừa item)"}
              />
              <ReadRow
                label="Nhà cung cấp (code)"
                value={node.supplierItemCode ?? "—"}
                mono
              />
              <ReadRow
                label="Mô tả"
                value={node.description ?? "—"}
                multiline
              />
              <ReadRow label="Level" value={`Cấp ${node.level}`} />
              <ReadRow label="Số con trực tiếp" value={String(node.childCount)} />
            </dl>
          ) : (
            <form
              id="bom-line-edit-form"
              onSubmit={form.handleSubmit(handleSave)}
              className="space-y-4"
              noValidate
            >
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <Label htmlFor="qty" uppercase required>
                    Số lượng
                  </Label>
                  <Input
                    id="qty"
                    type="number"
                    step="0.0001"
                    min={0.0001}
                    className="tabular-nums"
                    {...form.register("qtyPerParent", {
                      valueAsNumber: true,
                    })}
                    aria-invalid={!!form.formState.errors.qtyPerParent}
                  />
                  <HelperText
                    tone={form.formState.errors.qtyPerParent ? "error" : "muted"}
                  >
                    {form.formState.errors.qtyPerParent?.message ?? "SL / parent"}
                  </HelperText>
                </Field>
                <Field>
                  <Label htmlFor="scrap" uppercase>
                    Scrap %
                  </Label>
                  <Input
                    id="scrap"
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    className="tabular-nums"
                    {...form.register("scrapPercent", {
                      valueAsNumber: true,
                    })}
                    aria-invalid={!!form.formState.errors.scrapPercent}
                  />
                  <HelperText
                    tone={form.formState.errors.scrapPercent ? "error" : "muted"}
                  >
                    {form.formState.errors.scrapPercent?.message ?? "0-100"}
                  </HelperText>
                </Field>
              </div>

              <Field>
                <Label htmlFor="uom" uppercase>
                  UoM override
                </Label>
                <Input
                  id="uom"
                  placeholder="Để trống = kế thừa item"
                  {...form.register("uom")}
                />
                <HelperText tone="muted">Tối đa 32 ký tự</HelperText>
              </Field>

              <Field>
                <Label htmlFor="supplier-code" uppercase>
                  Mã NCC
                </Label>
                <Input
                  id="supplier-code"
                  placeholder="VD: ACME-123"
                  {...form.register("supplierItemCode")}
                />
              </Field>

              <Field>
                <Label htmlFor="desc" uppercase>
                  Mô tả
                </Label>
                <Textarea
                  id="desc"
                  rows={3}
                  {...form.register("description")}
                />
              </Field>
            </form>
          )}
        </SheetBody>

        <SheetFooter>
          {!editMode ? (
            <>
              <Button variant="ghost" size="md" onClick={onClose}>
                Đóng
              </Button>
              <Button size="md" onClick={() => setEditMode(true)}>
                Sửa
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setEditMode(false)}
                disabled={updateLine.isPending}
              >
                Huỷ
              </Button>
              <Button
                size="md"
                type="submit"
                form="bom-line-edit-form"
                disabled={updateLine.isPending}
              >
                {updateLine.isPending ? "Đang lưu…" : "Lưu"}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ReadRow({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-2">
      <dt className="text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd
        className={cn(
          "text-base text-zinc-900",
          mono && "font-mono text-sm",
          multiline && "whitespace-pre-wrap",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}

function HelperText({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <p
      className={cn(
        "min-h-4 text-sm",
        tone === "error" ? "text-red-700" : "text-zinc-500",
      )}
    >
      {children}
    </p>
  );
}
