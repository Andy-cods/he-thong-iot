import Link from "next/link";
import { History, ScanLine, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "PWA — Trạm nhận hàng",
};

/**
 * V2 /pwa — landing home mobile/tablet.
 * Grid 1-col mobile, 2-col tablet (sm:grid-cols-2) quick actions.
 * Card h-auto padding 16 border zinc-200 rounded-md hover bg-zinc-50.
 * V1.1 sẽ list PO pending thực tế.
 */
export default function PwaHomePage() {
  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Trạm nhận hàng
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Chọn tác vụ để bắt đầu. V1.1 sẽ hiện danh sách PO chờ thực tế.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/pwa/receive/demo"
          className="group flex flex-col gap-3 rounded-md border border-zinc-200 bg-white p-4 transition-colors hover:border-blue-500 hover:bg-blue-50/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <Truck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-md font-semibold text-zinc-900">
              Nhận hàng (PO demo)
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Quét barcode → nhập qty/lot/QC → ghi hàng đợi offline.
            </p>
          </div>
          <span className="mt-auto text-xs font-medium text-blue-600 group-hover:text-blue-700">
            Mở →
          </span>
        </Link>

        <div className="flex flex-col gap-3 rounded-md border border-dashed border-zinc-300 bg-zinc-50/50 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-zinc-100 text-zinc-500">
            <History className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-md font-semibold text-zinc-700">
              Lịch sử scan
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Xem 50 scan gần nhất + filter theo PO. Có ở V1.1.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled
            className="mt-auto self-start"
          >
            <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
            V1.1
          </Button>
        </div>
      </div>
    </div>
  );
}
