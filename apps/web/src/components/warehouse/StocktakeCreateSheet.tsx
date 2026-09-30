"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatQty } from "@/lib/format";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeaderNav,
} from "@/components/ui/sheet";

/**
 * V4.3 Việc 2 — Sheet tạo phiên kiểm kê: chọn phạm vi theo khu/kệ/ô rồi tạo.
 * Hệ thống chụp tồn sổ sách NGAY tại thời điểm tạo (server-side).
 */

interface BinOption {
  id: string;
  fullCode: string;
  area: string | null;
  rack: string | null;
  totalQty: number;
}

export function StocktakeCreateSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (sessionId: string) => void;
}) {
  const [bins, setBins] = React.useState<BinOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [scopeNote, setScopeNote] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/warehouse/layout")
      .then((r) => r.json())
      .then((json: { data: { bins: BinOption[] } }) => setBins(json.data.bins ?? []))
      .catch(() => toast.error("Không tải được danh sách ô kệ"))
      .finally(() => setLoading(false));
    setSelected(new Set());
    setScopeNote("");
    setNotes("");
  }, [open]);

  const byArea = React.useMemo(() => {
    const map = new Map<string, BinOption[]>();
    for (const b of bins) {
      const key = b.area ?? "—";
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [bins]);

  const toggleBin = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleArea = (areaBins: BinOption[]) => {
    const ids = areaBins.map((b) => b.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleCreate = async () => {
    if (selected.size === 0) {
      toast.error("Chọn ít nhất 1 ô để kiểm kê");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/warehouse/stocktake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          binIds: [...selected],
          scopeNote: scopeNote.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json()) as { data?: { id: string; code: string; lineCount: number }; error?: { message: string } };
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      toast.success(`Đã tạo phiên ${json.data!.code} — ${json.data!.lineCount} dòng chụp tồn.`);
      onOpenChange(false);
      onCreated(json.data!.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" hideCloseButton className="flex flex-col">
        <SheetHeaderNav title="Tạo phiên kiểm kê" onCancel={() => onOpenChange(false)} />
        <SheetBody className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Mô tả phạm vi (tuỳ chọn)
            </label>
            <Input
              value={scopeNote}
              onChange={(e) => setScopeNote(e.target.value)}
              placeholder="VD: Khu A - Kệ 01-05"
              maxLength={255}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Ghi chú (tuỳ chọn)
            </label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-50">
                Chọn ô kệ ({selected.size} đã chọn)
              </h3>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
              </div>
            ) : (
              <div className="max-h-[45vh] space-y-3 overflow-y-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                {byArea.map(([area, areaBins]) => {
                  const allSelected = areaBins.every((b) => selected.has(b.id));
                  return (
                    <div key={area}>
                      <div className="mb-1.5 flex items-center gap-2">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() => toggleArea(areaBins)}
                          aria-label={`Chọn cả khu ${area}`}
                        />
                        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          Khu {area} ({areaBins.length} ô)
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 pl-6 sm:grid-cols-3">
                        {areaBins.map((b) => (
                          <label
                            key={b.id}
                            className="flex min-h-[44px] items-center gap-1.5 rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700"
                          >
                            <Checkbox
                              checked={selected.has(b.id)}
                              onCheckedChange={() => toggleBin(b.id)}
                            />
                            <span className="min-w-0 flex-1 truncate font-mono">{b.fullCode}</span>
                            {b.totalQty > 0 && (
                              <span className="shrink-0 tabular-nums text-zinc-400">
                                {formatQty(b.totalQty)}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button disabled={creating || selected.size === 0} onClick={() => void handleCreate()}>
            {creating ? "Đang tạo…" : "Tạo phiên kiểm kê"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
