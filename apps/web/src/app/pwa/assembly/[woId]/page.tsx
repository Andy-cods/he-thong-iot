import { notFound } from "next/navigation";
import { getWorkOrder } from "@/server/repos/workOrders";
import { getWoProgress } from "@/server/repos/assemblies";
import { AssemblyConsole } from "@/components/assembly/AssemblyConsole";

export const dynamic = "force-dynamic";

/**
 * V1.3 Phase B3 — PWA Assembly scan page.
 *
 * RSC: load WO detail + progress → pass vào AssemblyConsole client component.
 */
export default async function AssemblyPwaPage({
  params,
}: {
  params: { woId: string };
}) {
  const [wo, progress] = await Promise.all([
    getWorkOrder(params.woId),
    getWoProgress(params.woId),
  ]);
  if (!wo || !progress) notFound();

  return (
    <AssemblyConsole
      woId={wo.id}
      woNo={wo.woNo}
      woStatus={wo.status}
      orderNo={wo.orderNo}
      customerName={null}
      lines={progress.lines.map((l) => ({
        snapshotLineId: l.snapshotLineId,
        componentSku: l.componentSku,
        componentName: l.componentName,
        requiredQty: l.requiredQty,
        completedQty: l.completedQty,
        reservedQty: l.reservedQty,
        state: l.state,
        reservations: l.reservations,
      }))}
    />
  );
}
