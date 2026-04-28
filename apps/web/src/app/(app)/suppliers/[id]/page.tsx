"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Building2,
  Edit3,
  ExternalLink,
  Mail,
  MapPin,
  Package,
  Phone,
  Save,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { SupplierUpdate } from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DialogConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import {
  useDeleteSupplier,
  useSupplier,
  useSupplierItemsSupplied,
  useSupplierPoStats,
  useSupplierTopItems,
  useUpdateSupplier,
  type SupplierItemSuppliedRow,
  type SupplierTopItemRow,
} from "@/hooks/useSuppliers";

type TabKey = "info" | "items" | "stats";

function formatVnd(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("vi-VN");
  } catch {
    return s;
  }
}

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();

  const query = useSupplier(id || null);
  const update = useUpdateSupplier(id);
  const del = useDeleteSupplier();

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [tab, setTab] = React.useState<TabKey>("info");
  const [itemsSearch, setItemsSearch] = React.useState("");
  const [itemsCategory, setItemsCategory] = React.useState<string>("");

  if (query.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-3 p-6">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const supplier = query.data?.data;
  if (!supplier) {
    return (
      <div className="p-6">
        <EmptyState
          preset="error"
          title="Không tìm thấy nhà cung cấp"
          description="Liên kết có thể đã bị xoá hoặc không đúng."
          actions={
            <Button variant="ghost" size="sm" onClick={() => router.push("/suppliers")}>
              Về danh sách
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <Breadcrumb
        items={[
          { label: "Trang chủ", href: "/" },
          { label: "Nhà cung cấp", href: "/suppliers" },
          { label: supplier.code },
        ]}
        className="mb-2"
      />

      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              {supplier.name}
            </h1>
            <StatusBadge
              status={supplier.isActive ? "active" : "inactive"}
              size="sm"
            />
            {supplier.region ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {supplier.region}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">
            {supplier.code}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {supplier.isActive && !editing && (
            <Button
              size="sm"
              onClick={() => {
                setTab("info");
                setEditing(true);
              }}
            >
              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
              Chỉnh sửa
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={!supplier.isActive}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {supplier.isActive ? "Ngưng hoạt động" : "Đã ngưng"}
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="items">Vật liệu cung cấp</TabsTrigger>
          <TabsTrigger value="stats">Thống kê PO</TabsTrigger>
        </TabsList>

        {/* TAB 1 — Thông tin */}
        <TabsContent value="info">
          {editing ? (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit3 className="h-4 w-4 text-indigo-600" aria-hidden />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Chỉnh sửa thông tin nhà cung cấp
                  </h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                  disabled={update.isPending}
                >
                  <X className="h-3.5 w-3.5" aria-hidden /> Đóng
                </Button>
              </div>

              <SupplierForm
                defaultValues={{
                  code: supplier.code,
                  name: supplier.name,
                  contactName: supplier.contactName,
                  phone: supplier.phone,
                  email: supplier.email,
                  address: supplier.address,
                  taxCode: supplier.taxCode,
                  region: supplier.region ?? null,
                  city: supplier.city ?? null,
                  ward: supplier.ward ?? null,
                  streetAddress: supplier.streetAddress ?? null,
                  factoryAddress: supplier.factoryAddress ?? null,
                  latitude: supplier.latitude
                    ? (Number(supplier.latitude) as unknown as number)
                    : null,
                  longitude: supplier.longitude
                    ? (Number(supplier.longitude) as unknown as number)
                    : null,
                  website: supplier.website ?? null,
                  bankInfo: supplier.bankInfo ?? {
                    name: null,
                    account: null,
                    branch: null,
                  },
                  paymentTerms: supplier.paymentTerms ?? null,
                  contactPersons: supplier.contactPersons ?? [],
                  internalNotes: supplier.internalNotes ?? null,
                }}
                submitting={update.isPending}
                onSubmit={async (data) => {
                  try {
                    const patch: SupplierUpdate = {
                      name: data.name,
                      contactName: data.contactName,
                      phone: data.phone,
                      email: data.email,
                      address: data.address,
                      taxCode: data.taxCode,
                      region: data.region,
                      city: data.city,
                      ward: data.ward,
                      streetAddress: data.streetAddress,
                      factoryAddress: data.factoryAddress,
                      latitude: data.latitude,
                      longitude: data.longitude,
                      website: data.website,
                      bankInfo: data.bankInfo,
                      paymentTerms: data.paymentTerms,
                      contactPersons: data.contactPersons,
                      internalNotes: data.internalNotes,
                    };
                    await update.mutateAsync(patch);
                    toast.success("Đã cập nhật nhà cung cấp");
                    setEditing(false);
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              />
            </div>
          ) : (
            <InfoTab supplier={supplier} />
          )}
        </TabsContent>

        {/* TAB 2 — Vật liệu cung cấp */}
        <TabsContent value="items">
          <ItemsTab
            supplierId={id}
            search={itemsSearch}
            onSearch={setItemsSearch}
            category={itemsCategory}
            onCategory={setItemsCategory}
          />
        </TabsContent>

        {/* TAB 3 — Thống kê PO */}
        <TabsContent value="stats">
          <StatsTab supplierId={id} />
        </TabsContent>
      </Tabs>

      <DialogConfirm
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Ngưng hoạt động NCC "${supplier.code}"?`}
        description="NCC sẽ bị ẩn khỏi danh sách mặc định."
        actionLabel="Ngưng hoạt động"
        loading={del.isPending}
        onConfirm={async () => {
          try {
            await del.mutateAsync(supplier.id);
            toast.success(`Đã ngưng NCC ${supplier.code}.`);
            setDeleteOpen(false);
            router.push("/suppliers");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </div>
  );
}

/* =========================================================================== */
/*  InfoTab                                                                    */
/* =========================================================================== */

function InfoTab({
  supplier,
}: {
  supplier: ReturnType<typeof useSupplier>["data"] extends
    | { data: infer T }
    | undefined
    ? T
    : never;
}) {
  if (!supplier) return null;

  const hasGeo =
    supplier.latitude != null &&
    supplier.longitude != null &&
    supplier.latitude !== "" &&
    supplier.longitude !== "";
  const mapsUrl = hasGeo
    ? `https://www.google.com/maps?q=${supplier.latitude},${supplier.longitude}`
    : null;

  const bank = supplier.bankInfo ?? null;
  const contacts = Array.isArray(supplier.contactPersons)
    ? supplier.contactPersons
    : [];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Thông tin chung */}
      <Card icon={<Building2 className="h-4 w-4" />} title="Thông tin chung">
        <DL>
          <DT>Mã</DT>
          <DD mono>{supplier.code}</DD>
          <DT>Tên</DT>
          <DD>{supplier.name}</DD>
          <DT>Mã số thuế</DT>
          <DD mono>{supplier.taxCode ?? "—"}</DD>
          <DT>Website</DT>
          <DD>
            {supplier.website ? (
              <a
                href={supplier.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
              >
                {supplier.website}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            ) : (
              "—"
            )}
          </DD>
        </DL>
      </Card>

      {/* Liên hệ */}
      <Card icon={<Phone className="h-4 w-4" />} title="Liên hệ">
        <DL>
          <DT>Người liên hệ</DT>
          <DD>{supplier.contactName ?? "—"}</DD>
          <DT>Điện thoại</DT>
          <DD>
            {supplier.phone ? (
              <a
                href={`tel:${supplier.phone}`}
                className="tabular-nums text-indigo-600 hover:text-indigo-700"
              >
                {supplier.phone}
              </a>
            ) : (
              "—"
            )}
          </DD>
          <DT>Email</DT>
          <DD>
            {supplier.email ? (
              <a
                href={`mailto:${supplier.email}`}
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
              >
                <Mail className="h-3 w-3" aria-hidden="true" />
                {supplier.email}
              </a>
            ) : (
              "—"
            )}
          </DD>
        </DL>
        {contacts.length > 0 ? (
          <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Liên hệ bổ sung ({contacts.length})
            </p>
            <ul className="space-y-2">
              {contacts.map((c, idx) => (
                <li key={idx} className="rounded border border-zinc-200 p-2 text-xs">
                  <div className="font-medium text-zinc-900">{c.name}</div>
                  {c.role ? (
                    <div className="text-zinc-600">{c.role}</div>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-3 text-zinc-600">
                    {c.phone ? (
                      <span className="tabular-nums">{c.phone}</span>
                    ) : null}
                    {c.email ? <span>{c.email}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {/* Địa chỉ */}
      <Card icon={<MapPin className="h-4 w-4" />} title="Địa chỉ">
        <DL>
          <DT>Khu vực</DT>
          <DD>{supplier.region ?? "—"}</DD>
          <DT>Tỉnh / TP</DT>
          <DD>{supplier.city ?? "—"}</DD>
          <DT>Phường / Xã</DT>
          <DD>{supplier.ward ?? "—"}</DD>
          <DT>Địa chỉ</DT>
          <DD>
            {supplier.streetAddress ??
              supplier.address ??
              "—"}
          </DD>
          {supplier.factoryAddress ? (
            <>
              <DT>Nhà máy</DT>
              <DD>{supplier.factoryAddress}</DD>
            </>
          ) : null}
        </DL>
        {mapsUrl ? (
          <div className="mt-3">
            <Button asChild size="sm" variant="outline">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Xem trên Google Maps
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </Button>
          </div>
        ) : null}
      </Card>

      {/* Ngân hàng + Điều khoản */}
      <Card title="Ngân hàng & Thanh toán">
        <DL>
          <DT>Ngân hàng</DT>
          <DD>{bank?.name ?? "—"}</DD>
          <DT>Số tài khoản</DT>
          <DD mono>{bank?.account ?? "—"}</DD>
          <DT>Chi nhánh</DT>
          <DD>{bank?.branch ?? "—"}</DD>
          <DT>Điều khoản</DT>
          <DD>{supplier.paymentTerms ?? "—"}</DD>
        </DL>
      </Card>
    </div>
  );
}

/* =========================================================================== */
/*  ItemsTab                                                                   */
/* =========================================================================== */

function ItemsTab({
  supplierId,
  search,
  onSearch,
  category,
  onCategory,
}: {
  supplierId: string;
  search: string;
  onSearch: (v: string) => void;
  category: string;
  onCategory: (v: string) => void;
}) {
  const router = useRouter();
  const [debounced, setDebounced] = React.useState(search);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const q = useSupplierItemsSupplied(supplierId, {
    q: debounced || undefined,
    category: category || undefined,
  });

  const rows: SupplierItemSuppliedRow[] = q.data?.data ?? [];

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set).sort();
  }, [rows]);

  const total = q.data?.meta.total ?? 0;
  const topCategory = React.useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const key = r.category ?? "—";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    let best = "—";
    let bestN = 0;
    map.forEach((v, k) => {
      if (v > bestN) {
        best = k;
        bestN = v;
      }
    });
    return best;
  }, [rows]);

  const topPriced = React.useMemo(() => {
    let max = 0;
    let name = "—";
    rows.forEach((r) => {
      const p = r.priceRef ? Number(r.priceRef) : 0;
      if (p > max) {
        max = p;
        name = r.sku;
      }
    });
    return { sku: name, price: max };
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* KPI mini */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MiniKpi
          label="Tổng items cung cấp"
          value={total.toLocaleString("vi-VN")}
          icon={<Package className="h-4 w-4" />}
        />
        <MiniKpi label="Nhóm nhiều nhất" value={topCategory} />
        <MiniKpi
          label={`Giá cao nhất${topPriced.sku !== "—" ? ` (${topPriced.sku})` : ""}`}
          value={topPriced.price > 0 ? formatVnd(topPriced.price) : "—"}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          size="sm"
          placeholder="Tìm SKU / tên vật tư"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-[280px]"
          aria-label="Tìm vật tư"
        />
        <select
          value={category}
          onChange={(e) => onCategory(e.target.value)}
          className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
          aria-label="Lọc nhóm"
        >
          <option value="">Tất cả nhóm</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          preset="no-data"
          title="Chưa có vật tư gắn với NCC này"
          description='Gắn vật tư từ trang chi tiết vật tư → tab "Nhà cung cấp".'
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <table className="min-w-full border-collapse text-base">
            <thead className="bg-zinc-50">
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                <th className="h-8 px-3 w-[140px]">SKU</th>
                <th className="h-8 px-3">Tên</th>
                <th className="h-8 px-3 w-[120px]">Nhóm</th>
                <th className="h-8 px-3 w-[100px]">Lead time</th>
                <th className="h-8 px-3 w-[140px] text-right">Giá tham khảo</th>
                <th className="h-8 px-3 w-[60px]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="h-9 cursor-pointer border-t border-zinc-100 hover:bg-zinc-50"
                  onClick={() => router.push(`/items/${r.itemId}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/items/${r.itemId}`);
                    }
                  }}
                >
                  <td className="px-3 font-mono text-sm text-zinc-900">
                    {r.sku}
                    {r.isPreferred ? (
                      <span className="ml-1 inline-flex items-center rounded bg-indigo-50 px-1 py-0.5 text-[10px] font-medium text-indigo-700">
                        ưu tiên
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 text-zinc-900">{r.name}</td>
                  <td className="px-3 text-zinc-600">{r.category ?? "—"}</td>
                  <td className="px-3 tabular-nums text-zinc-600">
                    {r.leadTimeDays} ngày
                  </td>
                  <td className="px-3 text-right tabular-nums text-zinc-900">
                    {r.priceRef
                      ? `${Number(r.priceRef).toLocaleString("vi-VN")} ${r.currency}`
                      : "—"}
                  </td>
                  <td className="px-3 text-right">
                    <Link
                      href={`/items/${r.itemId}`}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Xem
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* =========================================================================== */
/*  StatsTab                                                                   */
/* =========================================================================== */

function StatsTab({ supplierId }: { supplierId: string }) {
  const stats = useSupplierPoStats(supplierId);
  const top = useSupplierTopItems(supplierId, 10);

  if (stats.isLoading) return <Skeleton className="h-64 w-full" />;
  const d = stats.data?.data;
  if (!d) {
    return (
      <EmptyState
        preset="error"
        title="Không tải được thống kê"
        description="Thử lại sau hoặc báo admin."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniKpi
          label="Tổng PO"
          value={d.totalPoCount.toLocaleString("vi-VN")}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <MiniKpi
          label="Chi tiêu YTD"
          value={formatVnd(d.ytdSpend)}
          sublabel={`${d.ytdPoCount} PO năm nay`}
        />
        <MiniKpi
          label="Lead time trung bình"
          value={`${d.avgLeadTimeDays.toFixed(1)} ngày`}
        />
        <MiniKpi
          label="Tỷ lệ đúng hẹn"
          value={`${d.onTimeRate.toFixed(1)}%`}
        />
      </div>

      {/* Top items bought */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Top vật tư đã mua
          </h3>
        </div>
        {top.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (top.data?.data ?? []).length === 0 ? (
          <EmptyState preset="no-data" title="Chưa có PO nào với NCC này" />
        ) : (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <table className="min-w-full border-collapse text-base">
              <thead className="bg-zinc-50">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <th className="h-8 px-3 w-[140px]">SKU</th>
                  <th className="h-8 px-3">Tên</th>
                  <th className="h-8 px-3 w-[80px] text-right">PO</th>
                  <th className="h-8 px-3 w-[120px] text-right">Tổng SL</th>
                  <th className="h-8 px-3 w-[160px] text-right">Tổng tiền</th>
                  <th className="h-8 px-3 w-[120px]">Mua gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {(top.data?.data ?? []).map((r: SupplierTopItemRow) => (
                  <tr
                    key={r.itemId}
                    className="h-9 border-t border-zinc-100 hover:bg-zinc-50"
                  >
                    <td className="px-3 font-mono text-sm text-zinc-900">
                      {r.sku}
                    </td>
                    <td className="px-3 text-zinc-900">{r.name}</td>
                    <td className="px-3 text-right tabular-nums text-zinc-600">
                      {r.poCount}
                    </td>
                    <td className="px-3 text-right tabular-nums text-zinc-600">
                      {Number(r.totalQty).toLocaleString("vi-VN")} {r.uom}
                    </td>
                    <td className="px-3 text-right tabular-nums text-zinc-900">
                      {formatVnd(r.totalSpend)}
                    </td>
                    <td className="px-3 text-zinc-600">
                      {formatDate(r.lastOrderDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent PO */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            PO gần đây
          </h3>
          <Link
            href={`/procurement/purchase-orders?supplierId=${supplierId}`}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            Xem tất cả →
          </Link>
        </div>
        {d.recentPurchaseOrders.length === 0 ? (
          <EmptyState preset="no-data" title="Chưa có PO nào" />
        ) : (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <table className="min-w-full border-collapse text-base">
              <thead className="bg-zinc-50">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <th className="h-8 px-3 w-[160px]">PO No</th>
                  <th className="h-8 px-3 w-[120px]">Trạng thái</th>
                  <th className="h-8 px-3 w-[120px]">Ngày đặt</th>
                  <th className="h-8 px-3 w-[120px]">ETA</th>
                  <th className="h-8 px-3 w-[160px] text-right">Giá trị</th>
                </tr>
              </thead>
              <tbody>
                {d.recentPurchaseOrders.map((po) => (
                  <tr
                    key={po.id}
                    className="h-9 cursor-pointer border-t border-zinc-100 hover:bg-zinc-50"
                    onClick={() =>
                      (window.location.href = `/procurement/purchase-orders/${po.id}`)
                    }
                  >
                    <td className="px-3 font-mono text-sm text-zinc-900">
                      {po.poNo}
                    </td>
                    <td className="px-3">
                      <span className="inline-flex items-center rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                        {po.status}
                      </span>
                    </td>
                    <td className="px-3 text-zinc-600">
                      {formatDate(po.orderDate)}
                    </td>
                    <td className="px-3 text-zinc-600">
                      {formatDate(po.expectedEta)}
                    </td>
                    <td className="px-3 text-right tabular-nums text-zinc-900">
                      {formatVnd(po.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================== */
/*  Presentational helpers                                                     */
/* =========================================================================== */

function Card({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-zinc-700">
        {icon}
        <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function DL({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-sm">
      {children}
    </dl>
  );
}
function DT({ children }: { children: React.ReactNode }) {
  return <dt className="text-xs uppercase tracking-wider text-zinc-500">{children}</dt>;
}
function DD({
  children,
  mono,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <dd className={mono ? "font-mono text-sm text-zinc-900" : "text-zinc-900"}>
      {children}
    </dd>
  );
}

function MiniKpi({
  label,
  value,
  sublabel,
  icon,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
        {value}
      </div>
      {sublabel ? (
        <div className="mt-0.5 text-xs text-zinc-500">{sublabel}</div>
      ) : null}
    </div>
  );
}
