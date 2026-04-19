"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTION_LABEL,
  type EcoLineAction,
} from "@/hooks/useEco";

export interface EcoLineDraft {
  key: string;
  action: EcoLineAction;
  targetLineId: string | null;
  componentItemId: string | null;
  qtyPerParent: number | null;
  scrapPercent: number | null;
  description: string | null;
}

export function EcoLineEditor({
  lines,
  onChange,
  readonly = false,
}: {
  lines: EcoLineDraft[];
  onChange: (next: EcoLineDraft[]) => void;
  readonly?: boolean;
}) {
  const patch = (key: string, p: Partial<EcoLineDraft>) => {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));
  };

  const remove = (key: string) => {
    onChange(lines.filter((l) => l.key !== key));
  };

  const add = () => {
    onChange([
      ...lines,
      {
        key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action: "UPDATE_QTY",
        targetLineId: null,
        componentItemId: null,
        qtyPerParent: 1,
        scrapPercent: null,
        description: null,
      },
    ]);
  };

  return (
    <div className="space-y-3">
      {lines.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500">
          Chưa có thay đổi nào — bấm “Thêm thay đổi” để bắt đầu.
        </p>
      ) : null}

      <div className="space-y-3">
        {lines.map((l, idx) => (
          <div
            key={l.key}
            className="rounded-md border border-zinc-200 bg-white p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Thay đổi #{idx + 1}
              </div>
              {!readonly ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(l.key)}
                >
                  <Trash2
                    className="h-3.5 w-3.5 text-red-500"
                    aria-hidden="true"
                  />
                </Button>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label uppercase>Loại thay đổi</Label>
                <Select
                  value={l.action}
                  onValueChange={(v) =>
                    patch(l.key, { action: v as EcoLineAction })
                  }
                  disabled={readonly}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ACTION_LABEL) as EcoLineAction[]).map(
                      (a) => (
                        <SelectItem key={a} value={a}>
                          {ACTION_LABEL[a]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              {l.action !== "ADD_LINE" ? (
                <div className="space-y-1.5">
                  <Label uppercase>BOM line ID (target)</Label>
                  <Input
                    value={l.targetLineId ?? ""}
                    onChange={(e) =>
                      patch(l.key, { targetLineId: e.target.value || null })
                    }
                    placeholder="UUID của bom_line cần thay"
                    disabled={readonly}
                    className="h-9 font-mono text-xs"
                  />
                </div>
              ) : null}
              {(l.action === "ADD_LINE" ||
                l.action === "REPLACE_COMPONENT") && (
                <div className="space-y-1.5">
                  <Label uppercase>Component Item ID</Label>
                  <Input
                    value={l.componentItemId ?? ""}
                    onChange={(e) =>
                      patch(l.key, {
                        componentItemId: e.target.value || null,
                      })
                    }
                    placeholder="UUID của item thay thế"
                    disabled={readonly}
                    className="h-9 font-mono text-xs"
                  />
                </div>
              )}
              {(l.action === "ADD_LINE" || l.action === "UPDATE_QTY") && (
                <div className="space-y-1.5">
                  <Label uppercase>Qty per parent</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={l.qtyPerParent ?? ""}
                    onChange={(e) =>
                      patch(l.key, {
                        qtyPerParent: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    disabled={readonly}
                    className="h-9 tabular-nums"
                  />
                </div>
              )}
              {(l.action === "ADD_LINE" || l.action === "UPDATE_SCRAP") && (
                <div className="space-y-1.5">
                  <Label uppercase>Scrap %</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={l.scrapPercent ?? ""}
                    onChange={(e) =>
                      patch(l.key, {
                        scrapPercent: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    disabled={readonly}
                    className="h-9 tabular-nums"
                  />
                </div>
              )}
              <div className="space-y-1.5 md:col-span-2">
                <Label uppercase>Mô tả / lý do</Label>
                <Input
                  value={l.description ?? ""}
                  onChange={(e) =>
                    patch(l.key, { description: e.target.value || null })
                  }
                  disabled={readonly}
                  className="h-9"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {!readonly ? (
        <Button variant="outline" size="sm" onClick={add}>
          + Thêm thay đổi
        </Button>
      ) : null}
    </div>
  );
}
