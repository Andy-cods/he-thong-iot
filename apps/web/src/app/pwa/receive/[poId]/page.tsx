import Link from "next/link";
import { cookies, headers } from "next/headers";
import { AlertTriangle, Package } from "lucide-react";
import {
  ReceivingConsole,
  type POLine,
} from "@/components/receiving/ReceivingConsole";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

export const metadata = {
  title: "Nhận hàng PO — PWA",
};

export const dynamic = "force-dynamic";

/**
 * /pwa/receive/[poId]
 *
 * Phase B2.7: fetch real PO qua /api/po/[id] (V1.1-alpha demo stub).
 * - Demo prefix `demo*` → banner "Đang dùng dữ liệu demo"
 * - PO không tồn tại → friendly error page + link back
 *
 * Map API shape → ReceivingConsole POLine:
 *   API: { lineNo, sku, itemName, expectedQty, uom }
 *   PWA: { id: "line-<lineNo>", sku, name, orderedQty, uom, trackingMode }
 */

interface POLineAPI {
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
  lines: POLineAPI[];
}

async function fetchPO(
  poId: string,
  cookie: string,
): Promise<{ ok: true; po: POStub } | { ok: false; status: number; message: string }> {
  try {
    const h = headers();
    const host = h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? "http";
    const url = `${proto}://${host}/api/po/${encodeURIComponent(poId)}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { cookie },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      return {
        ok: false,
        status: res.status,
        message: body.error?.message ?? `HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as { data: POStub };
    return { ok: true, po: json.data };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      message: (err as Error).message,
    };
  }
}

export default async function ReceivePoPage({
  params,
}: {
  params: { poId: string };
}) {
  const cookieStore = cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME);
  const cookieHeader = authCookie ? `${authCookie.name}=${authCookie.value}` : "";

  const result = await fetchPO(params.poId, cookieHeader);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-md p-6 pt-24 text-center">
        <AlertTriangle
          className="mx-auto h-10 w-10 text-amber-500"
          aria-hidden="true"
        />
        <h1 className="mt-4 text-lg font-semibold text-zinc-900">
          PO không khả dụng
        </h1>
        <p className="mt-1 text-sm text-zinc-600">{result.message}</p>
        <p className="mt-3 text-xs text-zinc-500">
          V1.1-alpha chỉ hỗ trợ các mã demo: <code>demo</code>,{" "}
          <code>demo-small</code>, <code>demo-large</code>. Module PO đầy đủ sẽ
          có ở V1.2.
        </p>
        <Link
          href="/pwa/receive/demo"
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
        >
          <Package className="h-3.5 w-3.5" aria-hidden="true" />
          Dùng PO demo
        </Link>
      </div>
    );
  }

  const isDemo = params.poId.toLowerCase().startsWith("demo");

  // Map API shape → PWA POLine
  const lines: POLine[] = result.po.lines.map((l) => ({
    id: `line-${l.lineNo}`,
    sku: l.sku,
    name: l.itemName,
    orderedQty: l.expectedQty,
    uom: l.uom,
    // V1.1-alpha: tracking mode chưa có trong API stub — default "none".
    // V1.2+: sẽ join từ app.item.tracking_mode.
    trackingMode: "none",
  }));

  return (
    <div>
      {isDemo ? (
        <div
          role="status"
          className="sticky top-0 z-sticky flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800"
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          Đang dùng dữ liệu demo (stub V1.1-alpha) — module PO thật sẽ có ở V1.2.
        </div>
      ) : null}

      <ReceivingConsole
        poId={result.po.poId}
        poCode={result.po.poCode}
        supplierName={result.po.supplierName}
        expectedDate={result.po.expectedDate}
        lines={lines}
      />
    </div>
  );
}
