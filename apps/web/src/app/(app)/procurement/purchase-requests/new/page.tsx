"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PRForm } from "@/components/procurement/PRForm";
import {
  useCreatePurchaseRequest,
  useCreatePRFromShortage,
} from "@/hooks/usePurchaseRequests";

/**
 * /procurement/purchase-requests/new — 2 mode:
 * 1. Thủ công: user thêm từng dòng
 * 2. Từ shortage (?fromShortage=id1,id2): auto create via endpoint from-shortage.
 */
export default function NewPurchaseRequestPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 text-sm text-zinc-500">Đang tải…</div>
      }
    >
      <NewPRInner />
    </React.Suspense>
  );
}

function NewPRInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const fromShortage = sp.get("fromShortage");
  const itemIds = React.useMemo(
    () => (fromShortage ? fromShortage.split(",").filter(Boolean) : []),
    [fromShortage],
  );

  const createManual = useCreatePurchaseRequest();
  const createFromShortage = useCreatePRFromShortage();
  const [submitting, setSubmitting] = React.useState(false);

  // Auto trigger từ shortage khi có itemIds (không cần form)
  const handleShortageCreate = async () => {
    if (itemIds.length === 0) return;
    setSubmitting(true);
    try {
      const res = await createFromShortage.mutateAsync({
        itemIds,
        title: `PR từ Shortage ${new Date().toLocaleDateString("vi-VN")}`,
        notes: null,
      });
      toast.success(`Đã tạo PR ${res.data.code}`);
      router.push(`/procurement/purchase-requests/${res.data.id}`);
    } catch (err) {
      toast.error(`Tạo PR thất bại: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
            <Link
              href="/procurement/purchase-requests"
              className="hover:text-zinc-900 hover:underline"
            >
              Yêu cầu mua hàng
            </Link>
            {" / "}
            <span className="text-zinc-900">Tạo mới</span>
          </nav>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Tạo PR {itemIds.length > 0 ? `từ Shortage (${itemIds.length} item)` : "thủ công"}
          </h1>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl p-6">
        {itemIds.length > 0 ? (
          <div className="space-y-4 rounded-md border border-orange-200 bg-orange-50 p-5">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">
                Tạo PR tự động từ Shortage Board
              </h2>
              <p className="mt-1 text-sm text-zinc-700">
                Hệ thống sẽ aggregate shortage cho {itemIds.length} item đã chọn,
                qty = total_short × 1.1 (buffer 10%), status DRAFT để review.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => void handleShortageCreate()}
                disabled={submitting}
              >
                {submitting ? "Đang tạo…" : "Tạo PR tự động"}
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/bom">Huỷ, quay lại BOM workspace</Link>
              </Button>
            </div>
          </div>
        ) : (
          <PRForm
            onSubmit={async (data) => {
              try {
                const res = await createManual.mutateAsync(data);
                toast.success(`Đã tạo PR ${res.data.code}`);
                router.push(`/procurement/purchase-requests/${res.data.id}`);
              } catch (err) {
                toast.error(`Tạo PR thất bại: ${(err as Error).message}`);
              }
            }}
            loading={createManual.isPending}
          />
        )}
      </div>
    </div>
  );
}
