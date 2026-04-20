"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { UniverSpreadsheetLazy } from "@/components/bom-grid/UniverSpreadsheetLazy";
import type {
  UniverSpreadsheetHandle,
  UniverWorkbookSnapshot,
} from "@/components/bom-grid/UniverSpreadsheet";
import {
  AddItemDialog,
  type MasterItem,
} from "@/components/bom-grid/AddItemDialog";
import { buildZ502653Workbook } from "@/lib/bom-grid/build-workbook";

/**
 * V1.5 Trụ cột 2 POC — /playground/univer
 *
 * BOM Grid kiểu Excel với 11 cột: Ảnh · Mã · Tên · Loại · Vật liệu · NCC ·
 * SL/bộ · Kích thước · Tổng SL (formula) · Hao hụt % · Ghi chú.
 *
 * Tính năng:
 *   - Row banding + group header cho cụm lắp.
 *   - Freeze 2 hàng trên + 2 cột trái.
 *   - Cột "Loại" icon 🔧/🛒 highlight màu.
 *   - Cột "Hao hụt %" format percent.
 *   - Ctrl+Shift+A hoặc nút "+ Thêm linh kiện" → dialog picker master.
 */
export default function UniverPlaygroundPage() {
  const gridRef = React.useRef<UniverSpreadsheetHandle>(null);
  const [lastEditAt, setLastEditAt] = React.useState<Date | null>(null);
  const [snapshotSize, setSnapshotSize] = React.useState<number | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);

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

  const handleSelectItem = (item: MasterItem) => {
    gridRef.current?.insertItemRow({
      sku: item.sku,
      name: item.name,
      itemType: item.itemType,
      category: item.category,
      uom: item.uom,
    });
  };

  // Hotkey Ctrl+Shift+A → mở dialog
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        setAddOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
              BOM Grid kiểu Excel — POC
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              Dòng sản phẩm: Băng tải DIPPI · Mã Z:{" "}
              <span className="font-mono">Z0000002-502653</span> · 2 cụm lắp ·
              18 linh kiện · qty parent 2 bộ
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
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              title="Thêm linh kiện từ danh mục (Ctrl+Shift+A)"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Thêm linh kiện
              <kbd className="ml-1 hidden items-center rounded border border-white/30 bg-white/10 px-1 text-[10px] font-mono text-white/80 sm:inline-flex">
                Ctrl+Shift+A
              </kbd>
            </Button>
            <Button size="sm" variant="outline" onClick={handleManualSave}>
              Lưu snapshot
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden bg-zinc-50 p-4">
        <div className="h-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
          <UniverSpreadsheetLazy
            ref={gridRef}
            initialSnapshot={initialSnapshot}
            onEdit={handleEdit}
          />
        </div>
      </div>

      <footer className="flex h-9 items-center border-t border-zinc-200 bg-white px-4 text-xs text-zinc-500">
        <Search className="mr-1.5 h-3 w-3" aria-hidden />
        <span>
          Tip: Ctrl+Z hoàn tác · Ctrl+C / Ctrl+V copy sang Excel · Click đôi ô
          để sửa · Công thức "Tổng SL" = SL/bộ × qty parent · 🔧 = Gia công,
          🛒 = Thương mại.
        </span>
      </footer>

      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSelect={handleSelectItem}
      />
    </div>
  );
}
