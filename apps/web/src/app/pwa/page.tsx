import Link from "next/link";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = {
  title: "PWA — Trạm nhận hàng",
};

/**
 * /pwa — landing mini. V1.0 chỉ có quick link vào demo receiving.
 * V1.1 sẽ list PO pending thực tế.
 */
export default function PwaHomePage() {
  return (
    <div className="p-4">
      <EmptyState
        preset="empty-success"
        illustration={
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <Truck className="h-10 w-10" strokeWidth={1.5} aria-hidden />
          </div>
        }
        title="Trạm nhận hàng"
        description="Chọn một PO để bắt đầu quét và xác nhận nhận kho. (V1.1 sẽ list PO pending thực tế.)"
        actions={
          <Button asChild>
            <Link href="/pwa/receive/demo">Mở demo PO</Link>
          </Button>
        }
      />
    </div>
  );
}
