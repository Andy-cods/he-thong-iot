"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { downloadFromUrl } from "@/lib/download";

/**
 * V3.14 — Nút "Xuất Excel" dùng chung cho material-requests + purchase-requests.
 * Mở dialog chọn khoảng ngày (Từ/Đến) + preset nhanh, gọi
 * `/api/{module}/export-excel?from=..&to=..` và tải file .xlsx (1 sheet Tổng
 * hợp + mỗi phiếu 1 sheet chi tiết).
 */
export interface ExportExcelDialogProps {
  module: "material-requests" | "purchase-requests";
  /** Chỉ áp dụng cho material-requests (không có khái niệm mine/all ở PR). */
  scope?: "mine" | "all";
  defaultFrom: string;
  defaultTo: string;
}

function todayStr(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function firstDayOfThisMonth(): string {
  const t = todayStr();
  return `${t.slice(0, 7)}-01`;
}

const MODULE_LABEL: Record<ExportExcelDialogProps["module"], string> = {
  "material-requests": "YeuCauVatTu",
  "purchase-requests": "DeXuatVatTu",
};

export function ExportExcelDialog({
  module,
  scope,
  defaultFrom,
  defaultTo,
}: ExportExcelDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);
  const [loading, setLoading] = React.useState(false);

  // Đồng bộ lại giá trị mặc định mỗi lần mở dialog (theo cấp drill-down hiện tại).
  React.useEffect(() => {
    if (open) {
      setFrom(defaultFrom || todayStr());
      setTo(defaultTo || todayStr());
    }
  }, [open, defaultFrom, defaultTo]);

  const invalid = !from || !to || from > to;

  async function handleDownload() {
    if (invalid) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ from, to });
      if (module === "material-requests" && scope === "mine") {
        p.set("mine", "1");
      }
      const url = `/api/${module}/export-excel?${p}`;
      const fallback = `${MODULE_LABEL[module]}_${from}_den_${to}.xlsx`;
      await downloadFromUrl(url, fallback);
      toast.success("Đã tải file Excel.");
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message || "Không tải được file Excel.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Xuất Excel</span>
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Xuất Excel theo khoảng thời gian</DialogTitle>
          <DialogDescription>
            Mỗi phiếu trong khoảng đã chọn sẽ là 1 sheet riêng, kèm sheet tổng hợp.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const t = todayStr();
              setFrom(t);
              setTo(t);
            }}
          >
            Hôm nay
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom(firstDayOfThisMonth());
              setTo(todayStr());
            }}
          >
            Tháng này
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:gap-2">
          <label className="flex-1 space-y-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Từ ngày</span>
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="flex-1 space-y-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Đến ngày</span>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
        </div>

        {invalid && from && to && (
          <p className="text-sm text-red-600 dark:text-red-400">
            &quot;Từ ngày&quot; phải nhỏ hơn hoặc bằng &quot;Đến ngày&quot;.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
            Huỷ
          </Button>
          <Button onClick={() => void handleDownload()} disabled={invalid || loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang tải…
              </>
            ) : (
              "Tải Excel"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
