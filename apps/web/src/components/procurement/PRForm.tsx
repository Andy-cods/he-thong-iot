"use client";

import * as React from "react";
import { toast } from "sonner";
import type { PRCreateInput } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PRLineEditor, type PRLineDraft } from "./PRLineEditor";

export interface PRFormProps {
  linkedOrderId?: string | null;
  onSubmit: (data: PRCreateInput) => Promise<void>;
  submitLabel?: string;
  loading?: boolean;
}

/**
 * PRForm — form tạo PR manual với title, notes, lines, linkedOrder (optional).
 * Source mặc định MANUAL; từ shortage dùng /new?fromShortage=ids prefill.
 */
export function PRForm({
  linkedOrderId,
  onSubmit,
  submitLabel = "Tạo PR",
  loading,
}: PRFormProps) {
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<PRLineDraft[]>([
    { localId: crypto.randomUUID(), item: null, qty: "1" },
  ]);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.item);
    if (validLines.length === 0) {
      toast.error("PR cần ít nhất 1 dòng có item.");
      return;
    }
    for (const l of validLines) {
      const q = Number(l.qty);
      if (!Number.isFinite(q) || q <= 0) {
        toast.error(`Dòng ${l.item?.sku}: số lượng không hợp lệ.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim() || null,
        source: "MANUAL",
        linkedOrderId: linkedOrderId ?? null,
        notes: notes.trim() || null,
        lines: validLines.map((l) => ({
          itemId: l.item!.id,
          qty: Number(l.qty),
          preferredSupplierId: l.preferredSupplierId ?? null,
          snapshotLineId: null,
          neededBy: l.neededBy ? new Date(l.neededBy) : null,
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
          <Label htmlFor="pr-title" uppercase>
            Tiêu đề
          </Label>
          <Input
            id="pr-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: PR nguyên vật liệu Q2-2026"
            maxLength={255}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-notes" uppercase>
            Ghi chú
          </Label>
          <Textarea
            id="pr-notes"
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
          {submitting ? "Đang gửi…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
