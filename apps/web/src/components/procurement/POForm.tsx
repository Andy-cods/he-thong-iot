"use client";

import * as React from "react";
import { toast } from "sonner";
import type { POCreateInput } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PRLineEditor, type PRLineDraft } from "./PRLineEditor";

export interface POFormProps {
  onSubmit: (data: POCreateInput) => Promise<void>;
  loading?: boolean;
}

/**
 * POForm — tạo PO thủ công 1 supplier.
 * Form tối giản V1.2: supplierId nhập UUID (V1.3 sẽ có SupplierPicker),
 * ETA, notes, lines dùng lại PRLineEditor.
 */
export function POForm({ onSubmit, loading }: POFormProps) {
  const [supplierId, setSupplierId] = React.useState("");
  const [expectedEta, setExpectedEta] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<PRLineDraft[]>([
    { localId: crypto.randomUUID(), item: null, qty: "1" },
  ]);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[0-9a-f-]{36}$/i.test(supplierId)) {
      toast.error("Supplier ID phải là UUID hợp lệ.");
      return;
    }
    const valid = lines.filter((l) => l.item);
    if (valid.length === 0) {
      toast.error("PO cần ít nhất 1 dòng.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        supplierId,
        linkedOrderId: null,
        expectedEta: expectedEta ? new Date(expectedEta) : null,
        currency: "VND",
        notes: notes.trim() || null,
        lines: valid.map((l) => ({
          itemId: l.item!.id,
          orderedQty: Number(l.qty),
          snapshotLineId: null,
          expectedEta: l.neededBy ? new Date(l.neededBy) : null,
          notes: l.notes?.trim() || null,
        })),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="po-supplier" uppercase required>
            Supplier ID (UUID)
          </Label>
          <Input
            id="po-supplier"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-eta" uppercase>
            ETA dự kiến
          </Label>
          <Input
            id="po-eta"
            type="date"
            value={expectedEta}
            onChange={(e) => setExpectedEta(e.target.value)}
          />
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="po-notes" uppercase>
            Ghi chú
          </Label>
          <Textarea
            id="po-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={2000}
          />
        </div>
      </div>

      <PRLineEditor lines={lines} onChange={setLines} disabled={submitting} />

      <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
        <Button type="submit" disabled={submitting || loading}>
          {submitting ? "Đang gửi…" : "Tạo PO"}
        </Button>
      </div>
    </form>
  );
}
