"use client";

import * as React from "react";
import { SupplierCell } from "../SupplierCell";
import { formatNumber } from "@/lib/format";
import { lineCoef, linePics, picInitial } from "@/lib/bom-grid/line-view";
import type { BomTreeNodeRaw } from "@/hooks/useBom";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl bg-zinc-50 px-3.5 py-3 dark:bg-zinc-800/40">
      <div className="mb-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      {children}
    </div>
  );
}

/** 4 ô chỉ số nhanh: SL cần (lớn) · Hệ số · NCC (sửa trực tiếp) · PIC. */
export function LineQuickStats({
  node,
  lineId,
  templateId,
  required,
  liveVersion,
  onSupplierChanged,
}: {
  node: BomTreeNodeRaw;
  lineId: string;
  templateId: string;
  /** SL cần (từ sổ bước); null khi chưa tải. */
  required: number | null;
  liveVersion: number;
  onSupplierChanged: (n: { rowVersion: number; supplierId: string | null }) => void;
}) {
  const pics = linePics(node);
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Stat label="SL cần">
        <div className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50">
          {required != null ? formatNumber(required) : "—"}
          {node.uom ? (
            <span className="ml-1 text-[13px] font-normal text-zinc-400">{node.uom}</span>
          ) : null}
        </div>
      </Stat>
      <Stat label="Hệ số">
        <div className="text-[20px] font-semibold leading-none tabular-nums text-zinc-900 dark:text-zinc-50">
          {formatNumber(lineCoef(node))}
        </div>
      </Stat>
      <Stat label="Nhà cung cấp">
        <SupplierCell
          variant="field"
          templateId={templateId}
          lineId={lineId}
          line={node}
          rowVersion={liveVersion}
          onChanged={onSupplierChanged}
        />
      </Stat>
      <Stat label="PIC">
        {pics.length === 0 ? (
          <span className="text-[13px] text-zinc-400 dark:text-zinc-500">Chưa gán</span>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[12px] font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
            >
              {picInitial(pics[0]!)}
            </span>
            <span className="min-w-0 truncate text-[13px] font-medium text-zinc-800 dark:text-zinc-100">
              {pics[0]}
              {pics.length > 1 ? ` +${pics.length - 1}` : ""}
            </span>
          </div>
        )}
      </Stat>
    </div>
  );
}
