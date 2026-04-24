"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, ExternalLink, Keyboard, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarcodeScanner } from "@/components/scan/BarcodeScanner";
import { cn } from "@/lib/utils";

/**
 * V1.8 Batch 7 — Dialog quét barcode tìm linh kiện trong BOM hiện tại.
 *
 * Flow:
 *   1. User scan/gõ barcode.
 *   2. GET /api/items/by-barcode/[code] → tìm item.
 *   3. Nếu không tìm thấy item → toast "Không tìm thấy linh kiện".
 *   4. GET /api/items/[itemId]/bom-usages → filter template hiện tại.
 *   5. Nếu line thuộc BOM hiện tại → navigate /bom/[id]/grid?highlightLine=<id>
 *      (reuse deep-link Batch 3) rồi đóng dialog.
 *   6. Nếu item có trong BOM khác → toast + link "Xem trong BOM khác".
 *
 * 2 tabs:
 *   - Camera: reuse `<BarcodeScanner>` (html5-qrcode + USB wedge + manual).
 *   - Nhập thủ công: Input đơn giản cho user gõ tay nhanh (không cần camera).
 */

export interface BomBarcodeSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bomTemplateId: string;
  bomTemplateCode: string;
}

interface ItemLookupResult {
  itemId: string;
  sku: string;
  name: string;
  type: string;
  uom: string;
  status: string;
  barcode: string | null;
}

interface BomUsageLine {
  lineId: string;
  quantityPer: number;
  scrapPct: number;
  metadata: unknown;
  childCount: number;
  parentItemId: string | null;
}

interface BomUsageTemplate {
  templateId: string;
  templateCode: string;
  templateName: string;
  templateStatus: "DRAFT" | "ACTIVE" | "OBSOLETE";
  usages: BomUsageLine[];
}

interface BomUsagesResponse {
  itemId: string;
  totalUsages: number;
  byTemplate: BomUsageTemplate[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function BomBarcodeSearchDialog({
  open,
  onOpenChange,
  bomTemplateId,
  bomTemplateCode,
}: BomBarcodeSearchDialogProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"camera" | "manual">("camera");
  const [manualInput, setManualInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<{
    code: string;
    status: "not-found" | "other-bom" | "matched";
    message: string;
    otherTemplate?: {
      templateId: string;
      templateCode: string;
      lineId: string;
    };
  } | null>(null);

  // Reset khi đóng dialog
  React.useEffect(() => {
    if (!open) {
      setManualInput("");
      setLastResult(null);
      setBusy(false);
    }
  }, [open]);

  const processCode = React.useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code || busy) return;
      setBusy(true);
      setLastResult(null);
      try {
        // 1. Lookup item
        const lookup = await fetchJson<{ data: ItemLookupResult | null }>(
          `/api/items/by-barcode/${encodeURIComponent(code)}`,
        );
        const item = lookup.data;
        if (!item) {
          setLastResult({
            code,
            status: "not-found",
            message: `Không tìm thấy linh kiện với barcode ${code}.`,
          });
          toast.error(`Không tìm thấy linh kiện với barcode ${code}`);
          return;
        }

        // 2. Lookup BOM usages của item
        const usages = await fetchJson<{ data: BomUsagesResponse }>(
          `/api/items/${item.itemId}/bom-usages`,
        );
        const matching = usages.data.byTemplate.find(
          (t) => t.templateId === bomTemplateId,
        );

        if (matching && matching.usages.length > 0) {
          // Thuộc BOM hiện tại → navigate highlight line đầu tiên
          const lineId = matching.usages[0]!.lineId;
          setLastResult({
            code,
            status: "matched",
            message: `Đã tìm thấy ${item.sku} — ${item.name}`,
          });
          toast.success(`Đã tìm thấy ${item.sku} trong BOM ${bomTemplateCode}`);
          // Dùng URL hiện tại để đảm bảo giữ path grid
          router.replace(
            `/bom/${bomTemplateId}/grid?highlightLine=${encodeURIComponent(lineId)}`,
          );
          // Close sau tick để toast kịp hiển thị
          window.setTimeout(() => onOpenChange(false), 200);
          return;
        }

        // 3. Item không trong BOM hiện tại
        const other = usages.data.byTemplate[0];
        if (other && other.usages[0]) {
          setLastResult({
            code,
            status: "other-bom",
            message: `Linh kiện ${item.sku} không thuộc BOM ${bomTemplateCode}.`,
            otherTemplate: {
              templateId: other.templateId,
              templateCode: other.templateCode,
              lineId: other.usages[0].lineId,
            },
          });
          toast.warning(
            `Linh kiện ${item.sku} không thuộc BOM ${bomTemplateCode}`,
          );
          return;
        }

        // 4. Item tồn tại nhưng chưa dùng ở BOM nào
        setLastResult({
          code,
          status: "other-bom",
          message: `Linh kiện ${item.sku} chưa được dùng trong bất kỳ BOM nào.`,
        });
        toast.warning(`${item.sku} chưa thuộc BOM nào`);
      } catch (err) {
        const msg = (err as Error).message ?? "Lỗi không xác định";
        toast.error(`Quét thất bại: ${msg}`);
        setLastResult({
          code,
          status: "not-found",
          message: `Lỗi: ${msg}`,
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, bomTemplateCode, bomTemplateId, onOpenChange, router],
  );

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = manualInput.trim();
    if (!v) return;
    void processCode(v);
    setManualInput("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Quét barcode tìm linh kiện trong BOM</DialogTitle>
          <DialogDescription>
            Quét hoặc gõ barcode để định vị dòng linh kiện trong BOM{" "}
            <span className="font-mono font-medium text-zinc-700">
              {bomTemplateCode}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "camera" | "manual")}
          className="w-full"
        >
          <TabsList>
            <TabsTrigger value="camera">
              <Camera className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Camera / USB scanner
            </TabsTrigger>
            <TabsTrigger value="manual">
              <Keyboard className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Nhập thủ công
            </TabsTrigger>
          </TabsList>

          <TabsContent value="camera" className="mt-3">
            <BarcodeScanner
              onDetect={(code) => void processCode(code)}
              disabled={busy}
              liveRegionLabel="Kết quả quét BOM"
            />
          </TabsContent>

          <TabsContent value="manual" className="mt-3">
            <form
              onSubmit={handleManualSubmit}
              className="flex items-end gap-2 rounded-md border border-zinc-200 bg-white p-4"
            >
              <div className="flex-1">
                <label
                  htmlFor="bom-barcode-manual"
                  className="mb-1 block text-xs font-medium text-zinc-600"
                >
                  Mã barcode hoặc SKU
                </label>
                <Input
                  id="bom-barcode-manual"
                  autoFocus
                  autoComplete="off"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Gõ hoặc quét rồi bấm Enter"
                  disabled={busy}
                />
              </div>
              <Button
                type="submit"
                disabled={busy || manualInput.trim().length === 0}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                Tìm
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        {/* Kết quả gần nhất */}
        {lastResult ? (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              lastResult.status === "matched" &&
                "border-emerald-200 bg-emerald-50 text-emerald-800",
              lastResult.status === "other-bom" &&
                "border-amber-200 bg-amber-50 text-amber-800",
              lastResult.status === "not-found" &&
                "border-red-200 bg-red-50 text-red-800",
            )}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-[11px] text-zinc-500">
                  {lastResult.code}
                </div>
                <div className="mt-0.5 text-sm">{lastResult.message}</div>
              </div>
              {lastResult.otherTemplate ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const o = lastResult.otherTemplate!;
                    router.push(
                      `/bom/${o.templateId}/grid?highlightLine=${encodeURIComponent(
                        o.lineId,
                      )}`,
                    );
                    onOpenChange(false);
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Mở {lastResult.otherTemplate.templateCode}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {busy ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Đang tra cứu…
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
