"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Cloud, CloudOff, History, Loader2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
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
import {
  useBomDetail,
  useBomTree,
  useBomGrid,
  useSaveBomGrid,
  useActivityLog,
} from "@/hooks/useBom";
import { buildWorkbookFromTemplate } from "@/lib/bom-grid/build-workbook";

/**
 * V1.5 Trụ cột 2 — Production BOM Grid Editor.
 *
 * - Load snapshot từ API (metadata.univerSnapshot).
 * - Fallback: build từ bomLines tree nếu chưa có snapshot.
 * - Auto-save debounce 2s sau mỗi lần edit.
 * - AddItemDialog: thêm linh kiện từ master (Ctrl+Shift+A).
 */
export default function BomGridPage() {
  const { id } = useParams<{ id: string }>();

  const detailQuery = useBomDetail(id);
  const gridQuery = useBomGrid(id);
  const treeQuery = useBomTree(id);
  const saveMutation = useSaveBomGrid(id);

  const activityLogQuery = useActivityLog("bom_template", id, !!id);

  const gridRef = React.useRef<UniverSpreadsheetHandle>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const autoSaveTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  // Client-side snapshot undo stack (last 5 saves)
  const undoStack = React.useRef<UniverWorkbookSnapshot[]>([]);
  const [canUndo, setCanUndo] = React.useState(false);

  const template = detailQuery.data?.data?.template;
  const tree = treeQuery.data?.data?.tree ?? [];

  // Xây initial snapshot — ưu tiên snapshot đã lưu, fallback build từ tree
  const initialSnapshot = React.useMemo(() => {
    if (!gridQuery.data || !template) return undefined;
    if (gridQuery.data.data) return gridQuery.data.data;
    if (tree.length > 0) {
      return buildWorkbookFromTemplate(
        { id: template.id, code: template.code, name: template.name, targetQty: template.targetQty },
        tree,
      );
    }
    // BOM rỗng — workbook trống
    return {
      id: `bom-${id}`,
      name: template.code,
      appVersion: "0.21.0",
      locale: "viVN",
    };
  }, [gridQuery.data, template, tree, id]);

  const handleEdit = React.useCallback(
    (snap: UniverWorkbookSnapshot) => {
      // Debounce 2s auto-save
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        setIsSaving(true);
        // Capture previous snapshot for undo before overwriting
        const currentSnap = gridRef.current?.save();
        if (currentSnap) {
          undoStack.current = [currentSnap, ...undoStack.current].slice(0, 5);
          setCanUndo(undoStack.current.length > 0);
        }
        saveMutation
          .mutateAsync(snap)
          .then(() => {
            setLastSavedAt(new Date());
          })
          .catch(() => {
            toast.error("Auto-save thất bại — kiểm tra kết nối.");
          })
          .finally(() => setIsSaving(false));
      }, 2000);
    },
    [saveMutation],
  );

  const handleUndo = React.useCallback(() => {
    const prev = undoStack.current.shift();
    setCanUndo(undoStack.current.length > 0);
    if (!prev) return;
    setIsSaving(true);
    saveMutation
      .mutateAsync(prev)
      .then(() => {
        setLastSavedAt(new Date());
        toast.success("Đã hoàn tác về phiên bản trước.");
      })
      .catch(() => toast.error("Hoàn tác thất bại."))
      .finally(() => setIsSaving(false));
  }, [saveMutation]);

  const handleManualSave = () => {
    const snap = gridRef.current?.save();
    if (!snap) return;
    setIsSaving(true);
    saveMutation
      .mutateAsync(snap)
      .then(() => {
        setLastSavedAt(new Date());
        toast.success("Đã lưu BOM Grid.");
      })
      .catch(() => {
        toast.error("Lưu thất bại — thử lại sau.");
      })
      .finally(() => setIsSaving(false));
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

  // Hotkey Ctrl+Shift+A
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

  const isLoading =
    detailQuery.isLoading || gridQuery.isLoading || treeQuery.isLoading;

  const isObsolete = template?.status === "OBSOLETE";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <Breadcrumb
          items={[
            { label: "BOM Templates", href: "/bom" },
            {
              label: template?.code ?? "...",
              href: `/bom/${id}`,
            },
            { label: "Grid Editor" },
          ]}
        />
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              {template?.name ?? (
                <span className="animate-pulse text-zinc-400">Đang tải…</span>
              )}
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              Mã:{" "}
              <span className="font-mono font-medium text-zinc-700">
                {template?.code ?? "—"}
              </span>
              {template?.parentItemSku ? (
                <>
                  {" · "}
                  <span className="font-mono">{template.parentItemSku}</span>
                </>
              ) : null}
              {" · "}
              <span>
                Qty parent:{" "}
                <span className="tabular-nums">{template?.targetQty ?? "—"}</span>
              </span>
              {isObsolete && (
                <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                  Ngừng dùng
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Save status indicator */}
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Đang lưu…
                </>
              ) : lastSavedAt ? (
                <>
                  <Cloud className="h-3 w-3 text-emerald-500" />
                  {lastSavedAt.toLocaleTimeString("vi-VN")}
                </>
              ) : (
                <>
                  <CloudOff className="h-3 w-3 text-zinc-400" />
                  Chưa lưu
                </>
              )}
            </span>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setHistoryOpen((o) => !o)}
              title="Lịch sử lưu"
            >
              <History className="h-3.5 w-3.5" aria-hidden />
              Lịch sử
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleUndo}
              disabled={!canUndo || isObsolete || isSaving}
              title="Hoàn tác về phiên lưu trước (client-side)"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Hoàn tác
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddOpen(true)}
              disabled={isObsolete}
              title="Thêm linh kiện từ danh mục (Ctrl+Shift+A)"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Thêm linh kiện
              <kbd className="ml-1 hidden items-center rounded border border-zinc-200 bg-zinc-50 px-1 text-[10px] font-mono text-zinc-500 sm:inline-flex">
                Ctrl+Shift+A
              </kbd>
            </Button>

            <Button
              size="sm"
              onClick={handleManualSave}
              disabled={isObsolete || isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Lưu Grid
            </Button>

            <Button asChild size="sm" variant="ghost">
              <Link href={`/bom/${id}`}>
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Quay lại
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden bg-zinc-50">
        <div className="flex-1 overflow-hidden p-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center rounded-md border border-zinc-200 bg-white text-sm text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Đang tải BOM…
            </div>
          ) : (
            <div className="h-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
              {initialSnapshot ? (
                <UniverSpreadsheetLazy
                  ref={gridRef}
                  key={id}
                  initialSnapshot={initialSnapshot}
                  onEdit={isObsolete ? undefined : handleEdit}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                  Không tải được dữ liệu BOM.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Activity log side panel */}
        {historyOpen && (
          <aside className="w-64 shrink-0 overflow-y-auto border-l border-zinc-200 bg-white p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Lịch sử lưu
            </h3>
            {activityLogQuery.isLoading ? (
              <p className="text-xs text-zinc-400">Đang tải…</p>
            ) : (activityLogQuery.data?.data.length ?? 0) === 0 ? (
              <p className="text-xs text-zinc-400">Chưa có lịch sử lưu.</p>
            ) : (
              <ol className="space-y-2">
                {activityLogQuery.data?.data.map((entry) => (
                  <li key={entry.id} className="rounded border border-zinc-100 p-2 text-xs">
                    <p className="font-medium text-zinc-700">
                      {entry.action === "GRID_SAVE" ? "Lưu Grid" : entry.action}
                    </p>
                    <p className="mt-0.5 text-zinc-400">
                      {new Date(entry.at).toLocaleString("vi-VN")}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        )}
      </div>

      <footer className="flex h-9 items-center border-t border-zinc-200 bg-white px-4 text-xs text-zinc-500">
        Tip: Ctrl+Z hoàn tác · Ctrl+C / Ctrl+V copy sang Excel · Click đôi ô để
        sửa · Công thức "Tổng SL" = SL/bộ × qty parent · 🔧 = Gia công, 🛒 =
        Thương mại
      </footer>

      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSelect={handleSelectItem}
      />
    </div>
  );
}
