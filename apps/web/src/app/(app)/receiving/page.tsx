import Link from "next/link";
import { ExternalLink, Package, Smartphone, Truck } from "lucide-react";

export const metadata = {
  title: "Nhận hàng — Xưởng IoT",
};

export const dynamic = "force-dynamic";

/**
 * V1.1-alpha fix — Receiving hub trong (app) main layout.
 *
 * User bấm "Nhận hàng" ở sidebar chính → landing page chọn PO để vào nhận.
 * V1.1-alpha chỉ có 3 PO demo stub; module PO đầy đủ + list real PO sẽ có ở V1.2.
 *
 * Mỗi PO có 2 entry:
 *   - "Mở" → /pwa/receive/{poId} (PWA tablet mode)
 *   - Nhắc thông tin demo banner + link.
 */

interface DemoPO {
  poId: string;
  poCode: string;
  supplierName: string;
  expectedDate: string;
  lineCount: number;
  description: string;
}

const DEMO_POS: DemoPO[] = [
  {
    poId: "demo",
    poCode: "PO-DEMO-001",
    supplierName: "NCC Demo",
    expectedDate: "2026-04-20",
    lineCount: 3,
    description: "Thép C45, bu lông M8, dầu ISO 46",
  },
  {
    poId: "demo-small",
    poCode: "PO-DEMO-SMALL",
    supplierName: "NCC Demo Small",
    expectedDate: "2026-04-20",
    lineCount: 1,
    description: "Chỉ 1 line — kịch bản đơn giản",
  },
  {
    poId: "demo-large",
    poCode: "PO-DEMO-LARGE",
    supplierName: "NCC Demo Large",
    expectedDate: "2026-04-25",
    lineCount: 8,
    description: "8 line — kịch bản PO lớn",
  },
];

export default function ReceivingHubPage() {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
          <Truck className="h-5 w-5 text-zinc-500" aria-hidden="true" />
          Nhận hàng
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Chọn đơn mua (PO) để vào màn nhận hàng · V1.1-alpha chỉ có PO demo stub,
          module PO đầy đủ sẽ có ở V1.2.
        </p>
      </section>

      <section
        aria-label="Danh sách PO demo"
        className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
      >
        {DEMO_POS.map((po) => (
          <article
            key={po.poId}
            className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300"
          >
            <header>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                <span className="font-mono text-sm font-semibold text-zinc-900">
                  {po.poCode}
                </span>
              </div>
              <p className="mt-1 text-base font-medium text-zinc-900">
                {po.supplierName}
              </p>
              <p className="text-xs text-zinc-500">
                Dự kiến giao: {po.expectedDate} · {po.lineCount} dòng
              </p>
            </header>
            <p className="text-sm text-zinc-600">{po.description}</p>
            <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
              <Link
                href={`/pwa/receive/${po.poId}`}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
              >
                <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                Mở màn nhận hàng (PWA)
              </Link>
              <Link
                href={`/pwa/receive/${po.poId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                Mở tab mới (tablet)
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <h2 className="font-semibold">Mẹo dùng trên tablet</h2>
        <p className="mt-1 text-xs text-blue-800">
          Operator có thể mở trực tiếp URL{" "}
          <code className="rounded bg-white/60 px-1 font-mono text-xs">
            /pwa/receive/&lt;poId&gt;
          </code>{" "}
          trên tablet (fullscreen PWA layout, minimal chrome).
        </p>
      </section>
    </div>
  );
}
