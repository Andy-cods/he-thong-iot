"use client";

import * as React from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import {
  SSE_GRACE_MS,
  patchTreeLines,
  setBomLiveHealthy,
  type PatchableLine,
} from "@/lib/bom-live";

/**
 * BOM V5 / WP9 — realtime cho trang BOM.
 *
 * Mở EventSource `/api/bom/templates/[id]/live`:
 *  - event `bom`  → vá cache các dòng đổi (GET lines?ids=) thay vì refetch cả
 *    tree; stage/slip/import → invalidate đúng query liên quan. Bỏ qua event
 *    do chính mình (đã cập nhật lạc quan). Gom event 300ms; cần refetch cả
 *    tree thì debounce 500ms.
 *  - event `presence` → danh sách người đang xem.
 *  - Tự nối lại (EventSource). Mất SSE > 30s → chu kỳ poll quay về 60s
 *    (lưới an toàn 5 phút khi SSE khoẻ — xem bomPollMs).
 */

export interface BomViewer {
  id: string;
  name: string;
}

interface BomEventMsg {
  templateId: string;
  lineIds?: string[];
  kind: "line" | "stage" | "supplier" | "import" | "slip";
  by: string | null;
}

const BATCH_MS = 300;
const TREE_DEBOUNCE_MS = 500;

function invalidateTree(qc: QueryClient, id: string) {
  void qc.invalidateQueries({ queryKey: ["bom", "tree", id] });
}

function invalidateDerived(qc: QueryClient, id: string) {
  void qc.invalidateQueries({ queryKey: ["bom", "derived-status", id] });
  void qc.invalidateQueries({ queryKey: ["bom", "workspace-summary", id] });
}

function invalidateStages(qc: QueryClient, id: string) {
  void qc.invalidateQueries({ queryKey: ["bom", "stages", id] });
  void qc.invalidateQueries({ queryKey: ["bom", "stage-moves", id] });
  void qc.invalidateQueries({ queryKey: ["bom", "fab-progress", id] });
}

/** Mất kết nối rồi nối lại / quay về poll: kéo lại những gì có thể đã lỡ. */
function catchUp(qc: QueryClient, id: string) {
  invalidateTree(qc, id);
  invalidateStages(qc, id);
  invalidateDerived(qc, id);
}

async function patchLines(qc: QueryClient, templateId: string, ids: string[]): Promise<boolean> {
  let fresh: PatchableLine[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const res = await fetch(
      `/api/bom/templates/${templateId}/lines?ids=${encodeURIComponent(chunk.join(","))}`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error(`lines ${res.status}`);
    const body = (await res.json()) as { data: { lines: PatchableLine[] } };
    fresh = fresh.concat(body.data.lines);
  }
  let needsRefetch = false;
  const caches = qc.getQueriesData<{ data: { tree: PatchableLine[] } }>({
    queryKey: ["bom", "tree", templateId],
  });
  for (const [key, data] of caches) {
    if (!data?.data?.tree) continue;
    const r = patchTreeLines(data.data.tree, fresh, ids);
    if (r.needsRefetch) needsRefetch = true;
    if (r.patched > 0) {
      qc.setQueryData(key, { ...data, data: { ...data.data, tree: r.tree } });
    }
  }
  return needsRefetch;
}

export function useBomLive(templateId: string | null | undefined): { viewers: BomViewer[]; connected: boolean } {
  const qc = useQueryClient();
  const session = useSession();
  const myId = session.data?.id ?? null;
  const myIdRef = React.useRef<string | null>(myId);
  myIdRef.current = myId;
  const [viewers, setViewers] = React.useState<BomViewer[]>([]);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    if (!templateId || typeof EventSource === "undefined") return;
    const id = templateId;
    const es = new EventSource(`/api/bom/templates/${id}/live`, { withCredentials: true });
    let disposed = false;
    let everOpened = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    let batchTimer: ReturnType<typeof setTimeout> | null = null;
    let treeTimer: ReturnType<typeof setTimeout> | null = null;
    let pending = new Set<string>();
    let pendingAll = false;

    const scheduleTree = () => {
      if (treeTimer) return;
      treeTimer = setTimeout(() => {
        treeTimer = null;
        invalidateTree(qc, id);
      }, TREE_DEBOUNCE_MS);
    };

    const flush = async () => {
      batchTimer = null;
      const ids = [...pending];
      const all = pendingAll;
      pending = new Set();
      pendingAll = false;
      if (all || ids.length === 0) {
        if (all) scheduleTree();
        return;
      }
      try {
        if (await patchLines(qc, id, ids)) scheduleTree();
      } catch {
        scheduleTree();
      }
    };

    es.onopen = () => {
      if (disposed) return;
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = null;
      setBomLiveHealthy(true);
      setConnected(true);
      if (everOpened) catchUp(qc, id); // nối lại: có thể đã lỡ event
      everOpened = true;
    };

    es.onerror = () => {
      if (disposed) return;
      setConnected(false);
      if (graceTimer) return;
      graceTimer = setTimeout(() => {
        graceTimer = null;
        setBomLiveHealthy(false);
        // Kéo lại ngay để các query poll được lên lịch lại theo chu kỳ nhanh.
        catchUp(qc, id);
      }, SSE_GRACE_MS);
    };

    es.addEventListener("presence", (e) => {
      try {
        const p = JSON.parse((e as MessageEvent<string>).data) as { users: BomViewer[] };
        setViewers(p.users ?? []);
      } catch {
        /* bỏ qua */
      }
    });

    es.addEventListener("bom", (e) => {
      let m: BomEventMsg;
      try {
        m = JSON.parse((e as MessageEvent<string>).data) as BomEventMsg;
      } catch {
        return;
      }
      if (m.templateId !== id) return;
      if (m.by && m.by === myIdRef.current) return; // chính mình — đã cập nhật lạc quan

      switch (m.kind) {
        case "line":
        case "supplier":
          invalidateDerived(qc, id);
          if (m.lineIds && m.lineIds.length > 0) m.lineIds.forEach((l) => pending.add(l));
          else pendingAll = true;
          if (!batchTimer) batchTimer = setTimeout(() => void flush(), BATCH_MS);
          break;
        case "stage":
          invalidateStages(qc, id);
          invalidateDerived(qc, id);
          break;
        case "slip":
          invalidateStages(qc, id);
          invalidateDerived(qc, id);
          void qc.invalidateQueries({ queryKey: ["delivery-slips"] });
          break;
        case "import":
          void qc.invalidateQueries({
            predicate: (q) => q.queryKey[0] === "bom" && q.queryKey[2] === id,
          });
          break;
      }
    });

    return () => {
      disposed = true;
      es.close();
      if (graceTimer) clearTimeout(graceTimer);
      if (batchTimer) clearTimeout(batchTimer);
      if (treeTimer) clearTimeout(treeTimer);
      setBomLiveHealthy(false);
      setConnected(false);
      setViewers([]);
    };
  }, [templateId, qc]);

  return { viewers, connected };
}
