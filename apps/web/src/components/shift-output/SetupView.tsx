"use client";

import * as React from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  SHIFT_PART_IMAGE_MAX_BYTES,
  SHIFT_PART_IMAGE_MIME,
  SHIFT_SETUP_KINDS,
  SHIFT_SETUP_WORKSHOP_KINDS,
  type ShiftSetupKind,
} from "@iot/shared";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { cn } from "@/lib/utils";
import { isOvernight, workWindowMinutes } from "@/lib/shift-output/shift-window";
import {
  useCreateSetup,
  usePatchSetup,
  useRemovePartImage,
  useUploadPartImage,
  useSetupList,
  useShiftContext,
  useUpdateSite,
  type CatalogItem,
  type ShiftContext,
} from "@/hooks/useShiftOutput";
import { Panel } from "./primitives";
import { PartImage } from "./PartImage";
import { fmtDuration } from "./WorkTimeSection";

/**
 * V4.10 — "Cài đặt": 6 danh mục dùng chung 1 bảng (SetupTable) + Thiết lập xưởng.
 * P2: tài khoản xưởng THÊM / SỬA / NGỪNG DÙNG Mã hàng, Người phụ trách, Ca làm
 * việc (context `permissions.addKinds/editKinds`); máy / lý do / thiết lập xưởng
 * do quản trị. Ca tự nhận "qua nửa đêm". Mã hàng có ảnh (khung cố định, chạm
 * phóng to). "Xoá" = ngừng dùng (giữ lịch sử sản lượng).
 */
type FieldType = "text" | "code" | "number" | "time" | "bool";
interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  table?: boolean;
  /** Chỉ hiển thị trong bảng (server tự tính) — không có ô nhập, không gửi lên. */
  readOnly?: boolean;
}

const ALL_KINDS = [...SHIFT_SETUP_KINDS] as ShiftSetupKind[];

/** Quyền theo danh mục; context cache bản cũ (thiếu addKinds/editKinds) → suy như server. */
function setupPermissions(p: ShiftContext["permissions"]) {
  const workshopKinds = [...SHIFT_SETUP_WORKSHOP_KINDS];
  const editKinds = p.editKinds ?? (!p.updateSetup ? [] : p.workshop ? workshopKinds : ALL_KINDS);
  const addKinds = p.addKinds ?? (!p.createSetup ? [] : p.workshop || !p.updateSetup ? workshopKinds : ALL_KINDS);
  return { editKinds, addKinds, siteSettings: p.siteSettings ?? (p.updateSetup && !p.workshop) };
}

const KINDS: Array<{ kind: ShiftSetupKind; label: string; fields: FieldDef[] }> = [
  {
    kind: "parts",
    label: "Mã hàng",
    fields: [
      { key: "code", label: "Mã hàng", type: "code", required: true, placeholder: "TRUC-D20-L85", table: true },
      { key: "name", label: "Tên hàng", type: "text", required: true, placeholder: "Trục D20 dài 85", table: true },
      { key: "drawingNo", label: "Số bản vẽ", type: "text", table: true },
      { key: "revision", label: "Rev", type: "text" },
      { key: "customerName", label: "Khách hàng", type: "text", table: true },
      { key: "stdCycleSec", label: "Cycle time chuẩn (giây)", type: "number" },
    ],
  },
  {
    kind: "operators",
    label: "Người phụ trách",
    fields: [
      { key: "fullName", label: "Họ tên", type: "text", required: true, table: true },
      { key: "shortName", label: "Tên gọi ngắn (chip)", type: "text", table: true },
      { key: "sortOrder", label: "Thứ tự", type: "number" },
    ],
  },
  {
    kind: "machines",
    label: "Máy",
    fields: [
      { key: "code", label: "Mã máy", type: "code", required: true, table: true },
      { key: "name", label: "Tên máy", type: "text", required: true, table: true },
      { key: "model", label: "Model", type: "text", table: true },
      { key: "sortOrder", label: "Thứ tự", type: "number", table: true },
    ],
  },
  {
    kind: "shifts",
    label: "Ca làm việc",
    fields: [
      { key: "code", label: "Mã ca", type: "code", required: true, table: true },
      { key: "name", label: "Tên ca", type: "text", required: true, table: true },
      { key: "startTime", label: "Bắt đầu", type: "time", required: true, table: true },
      { key: "endTime", label: "Kết thúc", type: "time", required: true, table: true },
      { key: "crossesMidnight", label: "Qua nửa đêm", type: "bool", table: true, readOnly: true },
      { key: "sortOrder", label: "Thứ tự", type: "number", table: true },
    ],
  },
  {
    kind: "defect-reasons",
    label: "Lý do lỗi",
    fields: [
      { key: "code", label: "Mã", type: "code", required: true, table: true },
      { key: "name", label: "Lý do", type: "text", required: true, table: true },
      { key: "sortOrder", label: "Thứ tự", type: "number", table: true },
    ],
  },
  {
    kind: "downtime-reasons",
    label: "Lý do dừng máy",
    fields: [
      { key: "code", label: "Mã", type: "code", required: true, table: true },
      { key: "name", label: "Lý do", type: "text", required: true, table: true },
      { key: "isPlanned", label: "Dừng có kế hoạch", type: "bool", table: true },
      { key: "sortOrder", label: "Thứ tự", type: "number" },
    ],
  },
];

const inputCls =
  "h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[16px] text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 md:h-9 md:text-md";

export function SetupView({ siteId }: { siteId: string | null }) {
  const ctx = useShiftContext(siteId);
  const [tab, setTab] = React.useState<ShiftSetupKind | "site">("parts");
  if (!ctx.data) {
    return ctx.isError ? (
      <div className="p-4">
        <QueryError error={ctx.error} onRetry={() => void ctx.refetch()} />
      </div>
    ) : (
      <div className="p-4">
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  const perms = setupPermissions(ctx.data.permissions);
  const isWorkshop = ctx.data.permissions.workshop;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 p-3 sm:p-4 lg:p-6">
      <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800" role="tablist" aria-label="Danh mục">
          {[...KINDS.map((k) => ({ key: k.kind as ShiftSetupKind | "site", label: k.label })), { key: "site" as const, label: "Thiết lập xưởng" }].map(
            (t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "min-h-10 whitespace-nowrap rounded-md px-3 text-md font-medium md:min-h-8",
                  tab === t.key ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-950 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400",
                )}
              >
                {t.label}
              </button>
            ),
          )}
        </div>
      </div>
      {isWorkshop || perms.editKinds.length < ALL_KINDS.length ? (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-md text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          {perms.editKinds.length > 0
            ? "Tài khoản xưởng: thêm, sửa, ngừng dùng Mã hàng, Người phụ trách và Ca làm việc. Máy, lý do và thiết lập xưởng do quản trị."
            : "Chỉ xem. Thêm / sửa danh mục do quản trị."}
        </p>
      ) : null}
      {tab === "site" ? (
        <SiteSettings ctx={ctx.data} canManage={perms.siteSettings} />
      ) : (
        <SetupTable key={tab} def={KINDS.find((k) => k.kind === tab)!} siteId={ctx.data.site.id} ctx={ctx.data} />
      )}
    </div>
  );
}

function emptyValues(fields: FieldDef[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((f) => !f.readOnly).map((f) => [f.key, f.type === "bool" ? false : ""]));
}

function toBody(fields: FieldDef[], v: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.readOnly) continue;
    const raw = v[f.key];
    if (f.type === "bool") out[f.key] = Boolean(raw);
    else if (f.type === "number") out[f.key] = raw === "" || raw == null ? (f.key === "stdCycleSec" ? null : undefined) : Number(raw);
    else out[f.key] = typeof raw === "string" ? raw.trim() : raw;
  }
  return out;
}

function SetupTable({ def, siteId, ctx }: { def: (typeof KINDS)[number]; siteId: string; ctx: ShiftContext }) {
  const list = useSetupList(def.kind, siteId, true);
  const create = useCreateSetup(def.kind);
  const patch = usePatchSetup(def.kind);
  const upload = useUploadPartImage();
  const perms = setupPermissions(ctx.permissions);
  const canManage = perms.editKinds.includes(def.kind);
  const canAdd = perms.addKinds.includes(def.kind);
  const isParts = def.kind === "parts";
  const [draft, setDraft] = React.useState<Record<string, unknown>>(() => emptyValues(def.fields));
  const [draftImage, setDraftImage] = React.useState<File | null>(null);
  const [imageKey, setImageKey] = React.useState(0);
  const [editing, setEditing] = React.useState<CatalogItem | null>(null);
  const [editValues, setEditValues] = React.useState<Record<string, unknown>>({});

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await create.mutateAsync({ ...toBody(def.fields, draft), siteId });
      if (isParts && draftImage) {
        try {
          await upload.mutateAsync({ partId: r.data.id, file: draftImage });
        } catch (err) {
          toast.error(`Đã thêm mã nhưng chưa lưu được ảnh: ${(err as Error).message}`);
        }
      }
      toast.success(`Đã thêm ${def.label.toLowerCase()}`);
      setDraft(emptyValues(def.fields));
      setDraftImage(null);
      setImageKey((k) => k + 1);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const openEdit = (row: CatalogItem) => {
    if (!canManage) return;
    setEditing(row);
    setEditValues(
      Object.fromEntries(
        def.fields.filter((f) => !f.readOnly).map((f) => {
          const v = (row as unknown as Record<string, unknown>)[f.key];
          return [f.key, f.type === "time" && typeof v === "string" ? v.slice(0, 5) : (v ?? (f.type === "bool" ? false : ""))];
        }),
      ),
    );
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    try {
      await patch.mutateAsync({ id: editing.id, ...toBody(def.fields, editValues) });
      toast.success("Đã lưu");
      setEditing(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const toggleActive = async (row: CatalogItem) => {
    try {
      await patch.mutateAsync({ id: row.id, isActive: !row.isActive });
      toast.success(row.isActive ? "Đã ngừng dùng" : "Đã dùng lại");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const columns: DataTableColumn<CatalogItem>[] = [
    ...def.fields
      .filter((f) => f.table)
      .map((f, i): DataTableColumn<CatalogItem> => ({
        id: f.key,
        header: f.label,
        kind: f.type === "code" ? "code" : f.type === "number" ? "number" : undefined,
        mobile: i === 0 ? "primary" : "secondary",
        cell: (row) => {
          const v = (row as unknown as Record<string, unknown>)[f.key];
          if (isParts && f.key === "code") {
            return (
              <span className="flex min-w-0 items-center gap-2.5">
                <PartImage partId={row.id} assetId={row.imageAssetId} size={44} alt={`${row.code ?? ""} — ${row.name ?? ""}`} />
                <span className="truncate font-mono">{String(v ?? "")}</span>
              </span>
            );
          }
          if (f.type === "bool") return v ? "Có" : "—";
          if (f.type === "time" && typeof v === "string") return v.slice(0, 5);
          return v == null || v === "" ? "—" : String(v);
        },
      })),
    {
      id: "active",
      header: "Trạng thái",
      kind: "status",
      mobile: "status",
      cell: (row) =>
        canManage ? (
          <button
            type="button"
            onClick={() => void toggleActive(row)}
            className={cn(
              "rounded-full px-2.5 py-1 text-sm font-medium",
              row.isActive
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800",
            )}
            title={row.isActive ? "Chạm để ngừng dùng" : "Chạm để dùng lại"}
          >
            {row.isActive ? "Đang dùng" : "Ngừng dùng"}
          </button>
        ) : (
          <span className={cn("rounded-full px-2.5 py-1 text-sm", row.isActive ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500")}>
            {row.isActive ? "Đang dùng" : "Ngừng dùng"}
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      {canAdd ? (
        <Panel title={`Thêm ${def.label.toLowerCase()}`}>
          <form onSubmit={(e) => void onAdd(e)} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {def.fields
              .filter((f) => !f.readOnly)
              .map((f) => (
                <FieldInput key={f.key} f={f} value={draft[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
              ))}
            {isParts ? <ImagePicker key={imageKey} label="Ảnh sản phẩm (tuỳ chọn)" file={draftImage} onPick={setDraftImage} /> : null}
            {def.kind === "shifts" ? <ShiftWindowHint start={draft.startTime} end={draft.endTime} /> : null}
            <div className="flex items-end">
              <Button type="submit" size="lg" className="w-full md:h-9" disabled={create.isPending || upload.isPending}>
                <Plus className="h-4 w-4" aria-hidden="true" /> {create.isPending || upload.isPending ? "Đang thêm…" : "Thêm"}
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}
      {list.isError ? (
        <QueryError error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={list.data ?? []}
          getRowKey={(r) => r.id}
          loading={list.isLoading}
          onRowClick={canManage ? openEdit : undefined}
          rowClassName={(r) => (r.isActive ? undefined : "opacity-60")}
          ariaLabel={def.label}
        />
      )}
      <Dialog open={!!editing} onOpenChange={(o) => (!o ? setEditing(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa {def.label.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 px-5 sm:grid-cols-2">
            {isParts && editing ? <PartImageEditor part={editing} onChanged={(row) => setEditing(row)} /> : null}
            {def.fields
              .filter((f) => !f.readOnly)
              .map((f) => (
                <FieldInput key={f.key} f={f} value={editValues[f.key]} onChange={(v) => setEditValues((d) => ({ ...d, [f.key]: v }))} />
              ))}
            {def.kind === "shifts" ? <ShiftWindowHint start={editValues.startTime} end={editValues.endTime} /> : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Huỷ
            </Button>
            <Button onClick={() => void onSaveEdit()} disabled={patch.isPending}>
              {patch.isPending ? "Đang lưu…" : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Ca: hiện "dài X giờ · qua nửa đêm" ngay khi gõ giờ (thay checkbox cũ). */
function ShiftWindowHint({ start, end }: { start: unknown; end: unknown }) {
  const st = typeof start === "string" ? start : "";
  const et = typeof end === "string" ? end : "";
  if (!st || !et) return null;
  const minutes = workWindowMinutes(st, et);
  return (
    <p className={cn("self-end pb-2 text-sm sm:col-span-2", minutes == null ? "font-medium text-red-600" : "text-zinc-600 dark:text-zinc-400")}>
      {minutes == null ? (
        "Giờ kết thúc phải khác giờ bắt đầu."
      ) : (
        <>
          Ca dài <span className="font-semibold text-zinc-900 dark:text-zinc-50">{fmtDuration(minutes)}</span>
          {isOvernight(st, et) ? " · qua nửa đêm (kết thúc hôm sau, tính vào ngày bắt đầu)" : ""}
        </>
      )}
    </p>
  );
}

const IMAGE_ACCEPT = SHIFT_PART_IMAGE_MIME.join(",");

function checkImage(file: File): string | null {
  if (!(SHIFT_PART_IMAGE_MIME as readonly string[]).includes(file.type)) return "Chỉ nhận ảnh JPG, PNG hoặc WEBP.";
  if (file.size > SHIFT_PART_IMAGE_MAX_BYTES) return `Ảnh vượt quá ${SHIFT_PART_IMAGE_MAX_BYTES / 1024 / 1024}MB.`;
  return null;
}

/** Chọn ảnh khi THÊM mã (lưu sau khi tạo mã xong). Xem trước bằng object URL. */
function ImagePicker({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File | null) => void }) {
  const id = React.useId();
  const preview = React.useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  React.useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  return (
    <div className="text-sm text-zinc-600 dark:text-zinc-400">
      {label}
      <div className="mt-0.5 flex items-center gap-2">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700 md:h-9 md:w-9">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- xem trước file cục bộ
            <img src={preview} alt="Ảnh đã chọn" className="h-full w-full object-contain" />
          ) : (
            <ImagePlus className="h-5 w-5 text-zinc-400" aria-hidden="true" />
          )}
        </span>
        <label
          htmlFor={id}
          className="inline-flex h-11 min-w-0 flex-1 cursor-pointer items-center rounded-lg border border-zinc-200 bg-white px-3 text-md text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 md:h-9"
        >
          <span className="truncate">{file ? file.name : "Chọn / chụp ảnh…"}</span>
        </label>
        {file ? (
          <button type="button" onClick={() => onPick(null)} className="h-11 rounded-lg px-2 text-md text-zinc-500 md:h-9" aria-label="Bỏ ảnh đã chọn">
            Bỏ
          </button>
        ) : null}
        <input
          id={id}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (!f) return;
            const bad = checkImage(f);
            if (bad) toast.error(bad);
            else onPick(f);
          }}
        />
      </div>
    </div>
  );
}

/** Sửa mã: ảnh hiện tại (khung lớn, chạm phóng to) + Thay / Gỡ — lưu NGAY. */
function PartImageEditor({ part, onChanged }: { part: CatalogItem; onChanged: (row: CatalogItem) => void }) {
  const upload = useUploadPartImage();
  const remove = useRemovePartImage();
  const inputId = React.useId();
  const busy = upload.isPending || remove.isPending;
  const onFile = async (f: File) => {
    const bad = checkImage(f);
    if (bad) {
      toast.error(bad);
      return;
    }
    try {
      onChanged(await upload.mutateAsync({ partId: part.id, file: f }));
      toast.success("Đã lưu ảnh");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const onRemove = async () => {
    try {
      onChanged((await remove.mutateAsync(part.id)).data);
      toast.success("Đã gỡ ảnh");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  return (
    <div className="flex items-center gap-3 sm:col-span-2">
      <PartImage partId={part.id} assetId={part.imageAssetId} size={96} alt={`${part.code ?? ""} — ${part.name ?? ""}`} />
      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={inputId}
          className={cn(
            "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-md font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 md:min-h-9",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
          {upload.isPending ? "Đang tải…" : part.imageAssetId ? "Thay ảnh" : "Thêm ảnh"}
        </label>
        <input
          id={inputId}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFile(f);
          }}
        />
        {part.imageAssetId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRemove()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-md font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-950/40 md:min-h-9"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Gỡ ảnh
          </button>
        ) : null}
        <p className="w-full text-sm text-zinc-500">JPG / PNG / WEBP, tối đa {SHIFT_PART_IMAGE_MAX_BYTES / 1024 / 1024}MB.</p>
      </div>
    </div>
  );
}

function FieldInput({ f, value, onChange }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const id = React.useId();
  if (f.type === "bool") {
    return (
      <label htmlFor={id} className="flex min-h-11 items-center gap-2 self-end text-md text-zinc-700 dark:text-zinc-300">
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-indigo-600" />
        {f.label}
      </label>
    );
  }
  return (
    <label htmlFor={id} className="text-sm text-zinc-600 dark:text-zinc-400">
      {f.label}
      {f.required ? <span className="text-red-500"> *</span> : null}
      <input
        id={id}
        type={f.type === "time" ? "time" : "text"}
        inputMode={f.type === "number" ? "numeric" : undefined}
        required={f.required}
        value={value == null ? "" : String(value)}
        placeholder={f.placeholder}
        onChange={(e) => onChange(f.type === "code" ? e.target.value.toUpperCase() : f.type === "number" ? e.target.value.replace(/[^0-9]/g, "") : e.target.value)}
        className={cn(inputCls, f.type === "code" && "font-mono")}
      />
    </label>
  );
}

function SiteSettings({ ctx, canManage }: { ctx: ShiftContext; canManage: boolean }) {
  const update = useUpdateSite();
  const [v, setV] = React.useState({
    name: ctx.site.name,
    lockAfterHours: String(ctx.site.lockAfterHours),
    backdateDays: String(ctx.site.backdateDays),
    ngWarnPct: String(ctx.site.ngWarnPct),
  });
  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id: ctx.site.id,
        name: v.name.trim(),
        lockAfterHours: Number(v.lockAfterHours),
        backdateDays: Number(v.backdateDays),
        ngWarnPct: Number(v.ngWarnPct),
      });
      toast.success("Đã lưu thiết lập xưởng");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const row = (label: string, key: keyof typeof v, hint: string, numeric = true) => (
    <label className="text-sm text-zinc-600 dark:text-zinc-400">
      {label}
      <input
        disabled={!canManage}
        inputMode={numeric ? "numeric" : undefined}
        value={v[key]}
        onChange={(e) => setV({ ...v, [key]: numeric ? e.target.value.replace(/[^0-9.]/g, "") : e.target.value })}
        className={inputCls}
      />
      <span className="mt-0.5 block text-sm text-zinc-500">{hint}</span>
    </label>
  );
  return (
    <Panel title={`${ctx.site.code} — Thiết lập xưởng`} hint={`Múi giờ ${ctx.site.timezone}`}>
      <form onSubmit={(e) => void onSave(e)} className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        {row("Tên xưởng", "name", "Hiện ở tiêu đề + Excel", false)}
        {row("Tự khoá sau khi hết ca (giờ)", "lockAfterHours", "0–720. Mặc định 24 giờ.")}
        {row("Nhập lùi tối đa (ngày)", "backdateDays", "0–31. Quá hạn cần quản lý nhập.")}
        {row("Ngưỡng cảnh báo %NG", "ngWarnPct", "Vượt ngưỡng → hỏi xác nhận khi lưu.")}
        {canManage ? (
          <div>
            <Button type="submit" size="lg" disabled={update.isPending}>
              {update.isPending ? "Đang lưu…" : "Lưu thiết lập"}
            </Button>
          </div>
        ) : null}
      </form>
    </Panel>
  );
}
