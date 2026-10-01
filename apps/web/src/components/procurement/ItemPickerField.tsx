"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { can } from "@iot/shared";
import { ItemPicker, type ItemPickerValue } from "@/components/bom/ItemPicker";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeaderNav,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/useSession";

/**
 * V4.4 (Việc 3) — Ô chọn vật tư có tìm kiếm (mã/tên, hiện ĐVT + tồn) + nút
 * "Tạo vật tư mới" ngay trong form Đề xuất vật tư (DNVT/YCVT). Thay cho ô
 * gõ tên tự do trước đây (nguồn tạo item trùng khi chuyển PO — xem
 * `findOrCreateItemForLine`, LOOP_E2E.md #2).
 *
 * Bọc `ItemPicker` (đã có sẵn cho BOM) + thêm Sheet tạo nhanh: kiểm trùng
 * tên gần giống ở server (`findExactNameDuplicate`) trước khi tạo, gợi ý
 * vật tư có sẵn nếu trùng, cho phép "vẫn tạo mới" nếu người dùng xác nhận.
 */

const UOM_OPTIONS = [
  "PCS", "SET", "KG", "G", "M", "MM", "CM", "L", "ML", "HOUR", "PAIR", "BOX", "ROLL", "SHEET",
] as const;

const CATEGORY_OPTIONS: Array<{ value: "MATERIAL" | "CONSUMABLE" | "TOOL" | "OTHER"; label: string }> = [
  { value: "MATERIAL", label: "Vật tư phục vụ SX" },
  { value: "CONSUMABLE", label: "Tiêu hao" },
  { value: "TOOL", label: "CCDC" },
  { value: "OTHER", label: "Khác" },
];

export function ItemPickerField({
  value,
  onChange,
  placeholder,
  disabled,
  id,
}: {
  value: ItemPickerValue | null;
  onChange: (v: ItemPickerValue | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const session = useSession();
  // V4.6 — chủ xưởng yêu cầu mọi vai tạo được phiếu Đề xuất vật tư (pr:create)
  // cũng tạo nhanh được vật tư ngay trong phiếu (trước đây gate theo
  // `create:item`, chỉ admin/planner → qc/warehouse/operator/accountant/
  // purchaser bị 403). Khớp RBAC mới ở `/api/items/quick-create`.
  const canCreateItem = can(session.data?.roles, "create", "pr");

  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [uom, setUom] = React.useState<(typeof UOM_OPTIONS)[number]>("PCS");
  const [category, setCategory] = React.useState<(typeof CATEGORY_OPTIONS)[number]["value"]>("MATERIAL");
  const [submitting, setSubmitting] = React.useState(false);
  const [duplicate, setDuplicate] = React.useState<{ id: string; sku: string; name: string } | null>(null);

  const openCreate = (searchText: string) => {
    setName(searchText.trim());
    setDuplicate(null);
    setUom("PCS");
    setCategory("MATERIAL");
    setSheetOpen(true);
  };

  const submit = async (force: boolean) => {
    if (!name.trim()) {
      toast.error("Nhập tên vật tư.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/items/quick-create", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), uom, category, force }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { id: string; sku: string; name: string; uom?: string; duplicate?: { id: string; sku: string; name: string } };
        error?: { code?: string; message?: string };
      };
      if (res.status === 409 && json.data?.duplicate) {
        setDuplicate(json.data.duplicate);
        return;
      }
      if (!res.ok || !json.data) {
        toast.error(json.error?.message ?? "Không tạo được vật tư.");
        return;
      }
      toast.success(`Đã tạo vật tư ${json.data.sku}.`);
      onChange({ id: json.data.id, sku: json.data.sku, name: json.data.name, uom });
      setSheetOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ItemPicker
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        showStock
        onCreateNew={canCreateItem ? openCreate : undefined}
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" size="sm" hideCloseButton>
          <SheetHeaderNav
            title="Tạo vật tư mới"
            onCancel={() => setSheetOpen(false)}
            action={{
              label: submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tạo",
              onClick: () => void submit(false),
              disabled: submitting,
            }}
          />
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="qc-item-name" required>Tên vật tư</Label>
              <Input
                id="qc-item-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDuplicate(null);
                }}
                placeholder="VD: Nhôm AL6061"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qc-item-uom">ĐVT</Label>
              <select
                id="qc-item-uom"
                value={uom}
                onChange={(e) => setUom(e.target.value as (typeof UOM_OPTIONS)[number])}
                className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {UOM_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qc-item-category">Nhóm</Label>
              <select
                id="qc-item-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as (typeof CATEGORY_OPTIONS)[number]["value"])}
                className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {duplicate && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                <p className="mb-2 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Đã có vật tư tên gần giống:{" "}
                  <span className="font-mono font-semibold">{duplicate.sku}</span> —{" "}
                  {duplicate.name}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      onChange({ id: duplicate.id, sku: duplicate.sku, name: duplicate.name });
                      setSheetOpen(false);
                    }}
                  >
                    Dùng vật tư này
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => void submit(true)}
                  >
                    Vẫn tạo mới
                  </Button>
                </div>
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
