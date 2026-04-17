import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/po/[id] — PO stub (Option A hardcode)
 * V1.1-alpha: chưa có Order module, chỉ mock 3 scenario `demo*` để PWA test.
 * V1.2+: thay bằng data thật từ bảng purchase_order.
 */

interface POLine {
  lineNo: number;
  sku: string;
  itemName: string;
  expectedQty: number;
  uom: string;
}

interface POStub {
  poId: string;
  poCode: string;
  supplierName: string;
  expectedDate: string;
  lines: POLine[];
}

const DEMO_POS: Record<string, POStub> = {
  demo: {
    poId: "demo",
    poCode: "PO-DEMO-001",
    supplierName: "NCC Demo",
    expectedDate: "2026-04-20",
    lines: [
      {
        lineNo: 1,
        sku: "RM-THEP-C45",
        itemName: "Thép C45 tấm 10mm",
        expectedQty: 50,
        uom: "KG",
      },
      {
        lineNo: 2,
        sku: "RM-BULON-M8",
        itemName: "Bu lông M8x25",
        expectedQty: 200,
        uom: "PCS",
      },
      {
        lineNo: 3,
        sku: "RM-DAU-ISO46",
        itemName: "Dầu bôi trơn ISO 46",
        expectedQty: 10,
        uom: "L",
      },
    ],
  },
  "demo-small": {
    poId: "demo-small",
    poCode: "PO-DEMO-SMALL",
    supplierName: "NCC Demo Small",
    expectedDate: "2026-04-20",
    lines: [
      {
        lineNo: 1,
        sku: "RM-THEP-C45",
        itemName: "Thép C45 tấm 10mm",
        expectedQty: 20,
        uom: "KG",
      },
    ],
  },
  "demo-large": {
    poId: "demo-large",
    poCode: "PO-DEMO-LARGE",
    supplierName: "NCC Demo Large",
    expectedDate: "2026-04-25",
    lines: [
      { lineNo: 1, sku: "RM-THEP-C45", itemName: "Thép C45 tấm 10mm", expectedQty: 200, uom: "KG" },
      { lineNo: 2, sku: "RM-THEP-S50C", itemName: "Thép S50C 20mm", expectedQty: 150, uom: "KG" },
      { lineNo: 3, sku: "RM-BULON-M8", itemName: "Bu lông M8x25", expectedQty: 500, uom: "PCS" },
      { lineNo: 4, sku: "RM-BULON-M10", itemName: "Bu lông M10x30", expectedQty: 300, uom: "PCS" },
      { lineNo: 5, sku: "RM-DAU-ISO46", itemName: "Dầu bôi trơn ISO 46", expectedQty: 30, uom: "L" },
      { lineNo: 6, sku: "RM-DAU-ISO68", itemName: "Dầu bôi trơn ISO 68", expectedQty: 20, uom: "L" },
      { lineNo: 7, sku: "RM-BANH-RANG-M2", itemName: "Bánh răng M2", expectedQty: 50, uom: "PCS" },
      { lineNo: 8, sku: "RM-VONG-BI-6205", itemName: "Vòng bi 6205", expectedQty: 80, uom: "PCS" },
    ],
  },
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "warehouse", "planner");
  if ("response" in guard) return guard.response;

  const id = params.id.toLowerCase();
  if (id.startsWith("demo")) {
    const po = DEMO_POS[id] ?? DEMO_POS.demo;
    return NextResponse.json({ data: po });
  }

  return jsonError(
    "PO_NOT_FOUND",
    "PO chưa được hỗ trợ — V1.1-alpha chỉ có demo stub. Tính năng PO đầy đủ sẽ có ở V1.2.",
    404,
  );
}
