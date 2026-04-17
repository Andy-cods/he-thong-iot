import { ReceivingConsole, type POLine } from "@/components/receiving/ReceivingConsole";

export const metadata = {
  title: "Nhận hàng PO — PWA",
};

/**
 * /pwa/receive/[poId]
 *
 * RSC fetch PO info.
 * TODO V1.1: thay stub bằng fetch `/api/receiving/po/:poId`. Hiện cook
 * dữ liệu giả để demo end-to-end flow: scan → queue → sync.
 */
export default function ReceivePoPage({
  params,
}: {
  params: { poId: string };
}) {
  // Stub data — replicate từ brainstorm-deep §2.5 (3 dòng, 1 lot-tracked).
  const lines: POLine[] = [
    {
      id: "line-1",
      sku: "RM-STEEL-C45",
      name: "Thép tròn C45 phi 30",
      orderedQty: 50,
      uom: "KG",
      trackingMode: "lot",
    },
    {
      id: "line-2",
      sku: "FAB-BOLT-M8",
      name: "Bu lông M8 mạ kẽm",
      orderedQty: 200,
      uom: "PCS",
      trackingMode: "none",
    },
    {
      id: "line-3",
      sku: "CON-OIL-ISO46",
      name: "Dầu thuỷ lực ISO 46",
      orderedQty: 10,
      uom: "L",
      trackingMode: "lot",
    },
  ];

  return (
    <ReceivingConsole
      poId={params.poId}
      poCode={params.poId === "demo" ? "PO-DEMO-001" : params.poId}
      supplierName="Công ty TNHH Thép Việt"
      expectedDate="17/04/2026"
      lines={lines}
    />
  );
}
