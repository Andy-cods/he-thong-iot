"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ShiftSetupKind } from "@iot/shared";
import {
  enqueue,
  flushQueue,
  loadQueue,
  removeFromQueue,
  saveQueue,
  type BulkResult,
  type QueuedEntry,
} from "@/lib/shift-output/offline-queue";
import type { KpiResult, ParetoRow } from "@/lib/shift-output/kpi";
import type { BoardCell } from "@/lib/shift-output/board";
import type { ReportGroup, SummaryRow, TrendPoint } from "@/lib/shift-output/report";

/**
 * V4.10 (TASK-20261118-001) — hooks TanStack cho module Sản lượng ca.
 * Mọi API dưới /api/shift-output/*. Lỗi API ném `ShiftApiError` (status + code
 * + details) để form xử lý 409 DUPLICATE_SLOT / STALE / LOCKED.
 */

export class ShiftApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;
  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string; details?: Record<string, unknown> };
    };
    throw new ShiftApiError(body.error?.message ?? `Lỗi máy chủ (HTTP ${res.status})`, res.status, body.error?.code, body.error?.details);
  }
  return (await res.json()) as T;
}

const KEY = ["shift-output"] as const;
const SITE_STORAGE_KEY = "iot.shiftOutput.site";
const CONTEXT_CACHE_KEY = "iot.shiftOutput.context.v1";

function qs(params: Record<string, string | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/* ── Kiểu dữ liệu ───────────────────────────────────────────────────── */

export interface SiteInfo {
  id: string;
  code: string;
  name: string;
  timezone: string;
  lockAfterHours: number;
  backdateDays: number;
  ngWarnPct: number;
  isActive: boolean;
}
export interface CatalogItem {
  id: string;
  siteId: string;
  code?: string;
  name?: string;
  fullName?: string;
  shortName?: string | null;
  model?: string | null;
  drawingNo?: string | null;
  revision?: string | null;
  customerName?: string | null;
  stdCycleSec?: number | null;
  /** P2 — ảnh mã hàng (bom_asset id); null = chưa có ảnh. */
  imageAssetId?: string | null;
  /** Ca: giờ "HH:MM:SS" + cờ qua nửa đêm (tự suy). */
  startTime?: string;
  endTime?: string;
  crossesMidnight?: boolean;
  isPlanned?: boolean;
  sortOrder?: number;
  isActive: boolean;
}
export interface ShiftItem {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  minutes: number;
}
export interface ShiftContext {
  site: SiteInfo;
  sites: SiteInfo[];
  today: string;
  serverTime: string;
  suggestion: { prodDate: string; shiftId: string } | null;
  machines: CatalogItem[];
  shifts: ShiftItem[];
  parts: CatalogItem[];
  operators: CatalogItem[];
  defectReasons: CatalogItem[];
  downtimeReasons: CatalogItem[];
  recentPartIds: string[];
  lastPartByMachine: Record<string, string>;
  avgOk30: Record<string, number>;
  permissions: {
    approve: boolean;
    createSetup: boolean;
    updateSetup: boolean;
    /** P2 — danh mục được thêm / sửa (xưởng: Mã hàng, Người, Ca). Thiếu = context cache bản cũ. */
    addKinds?: ShiftSetupKind[];
    editKinds?: ShiftSetupKind[];
    /** Sửa Thiết lập xưởng (giờ tự khoá, lùi ngày, %NG) — chỉ quản trị. */
    siteSettings?: boolean;
    workshop: boolean;
  };
}

export interface EntryRow {
  id: string;
  siteId: string;
  clientUuid: string;
  prodDate: string;
  shiftId: string;
  shiftCode: string;
  shiftName: string;
  shiftStart: string;
  shiftEnd: string;
  machineId: string;
  machineCode: string;
  machineName: string;
  partId: string;
  partCode: string;
  partName: string;
  operatorId: string | null;
  operatorName: string | null;
  qtyPlanned: number | null;
  qtyOk: number;
  qtyNg: number;
  qtyRework: number | null;
  downtimeMin: number | null;
  /** Phút khả dụng của dòng (thực tế nếu có workStart/workEnd). */
  shiftMinutes: number;
  /** P2 — giờ chạy thực tế "HH:MM:SS"; null = dòng cũ (theo giờ ca). */
  workStart: string | null;
  workEnd: string | null;
  materialLot: string | null;
  notes: string | null;
  status: string;
  version: number;
  createdAt: string;
  createdByName: string | null;
  updatedAt: string;
  deletedAt: string | null;
  deleteReason: string | null;
  locked: boolean;
  editCount: number;
  defects: Array<{ reasonId: string; reasonCode: string; reasonName: string; qty: number }>;
  downtimes: Array<{ reasonId: string; reasonCode: string; reasonName: string; minutes: number; note: string | null }>;
}

export interface EntryPayload {
  clientUuid: string;
  siteId?: string | null;
  prodDate: string;
  shiftId: string;
  machineId: string;
  partId: string;
  operatorId?: string | null;
  operatorName?: string | null;
  qtyPlanned?: number | null;
  qtyOk: number;
  qtyNg: number;
  qtyRework?: number | null;
  downtimeMin?: number | null;
  /** P2 — giờ chạy thực tế "HH:MM" (cả 2). */
  workStart?: string | null;
  workEnd?: string | null;
  materialLot?: string | null;
  notes?: string | null;
  defects: Array<{ reasonId: string; qty: number }>;
  downtimes: Array<{ reasonId: string; minutes: number; note?: string | null }>;
}

/* ── Site đang xem (admin có thể có nhiều site) ─────────────────────── */

export function useSelectedSite(): [string | null, (id: string) => void] {
  const [siteId, setSiteId] = React.useState<string | null>(null);
  React.useEffect(() => {
    try {
      setSiteId(window.localStorage.getItem(SITE_STORAGE_KEY));
    } catch {
      /* chế độ riêng tư */
    }
  }, []);
  const set = React.useCallback((id: string) => {
    setSiteId(id);
    try {
      window.localStorage.setItem(SITE_STORAGE_KEY, id);
    } catch {
      /* bỏ qua */
    }
  }, []);
  return [siteId, set];
}

/* ── Context (form Nhập ca) — cache localStorage khi mạng chập chờn ── */

function readCachedContext(): ShiftContext | undefined {
  try {
    const raw = window.localStorage.getItem(CONTEXT_CACHE_KEY);
    return raw ? (JSON.parse(raw) as ShiftContext) : undefined;
  } catch {
    return undefined;
  }
}

export function useShiftContext(siteId?: string | null) {
  return useQuery<ShiftContext>({
    queryKey: [...KEY, "context", siteId ?? null],
    queryFn: async () => {
      const r = await request<{ data: ShiftContext }>(`/api/shift-output/context${qs({ siteId })}`);
      try {
        window.localStorage.setItem(CONTEXT_CACHE_KEY, JSON.stringify(r.data));
      } catch {
        /* bỏ qua */
      }
      return r.data;
    },
    placeholderData: () => (typeof window === "undefined" ? undefined : readCachedContext()),
    staleTime: 30_000,
    retry: 1,
  });
}

/* ── Hôm nay ───────────────────────────────────────────────────────── */

export interface BoardData {
  date: string;
  site: { id: string; name: string };
  machines: Array<{ id: string; code: string; name: string }>;
  shifts: Array<{ id: string; code: string; name: string; startTime: string; endTime: string; crossesMidnight?: boolean }>;
  cells: BoardCell[];
  kpi: KpiResult;
  missingCount: number;
  serverTime: string;
}

export function useShiftBoard(date: string | undefined, siteId?: string | null) {
  return useQuery<BoardData>({
    queryKey: [...KEY, "board", siteId ?? null, date ?? "today"],
    queryFn: async () => (await request<{ data: BoardData }>(`/api/shift-output/board${qs({ siteId, date })}`)).data,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/* ── Dòng sản lượng ─────────────────────────────────────────────────── */

export interface EntryFilter {
  from: string;
  to: string;
  shiftId?: string;
  machineId?: string;
  partId?: string;
  operatorId?: string;
  siteId?: string | null;
}

export function useShiftEntries(f: EntryFilter, enabled = true) {
  return useQuery<{ data: EntryRow[]; meta: { truncated: boolean } }>({
    queryKey: [...KEY, "entries", f],
    queryFn: () =>
      request(`/api/shift-output/entries${qs({ ...f, siteId: f.siteId ?? undefined } as Record<string, string | undefined>)}`),
    enabled,
  });
}

export function useShiftEntry(id: string | null) {
  return useQuery<EntryRow>({
    queryKey: [...KEY, "entry", id],
    queryFn: async () => (await request<{ data: EntryRow }>(`/api/shift-output/entries/${id}`)).data,
    enabled: !!id,
  });
}

export interface HistoryEvent {
  id: string;
  action: string;
  actorUsername: string | null;
  actorName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  notes: string | null;
  occurredAt: string;
}

export function useShiftEntryHistory(id: string | null) {
  return useQuery<HistoryEvent[]>({
    queryKey: [...KEY, "history", id],
    queryFn: async () => (await request<{ data: HistoryEvent[] }>(`/api/shift-output/entries/${id}/history`)).data,
    enabled: !!id,
  });
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return React.useCallback(() => qc.invalidateQueries({ queryKey: KEY }), [qc]);
}

export function useCreateShiftEntry() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (p: EntryPayload) =>
      request<{ data: EntryRow; replayed?: boolean; warnings?: Array<{ code: string; message: string }> }>(
        "/api/shift-output/entries",
        { method: "POST", body: JSON.stringify(p) },
      ),
    onSuccess: () => void invalidate(),
  });
}

export function usePatchShiftEntry() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; version: number; reason?: string | null } & Partial<EntryPayload>) =>
      request<{ data: EntryRow }>(`/api/shift-output/entries/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => void invalidate(),
  });
}

export function useDeleteShiftEntry() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; reason: string; version?: number }) =>
      request(`/api/shift-output/entries/${id}`, { method: "DELETE", body: JSON.stringify(body) }),
    onSuccess: () => void invalidate(),
  });
}

export function useLockShift() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (b: { prodDate: string; shiftId?: string | null; siteId?: string | null }) =>
      request<{ data: { locked: number } }>("/api/shift-output/locks", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => void invalidate(),
  });
}

/* ── Cài đặt ───────────────────────────────────────────────────────── */

export function useSetupList(kind: ShiftSetupKind, siteId?: string | null, includeInactive = true) {
  return useQuery<CatalogItem[]>({
    queryKey: [...KEY, "setup", kind, siteId ?? null, includeInactive],
    queryFn: async () =>
      (
        await request<{ data: CatalogItem[] }>(
          `/api/shift-output/setup/${kind}${qs({ siteId, includeInactive: includeInactive ? "1" : undefined })}`,
        )
      ).data,
  });
}

export function useCreateSetup(kind: ShiftSetupKind) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      request<{ data: CatalogItem }>(`/api/shift-output/setup/${kind}`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => void invalidate(),
  });
}

export function usePatchSetup(kind: ShiftSetupKind) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      request<{ data: CatalogItem }>(`/api/shift-output/setup/${kind}/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => void invalidate(),
  });
}

/** P2 — URL ảnh mã hàng (route có auth; `v` = asset id để cache bất biến). */
export function partImageUrl(partId: string, assetId: string, size: "thumb" | "full" = "thumb") {
  return `/api/shift-output/parts/${partId}/image?size=${size}&v=${assetId}`;
}

/** P2 — tải lên / thay ảnh mã hàng (multipart, KHÔNG đặt content-type để trình duyệt tự thêm boundary). */
export function useUploadPartImage() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ partId, file }: { partId: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/shift-output/parts/${partId}/image`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
        throw new ShiftApiError(body.error?.message ?? `Lỗi tải ảnh (HTTP ${res.status})`, res.status, body.error?.code);
      }
      return ((await res.json()) as { data: CatalogItem }).data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useRemovePartImage() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (partId: string) =>
      request<{ data: CatalogItem }>(`/api/shift-output/parts/${partId}/image`, { method: "DELETE" }),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateSite() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      request<{ data: SiteInfo }>(`/api/shift-output/sites/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => void invalidate(),
  });
}

/* ── Báo cáo ───────────────────────────────────────────────────────── */

export interface ReportRange {
  from: string;
  to: string;
  siteId?: string | null;
  machineId?: string;
  partId?: string;
}

export function useReportSummary(group: ReportGroup, r: ReportRange) {
  return useQuery<{ group: ReportGroup; rows: SummaryRow[]; total: KpiResult }>({
    queryKey: [...KEY, "report", "summary", group, r],
    queryFn: async () =>
      (await request<{ data: { group: ReportGroup; rows: SummaryRow[]; total: KpiResult } }>(
        `/api/shift-output/reports/summary${qs({ group, from: r.from, to: r.to, siteId: r.siteId, machineId: r.machineId, partId: r.partId })}`,
      )).data,
  });
}

export function useReportTrend(r: ReportRange, enabled = true) {
  return useQuery<TrendPoint[]>({
    queryKey: [...KEY, "report", "trend", r],
    queryFn: async () =>
      (await request<{ data: TrendPoint[] }>(
        `/api/shift-output/reports/trend${qs({ from: r.from, to: r.to, siteId: r.siteId, machineId: r.machineId, partId: r.partId })}`,
      )).data,
    enabled,
  });
}

export function useReportPareto(type: "defect" | "downtime", r: ReportRange, enabled = true) {
  return useQuery<{ type: string; rows: ParetoRow[]; total: number }>({
    queryKey: [...KEY, "report", "pareto", type, r],
    queryFn: async () =>
      (await request<{ data: { type: string; rows: ParetoRow[]; total: number } }>(
        `/api/shift-output/reports/pareto${qs({ type, from: r.from, to: r.to, siteId: r.siteId, machineId: r.machineId, partId: r.partId })}`,
      )).data,
    enabled,
  });
}

export function reportExportUrl(r: ReportRange): string {
  return `/api/shift-output/reports/export${qs({ from: r.from, to: r.to, siteId: r.siteId, machineId: r.machineId, partId: r.partId })}`;
}

/* ── Hàng đợi offline ──────────────────────────────────────────────── */

async function sendBulk(entries: Array<Record<string, unknown>>): Promise<BulkResult[]> {
  const res = await fetch("/api/shift-output/entries/bulk", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`); // 401/5xx/mạng → giữ nguyên hàng đợi
  return ((await res.json()) as { results: BulkResult[] }).results;
}

/**
 * Hàng đợi "Chờ gửi": state React đồng bộ localStorage; tự gửi khi mở trang,
 * khi có mạng lại (`online`) và mỗi 30 giây.
 */
export function useOfflineQueue() {
  const [queue, setQueue] = React.useState<QueuedEntry[]>([]);
  const [online, setOnline] = React.useState(true);
  const [flushing, setFlushing] = React.useState(false);
  const flushingRef = React.useRef(false);
  const invalidate = useInvalidateAll();

  React.useEffect(() => {
    setQueue(loadQueue());
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
  }, []);

  const update = React.useCallback((fn: (q: QueuedEntry[]) => QueuedEntry[]) => {
    setQueue((prev) => {
      const next = fn(prev);
      saveQueue(next);
      return next;
    });
  }, []);

  const flush = React.useCallback(async () => {
    if (flushingRef.current) return;
    const current = loadQueue();
    if (!current.some((q) => q.status === "pending")) return;
    flushingRef.current = true;
    setFlushing(true);
    try {
      const r = await flushQueue(current, sendBulk);
      // Gộp với dòng mới thêm trong lúc đang gửi.
      const latest = loadQueue();
      const sentIds = new Set(current.map((q) => q.clientUuid).filter((id) => !r.queue.some((x) => x.clientUuid === id)));
      const merged = [
        ...r.queue,
        ...latest.filter((q) => !sentIds.has(q.clientUuid) && !r.queue.some((x) => x.clientUuid === q.clientUuid)),
      ];
      saveQueue(merged);
      setQueue(merged);
      if (r.sent > 0) void invalidate();
      if (r.networkError) setOnline(false);
    } finally {
      flushingRef.current = false;
      setFlushing(false);
    }
  }, [invalidate]);

  React.useEffect(() => {
    const on = () => {
      setOnline(true);
      void flush();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const t = window.setInterval(() => void flush(), 30_000);
    void flush();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.clearInterval(t);
    };
  }, [flush]);

  return {
    queue,
    online,
    flushing,
    pendingCount: queue.filter((q) => q.status === "pending").length,
    failedCount: queue.filter((q) => q.status === "failed").length,
    add: (item: { clientUuid: string; payload: Record<string, unknown>; label?: string }) =>
      update((q) => enqueue(q, item)),
    remove: (clientUuid: string) => update((q) => removeFromQueue(q, clientUuid)),
    retry: (clientUuid: string) =>
      update((q) => q.map((x) => (x.clientUuid === clientUuid ? { ...x, status: "pending" as const, error: null } : x))),
    flush,
  };
}

/** UUID v4 cho client_uuid (crypto.randomUUID khi có; fallback getRandomValues). */
export function newClientUuid(): string {
  const c: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c) c.getRandomValues(b);
  else for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
