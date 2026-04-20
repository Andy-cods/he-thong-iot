"use client";

import * as React from "react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { UniverSpreadsheetLazy } from "@/components/bom-grid/UniverSpreadsheetLazy";
import type {
  UniverSpreadsheetHandle,
  UniverWorkbookSnapshot,
} from "@/components/bom-grid/UniverSpreadsheet";
import { buildZ502653Workbook } from "@/lib/bom-grid/build-workbook";

/**
 * V1.5 Trụ cột 2 POC — /playground/univer
 *
 * Trang demo Univer spreadsheet với BOM mẫu Z0000002-502653.
 * Mục tiêu POC (plans/bom-core-redesign/02-bom-grid-univer.md §3):
 *   - Render <2s ở cache cold.
 *   - Edit cell → onEdit fire.
 *   - Copy range 3x5 → paste vào Excel thật giữ đúng text.
 *
 * Sẽ xoá/move về `/bom/[code]` sau khi pass POC.
 */
export default function UniverPlaygroundPage() {
  const gridRef = React.useRef<UniverSpreadsheetHandle>(null);
  const [lastEditAt, setLastEditAt] = React.useState<Date | null>(null);
  const [snapshotSize, setSnapshotSize] = React.useState<number | null>(null);

  const initialSnapshot = React.useMemo(() => buildZ502653Workbook(), []);

  const handleEdit = React.useCallback((snap: UniverWorkbookSnapshot) => {
    setLastEditAt(new Date());
    setSnapshotSize(JSON.stringify(snap).length);
  }, []);

  const handleManualSave = () => {
    const snap = gridRef.current?.save();
    if (!snap) return;
    const json = JSON.stringify(snap, null, 2);
    setSnapshotSize(json.length);
    // eslint-disable-next-line no-console
    console.log("[Univer POC] snapshot:", snap);
    alert(`Snapshot ~${Math.round(json.length / 1024)} KB — xem console.`);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <Breadcrumb
          items={[
            { label: "Tổng quan", href: "/" },
            { label: "Thử nghiệm Univer" },
          ]}
        />
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              POC — Bảng tính BOM kiểu Excel (Univer)
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              Dòng sản phẩm: Băng tải DIPPI · Mã Z:{" "}
              <span className="font-mono">Z0000002-502653</span> · Số lượng
              parent: 2 bộ · 18 linh kiện mẫu
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastEditAt ? (
              <span className="text-xs text-zinc-500">
                Lần sửa gần nhất:{" "}
                <span className="tabular-nums text-zinc-700">
                  {lastEditAt.toLocaleTimeString("vi-VN")}
                </span>
                {snapshotSize != null ? (
                  <>
                    {" · "}
                    <span className="tabular-nums">
                      {Math.round(snapshotSize / 1024)} KB
                    </span>
                  </>
                ) : null}
              </span>
            ) : (
              <span className="text-xs text-zinc-400">Chưa sửa</span>
            )}
            <Button size="sm" variant="outline" onClick={handleManualSave}>
              Lưu snapshot (xem console)
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden bg-zinc-50 p-4">
        <div className="h-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
          <UniverSpreadsheetLazy
            initialSnapshot={initialSnapshot}
            onEdit={handleEdit}
          />
        </div>
      </div>

      <footer className="flex h-9 items-center border-t border-zinc-200 bg-white px-4 text-xs text-zinc-500">
        <span>
          Tip: Ctrl+Z hoàn tác · Ctrl+C / Ctrl+V để copy sang Excel · Click đôi
          vào ô để sửa. Công thức cột "Tổng SL" = SL/bộ × qty parent.
        </span>
      </footer>
    </div>
  );
}
