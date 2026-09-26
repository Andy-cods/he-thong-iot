import { Breadcrumb } from "@/components/ui/breadcrumb";
import { QcPendingView } from "@/components/warehouse/QcPendingView";

export const dynamic = "force-dynamic";

/**
 * V4.1 Đợt 1a — `/qc-inbound` — màn "QC nhập kho" cho Tổ QC.
 *
 * Cùng nội dung với tab Kho › Nhập/Xuất kho › Chờ QC (`QcPendingView`), tách
 * trang riêng vì role qc không vào được /warehouse. Guard layout:
 * admin · qc · warehouse (khớp `read:qcInspection`).
 */
export default function QcInboundPage() {
  return (
    <div className="flex flex-col md:h-full md:overflow-hidden">
      <div className="border-b border-zinc-200 bg-white px-4 pb-3 pt-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <Breadcrumb
          items={[
            { label: "Tổng quan", href: "/" },
            { label: "QC nhập kho" },
          ]}
        />
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          QC nhập kho
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Kiểm hàng vừa nhận: Đạt → hàng sẵn sàng xuất; Không đạt → giữ lô và báo Kho + Thu mua.
        </p>
      </div>
      <div className="flex-1 bg-zinc-50/30 dark:bg-zinc-950/30 md:min-h-0 md:overflow-auto">
        <QcPendingView />
      </div>
    </div>
  );
}
