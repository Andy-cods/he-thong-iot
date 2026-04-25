# Redesign V3 — UI Specification (Phase 1)

**Ngày:** 2026-04-25
**Phạm vi:** UI/UX spec cho Phase 1 Quick-wins (3 tuần) theo Phương án C — Hybrid lean.
**Tham chiếu:**
- Brainstorm: [`plans/redesign-v3/brainstorm.md`](./brainstorm.md) — bám sát §3, §4 (Q1-Q10), §6, §9.2.
- Design system: [`docs/design-guidelines-v2.md`](../../docs/design-guidelines-v2.md) — palette zinc + electric blue, font Inter.
- Sidebar hiện tại: [`apps/web/src/lib/nav-items.ts`](../../apps/web/src/components/../lib/nav-items.ts), [`apps/web/src/components/layout/Sidebar.tsx`](../../apps/web/src/components/layout/Sidebar.tsx).
- Components có sẵn: [`apps/web/src/components/domain/`](../../apps/web/src/components/domain/) → KpiCard, OrdersReadinessTable, BomKpiCard, StatusBadge, SystemHealthCard, AlertsList.
- Synonym dict: [`apps/web/src/lib/import-mapping.ts`](../../apps/web/src/lib/import-mapping.ts).
- File Excel mẫu: `Bản chính thức 20260324_ Z0000002-502653 Z0000002-502654_ BOM trien khai_sl 02 + 02.xlsx` (3 sheet, sheet 1+2 BOM project, sheet 3 Material&Process).

**Output:** 4 nhóm thiết kế — A. Sidebar V2 (regroup 4-5 bộ phận), B. Trang Tổng quan `/`, C. PO Detail tickbox receiving, D. Excel BOM Importer V1 wizard 3 bước.

---

## 0. Mục lục

- §1. Nguyên tắc thiết kế áp dụng (5 principle)
- §2. Design tokens cần dùng (tham chiếu hiện có)
- §3. Component reuse vs new
- §4. Accessibility chung
- §5. Dark mode (defer)
- §A. Sidebar V2 — 5 bộ phận
- §B. Trang Tổng quan `/`
- §C. PO Detail — Tickbox receiving per-line
- §D. Excel BOM Importer V1 — Wizard 3 bước
- §E. Phụ lục — synonym dict mở rộng + ASCII reference

---

## 1. Nguyên tắc thiết kế áp dụng (5 principle)

### 1.1. Tôn trọng design tokens hiện có — KHÔNG invent palette mới
Design system V2 (zinc + electric blue) đã chốt và đang chạy production. Mọi spec dưới đây chỉ dùng token có sẵn. Không thêm hex code mới. Mọi shortage/critical state phải chuyển sang token semantic đã định nghĩa (`orange-500` = shortage; `red-500` = critical; `amber-500` = warning).

### 1.2. KISS — wizard 3 bước max, không over-flow
Excel importer chỉ 3 step. Drilldown dashboard không qua modal mà redirect về module gốc với filter pre-applied (Q7). Tickbox receiving không bóc tách thêm wizard — tick → "Lưu nhận hàng" cuối table. Mọi dialog đa-bước >3 step sẽ bị chặn ở review.

### 1.3. Tiếng Việt 100% trong UI labels
Mọi label hiển thị cho user là tiếng Việt. Kỹ thuật terms tiếng Anh OK trong tooltip, mã lỗi, console log, audit. SKU/PO code/lot code giữ tiếng Anh vì là mã định danh. Diacritical marks (ă, â, đ, ê, ô, ơ, ư) phải render đúng — Inter font có hỗ trợ Vietnamese subset.

### 1.4. Mobile-second — phase 1 chỉ tickbox PWA + dashboard mobile collapse
PWA priority chỉ ở 2 nơi: (a) tickbox receiving cho operator kho; (b) dashboard tổng quan dùng accordion mobile. Importer Excel phase 1 desktop/tablet only — mobile defer phase 2. Sidebar mobile drawer giữ pattern V2 hiện có (280px slide-in).

### 1.5. Drilldown qua route filter — không modal duplicate
Mọi click vào progress bar / KPI card sẽ navigate sang module gốc với query param filter pre-applied. Ví dụ: click "Mua bán 75%" → `/procurement/purchase-orders?status=PENDING&deliveryStatus=DELAYED`. Không tạo `<DrilldownModal>` mới — tránh DRY violation và double-source-of-truth UI.

---

## 2. Design tokens cần dùng (tham chiếu hiện có)

### 2.1. Color tokens

| Token | Hex | Usage trong V3 |
|---|---|---|
| `zinc-50` | `#FAFAFA` | Page bg dashboard |
| `zinc-100` | `#F4F4F5` | Row hover, skeleton, accordion bg mobile |
| `zinc-200` | `#E4E4E7` | Card border, divider, table border |
| `zinc-300` | `#D4D4D8` | Input border default, button outline |
| `zinc-400` | `#A1A1AA` | Icon muted, tooltip trigger, placeholder |
| `zinc-500` | `#71717A` | Meta text "Cập nhật cách đây 12s", helper |
| `zinc-600` | `#52525B` | Body secondary, table row meta |
| `zinc-700` | `#3F3F46` | Section heading sidebar |
| `zinc-900` | `#18181B` | H1 page title, KPI value, table cell strong |
| `zinc-950` | `#09090B` | BulkActionBar (commit Excel import), command palette bg |
| `blue-500` | `#3B82F6` | Primary CTA "Lưu nhận hàng", focus ring, link drilldown |
| `blue-600` | `#2563EB` | Button primary hover, PWA focus ring |
| `blue-700` | `#1D4ED8` | Selected text active sidebar (đang dùng `indigo-700` legacy → V3 migrate sang `blue-700`) |
| `emerald-500` | `#10B981` | Progress bar OK ≥80%, "Đã nhận đủ" badge, status dot success |
| `amber-500` | `#F59E0B` | Progress bar warning 50-80%, PR pending |
| `red-500` | `#EF4444` | Progress bar critical <50%, validation error import wizard |
| `orange-500` | `#F97316` | **Chỉ** dùng cho shortage badge — KHÔNG dùng cho progress bar |

**Lưu ý:** sidebar V2 hiện đang dùng `indigo-500/600/700` legacy. V3 KHÔNG đụng — giữ nguyên indigo cho active state để khỏi gây regression toàn app. Chỉ dashboard mới + tickbox + import wizard dùng `blue-500/600/700` theo design-guidelines-v2.

### 2.2. Spacing tokens (8px grid)

| Token | Px | Usage trong V3 |
|---|---|---|
| `gap-1` | 4 | Icon-text inline gap progress label |
| `gap-2` | 8 | Tickbox-qty input gap, tooltip padding |
| `gap-3` | 12 | Progress card internal padding, table cell padding-x |
| `gap-4` | 16 | Card padding, dashboard grid gap mobile |
| `gap-5` | 20 | Form section padding wizard, dialog body |
| `gap-6` | 24 | Dashboard grid gap desktop, page padding-x |
| `gap-8` | 32 | Page padding-y desktop, hero spacing |

### 2.3. Typography tokens

| Token | Px | Weight | Usage trong V3 |
|---|---|---|---|
| `text-xs` 11px | 11 | 500 | Section uppercase sidebar "BỘ PHẬN KHO", progress card subtitle "120/150" |
| `text-sm` 12px | 12 | 400 | Tooltip body, helper "Cập nhật 12s trước", table meta |
| `text-base` 13px | 13 | 400 | Body default, table cell, sidebar nav item |
| `text-md` 14px | 14 | 500 | Button label, PWA tickbox label, wizard step text |
| `text-lg` 15px | 15 | 600 | Card title "Linh kiện sẵn sàng", dialog title |
| `text-xl` 17px | 17 | 600 | Section heading "6 Tiến độ chính" |
| `text-2xl` 20px | 20 | 600 | H1 page "Tổng quan" |
| `text-3xl` 24px | 24 | 500 | KPI value large, progress percent hero |
| `text-4xl` 28px | 28 | 600 | **Progress bar percent hero** (80%, 65%) — NEW, V3-specific |

**Vietnamese:** Inter font v4.0+ đã hỗ trợ Vietnamese subset đầy đủ. Verify diacritics: "Bộ phận Kỹ thuật", "Đặt hàng", "Đã nhận đủ".

### 2.4. Component primitive (shadcn)

Tất cả primitives đã có trong codebase (`apps/web/src/components/ui/`):
- `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardContent>` — wrapper progress card.
- `<Tabs>`, `<TabsList>`, `<TabsTrigger>` — wizard step indicator (alternative).
- `<Table>`, `<TableHeader>`, `<TableRow>`, `<TableCell>` — PO line table với tickbox column.
- `<Sheet>` — không dùng ở V3 phase 1 (đã quyết drilldown route, không modal).
- `<Toast>` (Sonner) — confirm "Đã ghi nhận 5/10 line".
- `<Progress>` — progress bar 6 cards (height h-2 = 8px).
- `<Checkbox>` — tickbox receiving (radix `<Checkbox>`).
- `<Input>` type=number — qty input bên cạnh tickbox.
- `<Button>` size sm/default/lg.
- `<Tooltip>` — hover progress card hiện công thức.

---

## 3. Component reuse vs new

| Component | Status | File path | Ghi chú |
|---|---|---|---|
| `<Sidebar>` | Reuse | `apps/web/src/components/layout/Sidebar.tsx` | Chỉ đổi data prop từ `nav-items.ts`, không edit Sidebar.tsx |
| `<KpiCard>` | Reuse | `apps/web/src/components/domain/KpiCard.tsx` | Dùng cho hàng KPI 4 card phía dưới progress |
| `<OrdersReadinessTable>` | Reuse | `apps/web/src/components/domain/OrdersReadinessTable.tsx` | Hiển thị 5 sales order top |
| `<AlertsList>` | Reuse | `apps/web/src/components/domain/AlertsList.tsx` | Top 5 alert list |
| `<StatusBadge>` | Reuse | `apps/web/src/components/domain/StatusBadge.tsx` | Status indicator trong PO line table |
| `<DashboardOverviewPage>` | NEW | `apps/web/src/app/(app)/page.tsx` (thay redirect) | Server component aggregator |
| `<ProgressBarStack>` | NEW | `apps/web/src/components/domain/ProgressBarStack.tsx` | Wrapper grid 6 progress bar card |
| `<ProgressBarCard>` | NEW | `apps/web/src/components/domain/ProgressBarCard.tsx` | Card đơn cho 1 metric — hero %, stripe, subtitle, drilldown link |
| `<DashboardHeader>` | NEW | `apps/web/src/components/domain/DashboardHeader.tsx` | Title + last-updated + manual refresh button |
| `<DrilldownLink>` | NEW | `apps/web/src/components/domain/DrilldownLink.tsx` | `<Link>` wrapper với analytics + aria-label, dùng cho progress card click |
| `<PoLineReceivingTickbox>` | NEW | `apps/web/src/components/domain/PoLineReceivingTickbox.tsx` | Tickbox + qty input + status indicator per PO line |
| `<PoReceivingFormFooter>` | NEW | `apps/web/src/components/domain/PoReceivingFormFooter.tsx` | Sticky bottom bar trong PO detail: "Đã chọn 5/10 line · Lưu nhận hàng" |
| `<BomImportWizard>` | NEW | `apps/web/src/app/(app)/import/bom/_components/BomImportWizard.tsx` | Container wizard 3 bước |
| `<SheetPickerStep>` | NEW | `apps/web/src/app/(app)/import/bom/_components/SheetPickerStep.tsx` | Step 1 — upload + chọn sheet |
| `<MapColumnsStep>` | NEW | `apps/web/src/app/(app)/import/bom/_components/MapColumnsStep.tsx` | Step 2 — map cột |
| `<PreviewCommitStep>` | NEW | `apps/web/src/app/(app)/import/bom/_components/PreviewCommitStep.tsx` | Step 3 — preview + commit |
| `<WizardStepper>` | NEW | `apps/web/src/components/domain/WizardStepper.tsx` | Visual step indicator 1→2→3 (reusable) |

**Tổng:** 12 component mới. Trong đó 4 là sub-component bên trong `<BomImportWizard>` — không phải top-level.

---

## 4. Accessibility chung

### 4.1. Tickbox PWA (Section C)
- **Tap target ≥44px** — wrapper `<label>` h-11 (44px) min, padding-y đủ rộng. Container row trong table tăng từ h-9 → h-12 (48px) khi viewport <768px.
- Label rõ tiếng Việt: "Đánh dấu line {sku} đã nhận đủ".
- `aria-checked={true|false|"mixed"}` — mixed khi user đã tick nhưng nhập qty ≠ ordered (partial received).
- `aria-describedby` link tới helper text dưới input qty: "Mặc định bằng SL đặt. Sửa nếu nhận thiếu/thừa."
- Mobile keyboard: `<input type="number" inputMode="numeric" pattern="[0-9]*">` để bật numeric keyboard iOS/Android.

### 4.2. Progress bar cards (Section B)
- `role="progressbar"` + `aria-valuemin={0}` + `aria-valuemax={100}` + `aria-valuenow={percent}` + `aria-valuetext="120 trên 150 linh kiện sẵn sàng"`.
- Tooltip dùng `<Tooltip>` shadcn → `aria-describedby` tự động. Trigger `<button>` với icon `<HelpCircle>` 12px bên cạnh title.
- Color đi kèm icon — không **chỉ** dựa màu để truyền semantic. Card warning có icon `<AlertTriangle>` 14px, critical có icon `<AlertOctagon>`. WCAG 1.4.1.

### 4.3. Drilldown link
- `aria-label="Xem chi tiết Mua bán: 45 PO đang chờ"` — full sentence.
- Visible focus ring: `focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2` (theo design-guidelines-v2 §8).
- Cmd/Ctrl+click → open new tab (Next.js `<Link>` mặc định). User power-user expect.

### 4.4. Wizard step indicator
- `<ol>` với `aria-label="Tiến trình import: bước {current}/3"`.
- Step active: `aria-current="step"`.
- Step done: `<span aria-label="Đã hoàn thành">` + icon `<Check>`.
- Step upcoming: `aria-disabled="true"`, không tab focus được.

### 4.5. Color contrast WCAG AA min 4.5:1
- Đã verify trong design-guidelines-v2 §2.2: blue-500 trên zinc-50 = 4.52:1, blue-600 = 5.17:1, blue-700 = 7.01:1 (AAA).
- Progress bar **stripe color**: emerald-500 trên emerald-50 bg = OK; amber-500 trên amber-50 = OK; red-500 trên red-50 = OK. Verify text `text-emerald-700` cho label "OK" trên emerald-50: 4.85:1 ✓.

### 4.6. Reduced motion
- Mọi transition >150ms wrap trong `@media (prefers-reduced-motion: no-preference)`.
- Progress bar fill animation 300ms → 0ms khi reduced motion.
- Wizard step transition: cross-fade 150ms → instant swap khi reduced.

---

## 5. Dark mode

**Phase 1: KHÔNG làm.** Defer sang phase 3+.

Lý do: design-guidelines-v2 §1 đã ghi "Dark mode: reserve CSS var, không cook toggle V2.0". V3 phase 1 không phá luật này. Mọi token V3 mới (NẾU CÓ) phải định nghĩa dạng CSS var để phase 3 có thể swap. Hiện tại không cần thêm var mới — dùng nguyên token V2.

---

# §A. Sidebar V2 — Regroup 5 bộ phận

## A.1. Mục tiêu

Regroup `nav-items.ts` từ 3 section hiện tại (`production` / `inventory` / `other`) thành 5 section theo bộ phận thực tế của xưởng. KHÔNG đổi width 220px, KHÔNG redesign component `<Sidebar>` — chỉ regroup data + label section.

Lý do 5 thay vì 4: bộ phận **Kế toán** ở phase 1 hiện chưa có module nhưng vẫn show trong sidebar (disabled, badge "Sắp ra mắt") để user biết hệ thống tổng thể có chỗ cho bộ phận này — tạo cảm giác minh bạch + lộ trình. Section thứ 6 "Quản trị" giữ nguyên cho admin.

## A.2. Bảng mapping URL hiện tại → group mới

| URL | Label | Icon hiện tại | Group cũ | Group mới | Icon V3 (đề xuất) | Lý do |
|---|---|---|---|---|---|---|
| `/` | Tổng quan | (chưa có nav item) | — | `overview` | `LayoutDashboard` | NEW landing dashboard |
| `/items` | Danh mục vật tư | `Package` | inventory | `warehouse` | `Package` (giữ) | Items là kho hàng |
| `/lot-serial` | Lot / Serial | `Wrench` | production | `warehouse` | `Boxes` | Lot là tracking tồn kho — đổi icon từ Wrench (sai semantic) sang Boxes |
| `/receiving` | Nhận hàng | `Truck` | inventory | `warehouse` | `Truck` (giữ) | Kho nhận hàng vật lý |
| `/suppliers` | Nhà cung cấp | `Building2` | inventory | `purchasing` | `Building2` (giữ) | Mua bán quản lý NCC |
| `/procurement/purchase-orders` | Đặt hàng (PO) | `ShoppingCart` | inventory | `purchasing` | `ShoppingCart` (giữ) | Mua bán phát PO |
| `/bom` | BOM Templates | `Network` | production | `engineering` | `Network` (giữ) | Engineer thiết kế BOM |
| `/orders` | Đơn hàng | `ClipboardList` | production | `engineering` | `ClipboardList` (giữ) | Engineer explode BOM cho đơn |
| `/work-orders` | Lệnh sản xuất | `Factory` | production | `engineering` | `Factory` (giữ) | Engineer tạo WO |
| `/assembly` | Lắp ráp | `Wrench` | production | `engineering` | `Wrench` (giữ) | Lắp ráp gắn với WO |
| `/procurement/purchase-requests` | Yêu cầu mua (PR) | `ShoppingCart` | inventory | `engineering` | `FileText` | PR là engineer đề xuất → đổi icon từ ShoppingCart (trùng PO) sang FileText cho phân biệt |
| `/import` | Nhập Excel | `FileSpreadsheet` | other | `engineering` | `FileSpreadsheet` (giữ) | Engineer import BOM |
| `/accounting` (placeholder) | Kế toán | — | — | `accounting` | `Calculator` | NEW disabled — Coming soon phase 2 |
| `/admin` | Quản trị | `Shield` | other | `admin` | `Shield` (giữ) | Admin riêng group |

**Section labels (uppercase, text-xs zinc-400):**

```ts
export const NAV_SECTION_LABEL: Record<NavSection, string> = {
  overview: "Tổng quan",
  warehouse: "Bộ phận Kho",
  purchasing: "Bộ phận Mua bán",
  engineering: "Bộ phận Kỹ thuật",
  accounting: "Bộ phận Kế toán",
  admin: "Quản trị",
};

export const NAV_SECTION_ORDER: NavSection[] = [
  "overview",
  "warehouse",
  "purchasing",
  "engineering",
  "accounting",
  "admin",
];
```

**Type update:**
```ts
export type NavSection =
  | "overview"
  | "warehouse"
  | "purchasing"
  | "engineering"
  | "accounting"
  | "admin";
```

## A.3. Mock ASCII sidebar (chiều cao thực tế)

Width 220px, mỗi item h-7 (28px), section label pb-1 pt-1 (~24px tổng), gap-2.5 giữa group (10px).

```
┌──────────────────────────────┐  ← width 220px
│  [CN]  Xưởng IoT             │  h-12 (48px) — Brand header
├──────────────────────────────┤
│                              │
│  TỔNG QUAN                   │  ← section label, text-xs uppercase, py-1
│  ┌────────────────────────┐  │
│  │ ⌘ Tổng quan            │  │  h-7 (28px), active state = blue-50/60 + border-l-2 blue-500
│  └────────────────────────┘  │
│                              │
│  BỘ PHẬN KHO                 │
│  ┌────────────────────────┐  │
│  │ 📦 Danh mục vật tư     │  │  h-7
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ 📊 Lot / Serial        │  │  h-7
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ 🚛 Nhận hàng        2  │  │  h-7, badge "2" = số PO sắp về
│  └────────────────────────┘  │
│                              │
│  BỘ PHẬN MUA BÁN             │
│  ┌────────────────────────┐  │
│  │ 🏢 Nhà cung cấp        │  │  h-7
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ 🛒 Đặt hàng (PO)    5  │  │  h-7, badge "5" = PO chờ duyệt
│  └────────────────────────┘  │
│                              │
│  BỘ PHẬN KỸ THUẬT            │
│  ┌────────────────────────┐  │
│  │ 🌐 BOM Templates       │  │  h-7
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ 📋 Đơn hàng            │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ 🏭 Lệnh sản xuất       │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ 🔧 Lắp ráp             │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ 📄 Yêu cầu mua (PR)    │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ 📑 Nhập Excel          │  │
│  └────────────────────────┘  │
│                              │
│  BỘ PHẬN KẾ TOÁN             │
│  ┌────────────────────────┐  │
│  │ 🧮 Sắp ra mắt          │  │  h-7, disabled, opacity-60, cursor-not-allowed
│  └────────────────────────┘  │   tooltip "Module Kế toán sẽ ra mắt phase 2"
│                              │
│  QUẢN TRỊ                    │
│  ┌────────────────────────┐  │
│  │ 🛡 Quản trị            │  │
│  └────────────────────────┘  │
│                              │
└──────────────────────────────┘
```

**Tổng chiều cao:** ~ 48 (header) + 6 group × (24 label + items × 28 + gap 4) ≈ 540-580px tuỳ role. Trên viewport 768px+ vừa đẹp, không scroll trong 95% case.

**Trên mobile drawer 280px slide-in:** giữ nguyên cấu trúc, chỉ tăng width container từ 220 → 280px.

## A.4. Edge case: user role chỉ có 1 bộ phận

**Vấn đề:** operator role `warehouse` chỉ có quyền vào `/items`, `/lot-serial`, `/receiving`. Filter `filterNavByRoles()` sẽ ẩn các item khác. Vậy có ẩn luôn section "Bộ phận Mua bán", "Bộ phận Kỹ thuật" không?

**Khuyến nghị:** **vẫn show section header với 1 dòng "Không có quyền truy cập" italic zinc-400, KHÔNG ẩn hoàn toàn.**

Lý do:
- Cho user cảm giác hệ thống tổng thể có nhiều bộ phận — họ ý thức được vai trò mình trong workflow.
- Tránh hiện tượng "sidebar trống" khi role hẹp (warehouse chỉ thấy 3 item là quá ít).
- Không gây surprise khi role được mở rộng — section đã có sẵn, chỉ unhide item.

**Implementation:**
```tsx
// Trong Sidebar.tsx (KHÔNG edit, chỉ minh hoạ data flow):
groupNavBySection(items) // V3 update: trả về cả group có 0 item nếu user logged in
  .map(group => (
    <div key={group.section}>
      <p className="...uppercase">{group.label}</p>
      {group.items.length === 0 ? (
        <p className="px-4 py-1 text-base italic text-zinc-400">
          Không có quyền truy cập
        </p>
      ) : (
        <ul>...</ul>
      )}
    </div>
  ))
```

**Trade-off:** sidebar dài hơn ~80px. Chấp nhận được vì viewport 1080p còn dư nhiều.

**Alternative bị từ chối:** ẩn section nếu 0 item → user bối rối khi role mở rộng (section "xuất hiện" như magic).

## A.5. Spec nav-items.ts mới (snippet)

File: `apps/web/src/lib/nav-items.ts`

```ts
import {
  Boxes,
  Building2,
  Calculator,
  ClipboardList,
  Factory,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Network,
  Package,
  ShoppingCart,
  Shield,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavSection =
  | "overview"
  | "warehouse"
  | "purchasing"
  | "engineering"
  | "accounting"
  | "admin";

export const NAV_SECTION_LABEL: Record<NavSection, string> = {
  overview: "Tổng quan",
  warehouse: "Bộ phận Kho",
  purchasing: "Bộ phận Mua bán",
  engineering: "Bộ phận Kỹ thuật",
  accounting: "Bộ phận Kế toán",
  admin: "Quản trị",
};

export const NAV_SECTION_ORDER: NavSection[] = [
  "overview",
  "warehouse",
  "purchasing",
  "engineering",
  "accounting",
  "admin",
];

export const NAV_ITEMS: NavItem[] = [
  // Tổng quan
  { href: "/", label: "Tổng quan", icon: LayoutDashboard, section: "overview" },

  // Bộ phận Kho
  { href: "/items", label: "Danh mục vật tư", icon: Package, entity: "item", section: "warehouse" },
  { href: "/lot-serial", label: "Lot / Serial", icon: Boxes, roles: ["admin","planner","operator","warehouse"], section: "warehouse" },
  { href: "/receiving", label: "Nhận hàng", icon: Truck, roles: ["admin","warehouse"], section: "warehouse" },

  // Bộ phận Mua bán
  { href: "/suppliers", label: "Nhà cung cấp", icon: Building2, entity: "supplier", section: "purchasing" },
  { href: "/procurement/purchase-orders", label: "Đặt hàng (PO)", icon: ShoppingCart, entity: "po", section: "purchasing" },

  // Bộ phận Kỹ thuật
  { href: "/bom", label: "BOM Templates", icon: Network, entity: "bomTemplate", section: "engineering" },
  { href: "/orders", label: "Đơn hàng", icon: ClipboardList, entity: "salesOrder", section: "engineering" },
  { href: "/work-orders", label: "Lệnh sản xuất", icon: Factory, entity: "wo", section: "engineering" },
  { href: "/assembly", label: "Lắp ráp", icon: Wrench, roles: ["admin","planner","operator"], section: "engineering" },
  { href: "/procurement/purchase-requests", label: "Yêu cầu mua (PR)", icon: FileText, entity: "pr", roles: ["admin","planner"], section: "engineering" },
  { href: "/import", label: "Nhập Excel", icon: FileSpreadsheet, roles: ["admin","planner"], section: "engineering" },

  // Bộ phận Kế toán (disabled phase 1)
  { href: "/accounting", label: "Sắp ra mắt", icon: Calculator, disabled: true, comingSoon: "Module Kế toán sẽ có ở phase 2", section: "accounting" },

  // Quản trị
  { href: "/admin", label: "Quản trị", icon: Shield, roles: ["admin"], section: "admin" },
];
```

**Chú ý migration:**
- Item `/lot-serial` đổi icon từ `Wrench` → `Boxes`. Trước đây `Wrench` trùng với `/assembly`.
- Item `/procurement/purchase-requests` đổi icon từ `ShoppingCart` → `FileText` để phân biệt với `/procurement/purchase-orders`.
- Item disabled `/accounting` cần Sidebar.tsx hiện đã hỗ trợ `item.disabled` flag — không cần edit Sidebar.tsx.

## A.6. Edge case khác

| Case | Xử lý |
|---|---|
| User chưa login | AppShell render landing page, sidebar không hiện. Không phải edge case sidebar. |
| Role có 0 item ở mọi section | Show toàn bộ section header với "Không có quyền truy cập". Hiển thị banner top "Tài khoản chưa được cấp quyền — liên hệ admin". |
| Path active không nằm trong nav (vd `/orders/123/edit`) | Sidebar match prefix `/orders` → highlight "Đơn hàng". Logic `matchActive()` giữ nguyên V2. |
| Mobile drawer + role hẹp | Drawer width 280px, scroll y enable. Section "Không có quyền" hiện full. |
| Search command palette (⌘K) | Vẫn dùng full NAV_ITEMS, không filter section. Disabled item filter qua `item.disabled` (đã có logic). |

---

# §B. Trang Tổng quan `/` (NEW)

## B.1. Mục tiêu

Thay redirect `/` → `/bom` hiện tại bằng dashboard tổng quan với 6 progress bar chính + 1 hàng KPI + bảng readiness + alerts. Sếp xưởng / chủ doanh nghiệp khi log in thấy ngay bức tranh tổng — không phải mở 4-5 tab.

## B.2. Layout 1280px max, grid 12-col

### B.2.1. Cấu trúc tổng

```
<DashboardOverviewPage>
├── <DashboardHeader> — title "Tổng quan" + last-updated + refresh button
├── <ProgressBarStack> — 6 cards trong grid 3×2 (desktop) / 2×3 (tablet) / 1×6 (mobile accordion)
│   └── <ProgressBarCard> × 6
├── <KpiCardRow> — 4 KpiCard (Đơn hàng / WO hôm nay / PO chờ duyệt / NCC chờ giao)
├── <OrdersReadinessTable> — 5 sales order top
└── <AlertsList> — top 5 alert
```

### B.2.2. Grid spec

```css
/* Desktop ≥1280px */
.dashboard-grid {
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 24px;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 24px;
}

/* Section spans */
.dashboard-header   { grid-column: span 12; }
.progress-stack     { grid-column: span 12; }       /* 6 card → 3×2 nội bộ */
.kpi-row            { grid-column: span 12; }       /* 4 card → 4×1 */
.orders-table       { grid-column: span 8; }
.alerts-list        { grid-column: span 4; }

/* Tablet 768-1280px */
@media (max-width: 1279px) {
  .progress-stack-grid    { grid-template-columns: 1fr 1fr; }   /* 2×3 */
  .orders-table           { grid-column: span 12; }
  .alerts-list            { grid-column: span 12; }
}

/* Mobile <768px */
@media (max-width: 767px) {
  .dashboard-grid         { padding: 20px 16px; gap: 16px; }
  .progress-stack-grid    { grid-template-columns: 1fr; }       /* 1×6 collapse */
  .progress-stack         { /* accordion mode */ }
  .kpi-row                { grid-template-columns: 1fr 1fr; }   /* 2×2 */
}
```

## B.3. Mock ASCII layout 3 viewport

### B.3.1. Desktop ≥1280px

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Sidebar 220px │  Content max-w 1280px (24px padding)                                  │
│               │                                                                       │
│               │  ┌─────────────────────────────────────────────────────────────────┐ │
│               │  │  Tổng quan                          Cập nhật 12s trước  [↻]    │ │  ← <DashboardHeader>
│               │  └─────────────────────────────────────────────────────────────────┘ │
│               │                                                                       │
│               │  6 TIẾN ĐỘ CHÍNH                                                     │
│               │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │
│               │  │ Linh kiện    │  │ Lắp ráp      │  │ Đặt mua      │                │  ← <ProgressBarCard> × 6
│               │  │              │  │              │  │              │                │  card 380×120px
│               │  │   80%   ⓘ   │  │   65%   ⓘ   │  │   45%   ⓘ   │                │
│               │  │ ████████░░   │  │ ██████░░░░   │  │ ████░░░░░░   │                │
│               │  │ 120/150 ✓    │  │ 78/120 ⚠     │  │ 27/60 ✕      │                │
│               │  │ Xem chi tiết │  │ Xem chi tiết │  │ Xem chi tiết │                │
│               │  └──────────────┘  └──────────────┘  └──────────────┘                │
│               │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │
│               │  │ Nhận hàng    │  │ Sản xuất     │  │ Báo giá / PR │                │
│               │  │              │  │              │  │              │                │
│               │  │   72%   ⓘ   │  │   55%   ⓘ   │  │   88%   ⓘ   │                │
│               │  │ ███████░░░   │  │ █████░░░░░   │  │ █████████░   │                │
│               │  │ 36/50 ✓      │  │ 11/20 ⚠     │  │ 22/25 ✓      │                │
│               │  │ Xem chi tiết │  │ Xem chi tiết │  │ Xem chi tiết │                │
│               │  └──────────────┘  └──────────────┘  └──────────────┘                │
│               │                                                                       │
│               │  HÔM NAY                                                              │
│               │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│               │  │ Đơn hàng │  │ WO hôm   │  │ PO chờ   │  │ NCC chờ  │              │  ← <KpiCard> × 4
│               │  │  đang    │  │   nay    │  │  duyệt   │  │  giao    │              │  h-20 (80px)
│               │  │   12     │  │    8     │  │    5     │  │    3     │              │
│               │  │ +2 ↗     │  │ flat     │  │ +1 ↗     │  │ -1 ↘     │              │
│               │  └──────────┘  └──────────┘  └──────────┘  └──────────┘              │
│               │                                                                       │
│               │  ┌─────────────────────────────────────────┐  ┌───────────────────┐ │
│               │  │ ĐƠN HÀNG SẴN SÀNG (top 5)              │  │ CẢNH BÁO          │ │
│               │  │ PO         KH        Deadline   Ready% │  │ (top 5)           │ │
│               │  │ ─────────  ────────  ─────────  ────── │  │                   │ │
│               │  │ Z0000002   ABC Corp  31/05      85%    │  │ • PO-1234 trễ ETA │ │
│               │  │ Z0000003   DEF Ltd   15/06      60%    │  │ • BOM-501 thiếu   │ │  ← <AlertsList>
│               │  │ Z0000004   GHI Co    20/06      40%    │  │   vật tư POM      │ │
│               │  │ ...                                     │  │ • WO-89 paused 3d │ │
│               │  └─────────────────────────────────────────┘  └───────────────────┘ │
│               │                                                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### B.3.2. Tablet 768-1280px

```
┌─────────────────────────────────────────────────────────────┐
│ Sidebar │  Content (16px padding)                            │
│  220px  │                                                     │
│         │  Tổng quan                  Cập nhật 12s   [↻]    │
│         │                                                     │
│         │  6 TIẾN ĐỘ CHÍNH (grid 2×3)                         │
│         │  ┌─────────────┐  ┌─────────────┐                  │
│         │  │ Linh kiện   │  │ Lắp ráp     │                  │  ← 2 col × 3 row
│         │  │   80%       │  │   65%       │                  │
│         │  │ ████████░   │  │ ██████░░░   │                  │
│         │  │ 120/150     │  │ 78/120      │                  │
│         │  └─────────────┘  └─────────────┘                  │
│         │  ┌─────────────┐  ┌─────────────┐                  │
│         │  │ Đặt mua     │  │ Nhận hàng   │                  │
│         │  │   45%       │  │   72%       │                  │
│         │  └─────────────┘  └─────────────┘                  │
│         │  ┌─────────────┐  ┌─────────────┐                  │
│         │  │ Sản xuất    │  │ Báo giá/PR  │                  │
│         │  │   55%       │  │   88%       │                  │
│         │  └─────────────┘  └─────────────┘                  │
│         │                                                     │
│         │  HÔM NAY (4 KPI col-12)                             │
│         │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐               │
│         │  │ ĐH   │ │ WO   │ │ PO   │ │ NCC  │               │
│         │  └──────┘ └──────┘ └──────┘ └──────┘               │
│         │                                                     │
│         │  ĐƠN HÀNG SẴN SÀNG (full width)                     │
│         │  ┌─────────────────────────────────────┐           │
│         │  │ ...                                  │           │
│         │  └─────────────────────────────────────┘           │
│         │                                                     │
│         │  CẢNH BÁO (full width)                              │
│         │  ┌─────────────────────────────────────┐           │
│         │  │ ...                                  │           │
│         │  └─────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### B.3.3. Mobile <768px (accordion)

```
┌────────────────────────────────────┐
│ ☰  Tổng quan          [↻]         │  ← topbar 56px
├────────────────────────────────────┤
│                                    │
│ 6 TIẾN ĐỘ CHÍNH                    │
│ ┌────────────────────────────────┐ │
│ │ ▼ Linh kiện sẵn sàng    80%   │ │  ← accordion item, default open
│ │   ████████░░ 120/150 linh kiện │ │     khi tap → expand subtitle + drilldown
│ │   [ Xem chi tiết → ]          │ │
│ ├────────────────────────────────┤ │
│ │ ▶ Lắp ráp                65%   │ │  ← collapsed
│ ├────────────────────────────────┤ │
│ │ ▶ Đặt mua                45%   │ │
│ ├────────────────────────────────┤ │
│ │ ▶ Nhận hàng              72%   │ │
│ ├────────────────────────────────┤ │
│ │ ▶ Sản xuất nội bộ        55%   │ │
│ ├────────────────────────────────┤ │
│ │ ▶ Báo giá / PR           88%   │ │
│ └────────────────────────────────┘ │
│                                    │
│ HÔM NAY (2×2)                      │
│ ┌──────┐  ┌──────┐                │
│ │ ĐH 12│  │WO  8 │                │
│ └──────┘  └──────┘                │
│ ┌──────┐  ┌──────┐                │
│ │PO  5 │  │NCC 3 │                │
│ └──────┘  └──────┘                │
│                                    │
│ ĐƠN HÀNG SẴN SÀNG                 │
│ ┌────────────────────────────────┐ │
│ │ Z0000002 · ABC · 85%          │ │  ← stacked card mobile
│ │ Z0000003 · DEF · 60%          │ │
│ └────────────────────────────────┘ │
│                                    │
│ CẢNH BÁO                           │
│ ┌────────────────────────────────┐ │
│ │ • PO-1234 trễ ETA             │ │
│ └────────────────────────────────┘ │
│                                    │
└────────────────────────────────────┘
```

## B.4. Spec từng `<ProgressBarCard>`

### B.4.1. Anatomy

```
┌─────────────────────────────────────────┐  ← Card border zinc-200, rounded-md, p-4 (16px), w-full
│  [Icon 14] Linh kiện sẵn sàng    [ⓘ]   │  ← Header row, gap-2
│                                         │
│  ┌────────────────────┐                 │
│  │       80%          │  ← Hero %       │  ← text-4xl (28px) font-semibold zinc-900
│  └────────────────────┘                 │
│                                         │
│  ████████████████████░░░░░░  ← Progress │  ← <Progress> h-2 (8px) rounded-full
│                                         │     stripe color = emerald/amber/red theo %
│  120/150 linh kiện           ✓ OK       │  ← text-xs zinc-500 + status icon zinc-400
│                                         │
│  ─────────────────                      │  ← divider zinc-100
│  Xem chi tiết →                         │  ← <DrilldownLink> text-sm font-medium blue-600
│                                         │
└─────────────────────────────────────────┘
   Card size: 380px × 160px (desktop)
   Card size: 100% × 140px (tablet)
   Mobile: accordion collapsed h-12, expanded h-160px
```

### B.4.2. Detail spec

| Element | Spec |
|---|---|
| Container | `<Card>` shadcn, `border border-zinc-200 rounded-md bg-white p-4` |
| Card height | Desktop: 160px fixed (h-40). Tablet: auto min-h 140px. Mobile collapsed: h-12 (48px). |
| Card width | Desktop: 380px (grid col span 4). Tablet: ~358px. Mobile: 100%. |
| Title | `<CardTitle>` text-lg (15px) font-semibold zinc-900, truncate. Icon 14px zinc-400 left, `<HelpCircle>` 12px zinc-400 right (tooltip trigger). |
| Hero percent | `<p>` text-4xl (28px) font-semibold zinc-900 tabular-nums. Margin top 4px. |
| Progress bar | `<Progress>` h-2 (8px) rounded-full. Background zinc-100. Fill: emerald-500 (≥80%), amber-500 (50-80%), red-500 (<50%). Animation 300ms ease-out fill on mount. |
| Subtitle | text-xs (11px) zinc-500. Format: "{done}/{total} {unit}" — vd "120/150 linh kiện". Status icon right: `<Check>` (success) / `<AlertTriangle>` (warning) / `<AlertOctagon>` (critical), 12px. |
| Status icon color | Match progress fill color: emerald-600 / amber-600 / red-600. |
| Divider | h-px bg-zinc-100, mt-3 mb-2 |
| Drilldown link | `<DrilldownLink>` text-sm (12px) font-medium text-blue-600 hover:text-blue-700, with `<ArrowRight>` 12px. |
| Hover state card | `border-zinc-300 hover:bg-zinc-50/50 transition-colors duration-150` |
| Focus state | `focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2` |
| Loading skeleton | `<Skeleton>` 3 lines: title (h-4 w-32), value (h-8 w-16), bar (h-2 w-full). All h-40 container. |

### B.4.3. Tooltip nội dung (theo brainstorm §4 Q2 + §1)

| Card | Tooltip công thức |
|---|---|
| Linh kiện sẵn sàng | "Số bom_snapshot_line ở state AVAILABLE/RESERVED/ISSUED/ASSEMBLED chia tổng line đang chạy. Cập nhật mỗi 30s." |
| Lắp ráp | "Tổng assembled_qty của line ở state ASSEMBLED + CLOSED chia tổng gross_required_qty cùng tập." |
| Đặt mua | "Tổng open_purchase_qty của line đã có ≥1 PO issue chia tổng gross_required_qty cùng tập." |
| Nhận hàng | "Tổng received_qty / tổng gross_required_qty của line state IN ('PURCHASING','INBOUND_QC','AVAILABLE')." |
| Sản xuất nội bộ | "Số WO ở state IN_PROGRESS chia tổng WO ở RELEASED + IN_PROGRESS + COMPLETED. Chỉ tính WO của hôm nay/tuần này (filter qua param)." |
| Báo giá / PR | "Số PR ở state APPROVED + CONVERTED chia tổng PR. Tỷ lệ PR đã được duyệt qua." |

### B.4.4. Drilldown URL (theo brainstorm Q7 — Lựa chọn 3, route filter)

| Card | URL drilldown |
|---|---|
| Linh kiện sẵn sàng | `/bom?filter=snapshot-state&states=AVAILABLE,RESERVED,ISSUED,ASSEMBLED&view=line` |
| Lắp ráp | `/work-orders?status=IN_PROGRESS,COMPLETED&view=assembly` |
| Đặt mua | `/procurement/purchase-orders?hasOpenPurchase=true&view=byLine` |
| Nhận hàng | `/receiving?status=PENDING,IN_PROGRESS` |
| Sản xuất nội bộ | `/work-orders?status=RELEASED,IN_PROGRESS&group=today` |
| Báo giá / PR | `/procurement/purchase-requests?status=APPROVED,CONVERTED` |

**Note:** các module gốc cần được update phase 1 để parse query param mới — không phá break existing logic. Mỗi module có sẵn UI table + filter, chỉ cần map từ URL → filter state.

### B.4.5. Code snippet `<ProgressBarCard>` props

```tsx
// File: apps/web/src/components/domain/ProgressBarCard.tsx
export interface ProgressBarCardProps {
  title: string;             // "Linh kiện sẵn sàng"
  percent: number;           // 0-100
  done: number;              // 120
  total: number;             // 150
  unit: string;              // "linh kiện"
  tooltipText: string;       // Công thức
  drilldownHref: string;     // "/bom?filter=..."
  drilldownLabel?: string;   // "Xem chi tiết" (default)
  loading?: boolean;
  icon?: React.ReactNode;    // <Package className="h-3.5 w-3.5" />
}

// Status threshold:
// percent ≥ 80 → 'success' (emerald)
// percent ≥ 50 → 'warning' (amber)
// percent < 50 → 'critical' (red)
function statusFromPercent(pct: number): 'success' | 'warning' | 'critical' {
  if (pct >= 80) return 'success';
  if (pct >= 50) return 'warning';
  return 'critical';
}
```

## B.5. `<DashboardHeader>` spec

```
┌─────────────────────────────────────────────────────────────────────┐
│  Tổng quan                            Cập nhật 12s trước  [↻ Refresh] │
└─────────────────────────────────────────────────────────────────────┘
   h-12 (48px), padding-y 12px, border-b zinc-100
```

| Element | Spec |
|---|---|
| Title | `<h1>` text-2xl (20px) font-semibold zinc-900 |
| Last-updated | text-sm (12px) zinc-500. Format "Cập nhật {n}s trước". Update mỗi 1s qua `useEffect`. |
| Refresh button | `<Button size="sm" variant="ghost">` với icon `<RotateCw>` 14px. Click → invalidate query + show toast "Đang cập nhật...". |
| Loading state | Refresh icon `animate-spin` khi đang fetch. Last-updated → "Đang cập nhật...". |

## B.6. `<KpiCardRow>` spec

Reuse `<KpiCard>` hiện có. Layout grid 4 col desktop / 2×2 mobile.

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
  <KpiCard
    label="Đơn hàng đang chạy"
    value={12}
    delta={{ value: 2, direction: 'up', label: 'so với hôm qua' }}
    status="info"
    icon={<ClipboardList className="h-3.5 w-3.5" />}
    href="/orders?status=ACTIVE"
  />
  {/* 3 card khác tương tự */}
</div>
```

KPI labels:
- "Đơn hàng đang chạy" → `/orders?status=ACTIVE`
- "Lệnh sản xuất hôm nay" → `/work-orders?dateGroup=today`
- "PO chờ duyệt" → `/procurement/purchase-orders?approvalStatus=PENDING`
- "NCC đang chờ giao" → `/suppliers?hasOpenPo=true`

## B.7. `<OrdersReadinessTable>` & `<AlertsList>`

Reuse nguyên 2 component này. Pass props:

```tsx
<OrdersReadinessTable
  orders={topOrders}     // 5 rows
  limit={5}
  loading={isLoading}
  getOrderHref={(o) => `/orders/${o.orderCode}`}
/>

<AlertsList
  alerts={topAlerts}     // 5 rows
  limit={5}
  loading={isLoading}
/>
```

API source: `/api/dashboard/overview-v2` trả về `{ progressBars, kpis, topOrders, topAlerts, lastUpdated }`. Cache Redis 30s.

## B.8. Empty state — chưa có data (ngày đầu setup)

Khi tổng line = 0 (chưa có order nào):

```
┌─────────────────────────────────────────────────┐
│                                                 │
│           [Icon Sparkles 48px zinc-400]         │
│                                                 │
│      Chưa có dữ liệu để hiển thị tiến độ.       │
│                                                 │
│   Tạo BOM template đầu tiên hoặc nhập file Excel│
│              để bắt đầu theo dõi.               │
│                                                 │
│        [+ Tạo BOM mới]   [↑ Nhập Excel]         │
│                                                 │
└─────────────────────────────────────────────────┘
   Container: full grid 12-col, py-16 text-center
```

| Element | Spec |
|---|---|
| Icon | `<Sparkles>` 48px text-zinc-400 |
| Title | text-lg (15px) font-semibold zinc-700, mt-4 |
| Subtitle | text-sm (12px) zinc-500, mt-2, max-w-md mx-auto |
| Buttons | 2 button gap-3, mt-6: primary "Tạo BOM mới" → `/bom/new`, secondary "Nhập Excel" → `/import/bom` |

KPI cards và bảng readiness vẫn render với placeholder zero (giá trị 0, badge "Không có"). Không hide hoàn toàn — user thấy structure đầy đủ.

## B.9. Loading & error state

### Loading
- `<DashboardHeader>` last-updated text → "Đang tải...".
- 6 progress bar card → skeleton h-40 w-full với 3 line bar.
- 4 KPI card → skeleton h-20 w-full.
- Orders table → 5 row skeleton h-9.
- Alerts → 5 row skeleton h-12.

### Error (API timeout / 500)
- Banner top dashboard:
  ```
  ┌─────────────────────────────────────────────────┐
  │ ⚠ Không tải được dữ liệu tổng quan.    [Thử lại]│
  │   Hệ thống đang dùng dữ liệu cũ từ 5 phút trước.│
  └─────────────────────────────────────────────────┘
     bg-amber-50 border-amber-200 text-amber-800 p-4 rounded-md
  ```
- Cards vẫn render với last-known-good data (cache).

## B.10. Component file tree

```
apps/web/src/
├── app/(app)/page.tsx                    ← THAY redirect bằng <DashboardOverviewPage />
├── app/api/dashboard/overview-v2/route.ts ← NEW API endpoint
├── components/
│   ├── domain/
│   │   ├── ProgressBarStack.tsx          ← NEW
│   │   ├── ProgressBarCard.tsx           ← NEW
│   │   ├── DashboardHeader.tsx           ← NEW
│   │   ├── DrilldownLink.tsx             ← NEW
│   │   ├── KpiCard.tsx                   ← REUSE
│   │   ├── OrdersReadinessTable.tsx      ← REUSE
│   │   ├── AlertsList.tsx                ← REUSE
│   │   └── StatusBadge.tsx               ← REUSE
│   └── ui/                               ← shadcn primitives, không đụng
└── lib/
    └── dashboard-format.ts               ← NEW helpers (statusFromPercent, formatLastUpdated)
```

---

# §C. PO Detail — Tickbox receiving per-line (UPDATE)

## C.1. Mục tiêu

Trang `/procurement/purchase-orders/[id]` hiện có table dòng. Thêm cột "Đã nhận" — tickbox + ô nhập qty (default = orderedQty). User tick → tạo `inbound_receipt` + `inbound_receipt_line` per checked line + cập nhật `bom_snapshot_line.received_qty` qua service layer.

Theo brainstorm Q3 — Lựa chọn 1 (PO detail là nơi đúng nhất về domain).

## C.2. Mock ASCII desktop

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Sidebar 220px │  /procurement/purchase-orders/PO-1234                                  │
│               │                                                                       │
│               │  ┌─────────────────────────────────────────────────────────────────┐ │
│               │  │ ← Quay lại    PO-1234 · NCC ABC Corp           [Xuất PDF] [⋯] │ │
│               │  │ Trạng thái: Đã duyệt · Tạo 20/04/2026 · ETA 30/04/2026          │ │
│               │  └─────────────────────────────────────────────────────────────────┘ │
│               │                                                                       │
│               │  Thông tin chung      Dòng PO   Lịch sử   Thanh toán                  │
│               │  ──────────────       ━━━━━━━                                         │
│               │                                                                       │
│               │  ┌─────────────────────────────────────────────────────────────────┐ │
│               │  │ DÒNG ĐẶT HÀNG (10 line)                       Đã nhận: 0/10 line│ │
│               │  ├─────────────────────────────────────────────────────────────────┤ │
│               │  │ # │ SKU      │ Tên          │ SL đặt│ Đơn giá│ Đã nhận?  │ Trạng│ │
│               │  ├───┼──────────┼──────────────┼───────┼────────┼───────────┼──────┤ │
│               │  │ 1 │ POM-001  │ Trục POM Ø20 │  10   │ 50,000 │ ☐  [10  ] │ Chờ │ │  ← row h-9
│               │  │ 2 │ AL6061-2 │ Tấm AL6061   │   5   │120,000 │ ☑  [ 5  ] │ ✓ OK│ │  ← tick rồi, status emerald
│               │  │ 3 │ SUS304-A │ Bulông SUS   │  20   │ 15,000 │ ☑  [18  ] │ ⚠ -2│ │  ← thiếu 2, amber
│               │  │ 4 │ PVC-100  │ Ống PVC 100  │   8   │ 80,000 │ ☐  [ 8  ] │ Chờ │ │
│               │  │ 5 │ S45C-X   │ Trục S45C    │  12   │ 60,000 │ ☑  [13  ] │ ⚠ +1│ │  ← thừa 1, amber
│               │  │...│          │              │       │        │           │      │ │
│               │  └─────────────────────────────────────────────────────────────────┘ │
│               │                                                                       │
│               │  ┌─────────────────────────────────────────────────────────────────┐ │  ← <PoReceivingFormFooter>
│               │  │ Đã chọn 3/10 line · 36 món              [Huỷ] [Lưu nhận hàng →]│ │     sticky bottom, bg zinc-50
│               │  └─────────────────────────────────────────────────────────────────┘ │
│               │                                                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## C.3. Mock ASCII mobile (PWA)

```
┌────────────────────────────────────┐
│ ☰  PO-1234                  [⋯]   │  ← topbar 56px
├────────────────────────────────────┤
│                                    │
│  PO-1234 · NCC ABC Corp            │  ← p-4
│  ETA 30/04/2026 · Đã duyệt         │
│                                    │
│  [Thông tin] [Dòng PO] [Lịch sử]   │  ← tabs h-9
│              ━━━━━━━                │
│                                    │
│  Đã nhận: 3/10 line                │
│                                    │
│  ┌────────────────────────────────┐│  ← row card thay table mobile
│  │ POM-001 · Trục POM Ø20         ││     min-h 88px (≥44px tap target)
│  │ SL đặt: 10 · Đơn giá 50k       ││
│  │                                ││
│  │ ☐  [    10    ]      Chờ       ││  ← tickbox + qty input + status
│  │   ↑44px tap target              ││
│  └────────────────────────────────┘│
│  ┌────────────────────────────────┐│
│  │ AL6061-2 · Tấm AL6061          ││
│  │ SL đặt: 5 · Đơn giá 120k       ││
│  │                                ││
│  │ ☑  [    5     ]      ✓ OK      ││  ← bg-emerald-50 khi checked OK
│  └────────────────────────────────┘│
│  ┌────────────────────────────────┐│
│  │ SUS304-A · Bulông SUS          ││
│  │ SL đặt: 20 · Đơn giá 15k       ││
│  │                                ││
│  │ ☑  [   18     ]      ⚠ -2      ││  ← bg-amber-50 khi qty mismatch
│  └────────────────────────────────┘│
│                                    │
│  ...                               │
│                                    │
├────────────────────────────────────┤
│ Đã chọn 3/10 · 36 món              │  ← sticky bottom, h-14
│      [Huỷ]  [Lưu nhận hàng]        │
└────────────────────────────────────┘
```

## C.4. Detail spec column "Đã nhận"

### C.4.1. Cấu trúc cell

```
┌───────────────────┐
│ ☐  [10] PCS  ⓘ   │  ← Layout horizontal, gap-2
└───────────────────┘
   Cell padding-x 12px, py 6px (h-9 row desktop / h-12 mobile)
```

| Element | Spec |
|---|---|
| Tickbox | `<Checkbox>` shadcn 14px (h-3.5 w-3.5) desktop / 20px (h-5 w-5) mobile. Label hidden visually but `aria-label="Đánh dấu line {sku} đã nhận"`. |
| Qty input | `<Input type="number" inputMode="numeric">` w-16 (64px) h-7 (28px) desktop / w-20 (80px) h-10 (40px) mobile. Default value = `line.orderedQty`. Disabled khi tickbox unchecked. Focus state outline blue-500. |
| Unit label | text-xs zinc-500 sau qty input — vd "PCS", "KG". |
| Tooltip ⓘ | `<HelpCircle>` 12px zinc-400, tooltip "Mặc định bằng SL đặt. Sửa nếu nhận thiếu/thừa." |
| Status indicator | Cột "Trạng thái" riêng: `<Badge>` shadcn — "Chờ" (zinc), "✓ OK" (emerald), "⚠ -2" (amber qty thiếu), "⚠ +1" (amber qty thừa). |

### C.4.2. State machine

```
   ┌──────┐  click ☐                     ┌──────────────┐
   │ idle │ ──────────────────────────►  │  checked     │
   └──────┘                              │  qty enabled │
      ▲                                  │  default=ord │
      │                                  └──────────────┘
      │                                         │
      │                                         │ user edit qty
      │                                         ▼
      │  click ☑                         ┌──────────────┐
      └─────────────────────────────────┤  edited      │
                                        │  qty != ord  │
                                        └──────────────┘
                                               │
                                               ▼ click "Lưu nhận hàng"
                                        ┌──────────────┐
                                        │  saving...   │
                                        └──────────────┘
                                               │
                                               ▼ API success
                                        ┌──────────────┐
                                        │  saved       │
                                        │  (locked)    │  ← line không cho tick lại
                                        └──────────────┘
```

### C.4.3. Threshold màu cell row

| Trạng thái | Bg row | Border indicator | Status badge |
|---|---|---|---|
| Idle (chưa tick) | white | none | "Chờ" zinc |
| Checked, qty = ordered | emerald-50/40 | border-l-2 emerald-500 | "✓ OK" emerald |
| Checked, qty < ordered | amber-50/40 | border-l-2 amber-500 | "⚠ Thiếu {n}" amber |
| Checked, qty > ordered | amber-50/40 | border-l-2 amber-500 | "⚠ Thừa {n}" amber |
| Saved (đã commit, lock) | zinc-100 | border-l-2 zinc-400 | "Đã nhận {qty}" zinc, italic |
| Error (validation) | red-50 | border-l-2 red-500 | "Lỗi" red |

## C.5. Edge case xử lý

### C.5.1. Tick rồi untick — qty rollback?
**Hành vi:** untick → qty input disabled + reset value về `orderedQty`. User edit qty trước khi untick → giá trị mất. **Confirm dialog:** không cần (user action explicit).

### C.5.2. Nhận thừa (qty > ordered) → cảnh báo
**Hành vi:** input value > orderedQty → row chuyển amber-50 + badge "Thừa N". Khi click "Lưu nhận hàng" → confirm dialog:
```
┌──────────────────────────────────────┐
│  Xác nhận nhận thừa                  │
│                                      │
│  Line "POM-001" nhận 12, đặt 10.     │
│  Vượt 2 món. Tiếp tục lưu?           │
│                                      │
│            [Huỷ]  [Xác nhận]         │
└──────────────────────────────────────┘
```
**Lưu ý:** user role `warehouse` được phép nhận thừa, nhưng cần audit log entry với reason.

### C.5.3. Nhận thiếu nhiều line → batch save 1 lần
**Hành vi:** user tick 5 line trong 10 line → click "Lưu nhận hàng" 1 lần → API call duy nhất tạo 1 `inbound_receipt` với 5 `inbound_receipt_line`. Không lưu từng line một.

**API contract:**
```ts
POST /api/purchase-orders/:id/receive
Body: {
  receipts: [
    { lineId: 1, qty: 10, lotCode?: string, locationBinId?: string },
    { lineId: 2, qty: 5 },
    { lineId: 3, qty: 18, note?: "Thiếu 2 do hư hỏng vận chuyển" },
  ],
  receiverNote?: string  // optional cho cả batch
}
Response: {
  receiptId: "RC-202604-001",
  receiptLineIds: [101, 102, 103],
  bomSnapshotLineUpdates: [
    { snapshotLineId: 501, receivedQtyDelta: 10 },
    { snapshotLineId: 502, receivedQtyDelta: 5 },
    ...
  ]
}
```

### C.5.4. Quyền: chỉ role `warehouse` + `admin` được tick
**Hành vi:** user role `purchasing` / `engineering` mở PO detail → cột "Đã nhận?" hiển thị nhưng tickbox `disabled` + tooltip "Chỉ bộ phận Kho có quyền ghi nhận". Footer "Lưu nhận hàng" cũng disabled.

**Implementation:** check `canAny(userRoles, 'inboundReceipt')` ở server-side render — nếu false thì pass prop `readOnly={true}` xuống component.

### C.5.5. PWA mobile: button to ≥44px, qty input numeric keyboard
**Spec đã ghi ở C.4.1.** Verify với Chrome DevTools mobile emulation iPhone 12.

### C.5.6. PO đã được nhận một phần trước đó
**Hành vi:** nếu line đã có `inbound_receipt_line` trước đó (qua `/receiving` flow cũ) → row hiện trạng thái "Đã nhận {existing}" zinc + tickbox vẫn enable, default qty = `orderedQty - alreadyReceived`. Cho phép nhận tiếp.

### C.5.7. PO chưa được duyệt (status DRAFT/PENDING)
**Hành vi:** cột "Đã nhận?" hidden hoàn toàn. Hiển thị banner top "PO chưa được duyệt — không thể nhận hàng."

### C.5.8. Concurrent edit (2 user tick cùng PO)
**Hành vi:** server-side optimistic lock qua `purchase_order.updated_at`. Nếu commit fail do conflict → toast "PO đã được người khác cập nhật. Refresh trang để xem mới nhất." + reload data.

## C.6. Toast / Sheet design

### C.6.1. Toast success (Sonner)
```
┌──────────────────────────────────────┐
│ ✓  Đã ghi nhận 5/10 line.       [×] │
│                                      │
│ Tiến độ BOM-501 cập nhật từ 60% → 75%│
│ [Xem BOM →]                          │
└──────────────────────────────────────┘
   Position: bottom-right desktop, top mobile
   Duration: 5s, hover-pause
   Color: emerald-500 border-l, zinc-900 text
```

### C.6.2. Toast warning (qty thừa/thiếu)
```
┌──────────────────────────────────────┐
│ ⚠  Đã ghi nhận với chênh lệch.  [×] │
│                                      │
│ 3 line nhận thiếu, 1 line nhận thừa. │
│ Đã ghi audit log.                    │
└──────────────────────────────────────┘
   Color: amber-500 border-l
```

### C.6.3. Toast error
```
┌──────────────────────────────────────┐
│ ✕  Lỗi: Không lưu được nhận hàng.  [×]│
│                                      │
│ Lý do: ...                           │
│ [Thử lại]                            │
└──────────────────────────────────────┘
   Color: red-500 border-l
   Duration: persistent (user dismiss)
```

## C.7. Loading state khi save

| Phase | UI |
|---|---|
| Click "Lưu nhận hàng" | Button → spinner + label "Đang lưu...". Footer disable interaction toàn page. |
| Optimistic update | Mỗi row vừa save → switch ngay sang state "Đã nhận" lock, opacity 0.7 cho đến khi API confirm. |
| Error rollback | API fail → revert tất cả row về state trước. Toast error hiển thị. |

## C.8. Empty state — PO không có line
```
┌─────────────────────────────────────┐
│   PO này chưa có dòng đặt hàng.     │
│                                     │
│   Liên hệ bộ phận Mua bán để bổ sung.│
└─────────────────────────────────────┘
   py-12 text-center zinc-500
```

## C.9. Component file tree

```
apps/web/src/
├── app/(app)/procurement/purchase-orders/[id]/
│   ├── page.tsx                          ← UPDATE: thêm <PoLineReceivingTickbox> trong tab "Dòng PO"
│   └── _components/
│       ├── PoLineTable.tsx              ← UPDATE: thêm cột "Đã nhận?" + cột "Trạng thái receiving"
│       └── (NEW components dưới)
├── components/domain/
│   ├── PoLineReceivingTickbox.tsx       ← NEW (per-line: tickbox + qty input + tooltip)
│   └── PoReceivingFormFooter.tsx        ← NEW (sticky bottom: count + Save button)
└── app/api/purchase-orders/[id]/receive/route.ts  ← NEW POST endpoint
```

---

# §D. Excel BOM Importer V1 — Wizard 3 bước (NEW)

## D.1. Mục tiêu

Map file Excel BOM thực tế (`Bản chính thức 20260324_ Z0000002-502653 Z0000002-502654_ BOM trien khai_sl 02 + 02.xlsx`) — 3 sheet, sheet 1+2 là BOM project (R2 = header, R1 = project name + qty máy), sheet 3 "Material&Process" là master data (phase 1 KHÔNG import vào DB — chỉ preview, phase 2 mới làm).

Wizard 3 bước theo brainstorm §6 phase 1 tuần 2-3.

## D.2. Cấu trúc tổng

```
<BomImportWizard>
├── <WizardStepper> — visual progress 1 → 2 → 3
├── <SheetPickerStep>      [Step 1]
├── <MapColumnsStep>       [Step 2]
└── <PreviewCommitStep>    [Step 3]
```

## D.3. Mock ASCII Step 1 — Upload + chọn sheet

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Sidebar 220px │  /import/bom                                                          │
│               │                                                                       │
│               │  Nhập BOM từ Excel                                                   │
│               │  ──────────────────                                                  │
│               │                                                                       │
│               │  [① Upload]──[② Map cột]──[③ Xem & Tạo]                              │  ← <WizardStepper>
│               │   ━━━━━━━━     dimmed       dimmed                                    │
│               │                                                                       │
│               │  ┌─────────────────────────────────────────────────────────────────┐ │
│               │  │                                                                 │ │
│               │  │           [↑ Icon Upload 48px zinc-400]                         │ │
│               │  │                                                                 │ │
│               │  │       Kéo thả file Excel vào đây hoặc click để chọn             │ │
│               │  │       Hỗ trợ .xlsx, .xls — tối đa 10MB                          │ │
│               │  │                                                                 │ │
│               │  │              [ Chọn file ]                                      │ │
│               │  │                                                                 │ │
│               │  └─────────────────────────────────────────────────────────────────┘ │
│               │     dropzone h-48 border-dashed border-zinc-300 rounded-md           │
│               │                                                                       │
│               │  ─── HOẶC AFTER UPLOAD ───                                            │
│               │                                                                       │
│               │  ┌─────────────────────────────────────────────────────────────────┐ │
│               │  │ ✓ File đã chọn: 20260324_BOM_Z0000002.xlsx (842 KB)             │ │
│               │  │                                                                 │ │
│               │  │ Phát hiện 3 sheet trong file:                                   │ │
│               │  │                                                                 │ │
│               │  │ ┌─────┬─────────────────────────────┬───────┬──────────────┐  │ │
│               │  │ │     │ Tên sheet                   │ Số dòng│ Loại        │  │ │
│               │  │ ├─────┼─────────────────────────────┼───────┼──────────────┤  │ │
│               │  │ │ ⦿  │ Z0000002-502653              │  58   │ BOM project │  │ │  ← radio default chọn sheet 1
│               │  │ │ ◯  │ Z0000002-502654              │  41   │ BOM project │  │ │
│               │  │ │ ⓘ  │ Material&Process             │  25   │ Master data │  │ │  ← icon info, không chọn được
│               │  │ └─────┴─────────────────────────────┴───────┴──────────────┘  │ │
│               │  │                                                                 │ │
│               │  │ ⓘ Sheet "Material&Process" sẽ được import ở phase 2.            │ │
│               │  │   Phase 1 chỉ import BOM project.                               │ │
│               │  │                                                                 │ │
│               │  └─────────────────────────────────────────────────────────────────┘ │
│               │                                                                       │
│               │  [Huỷ]                                              [Tiếp theo →]   │
│               │                                                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### D.3.1. Spec Step 1

| Element | Spec |
|---|---|
| Stepper | `<WizardStepper>` h-9 horizontal, 3 step dots connected. Active step = blue-500 dot, label font-medium. Done = emerald-500 + check icon. Upcoming = zinc-300. |
| Dropzone | `<input type="file" accept=".xlsx,.xls">` wrap trong dropzone area h-48 border-dashed. Drag-over state: `border-blue-500 bg-blue-50/50`. |
| File card after upload | `<Card>` p-4 border-zinc-200 với check icon + filename + size + "Đổi file" button. |
| Sheet table | Table 4 col (radio / name / rowCount / type). Row h-9. Disabled row (Material&Process) opacity-60 + cursor-not-allowed. |
| Auto-detect type | Logic: nếu sheet name match regex "(Material|Process|Vật\s*liệu)" → type = "Master data". Còn lại → "BOM project". |
| File size validation | Reject upfront nếu >10MB → toast error "File quá lớn (max 10MB)". |
| Format validation | Reject nếu không phải .xlsx/.xls → toast "Định dạng không hỗ trợ". |
| Empty file | Reject nếu workbook không có sheet nào → toast "File không chứa sheet nào". |
| Server-side parse | Upload → POST `/api/import/bom-excel/parse` → server dùng `xlsx` library parse → trả về `{ sheets: [{name, rowCount, type, headers[]}] }`. |
| Buttons | Footer right-align: "Huỷ" (variant="ghost") + "Tiếp theo →" (variant="default" disabled cho đến khi user chọn sheet BOM). |

## D.4. Mock ASCII Step 2 — Map cột

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│               │  Nhập BOM từ Excel                                                   │
│               │                                                                       │
│               │  [① Upload ✓]──[② Map cột]──[③ Xem & Tạo]                            │
│               │   done blue   ━━━━━━━━━━     dimmed                                   │
│               │                                                                       │
│               │  Sheet đã chọn: Z0000002-502653 (58 dòng)                             │
│               │  Header row tự động phát hiện: dòng 2                                 │
│               │  [▾ Đổi header row]                                                  │
│               │                                                                       │
│               │  ┌─────────────────────────────────────────────────────────────────┐ │
│               │  │ MAP CỘT EXCEL → TRƯỜNG DB                                       │ │
│               │  ├─────────────────────────────────────────────────────────────────┤ │
│               │  │ # │ Cột Excel              │ Trường DB                  │Match│ │
│               │  ├───┼────────────────────────┼────────────────────────────┼─────┤ │
│               │  │ A │ STT                    │ ◯ Bỏ qua                  │  -  │ │
│               │  │ B │ ID Number              │ [▾ positionCode (specJson)]│ 95% │ │  ← auto match
│               │  │ C │ Standard Number        │ [▾ componentSku          ▾]│ 98% │ │
│               │  │ D │ Sub Category           │ [▾ materialSpec (specJson)]│ 70% │ │
│               │  │ E │ Visible Part Size      │ [▾ dimensionSpec (spec..)] │ 85% │ │
│               │  │ F │ Quantity               │ [▾ qtyPerParent          ▾]│ 99% │ │
│               │  │ G │ Số lượng               │ [▾ qtyTotal (verify)     ▾]│ 90% │ │
│               │  │ H │ NCC/Vật tư             │ [▾ supplierCode (lookup) ▾]│ 88% │ │
│               │  │ I │ Note 1                 │ [▾ metadata.notes[0]     ▾]│ 75% │ │
│               │  │ J │ Note 2                 │ [▾ metadata.notes[1]     ▾]│ 75% │ │
│               │  │ K │ Note 3                 │ [▾ metadata.notes[2]     ▾]│ 75% │ │
│               │  └─────────────────────────────────────────────────────────────────┘ │
│               │                                                                       │
│               │  ⓘ Match% = độ tương đồng. <70% gợi ý kiểm tra lại.                  │
│               │                                                                       │
│               │  Tên BOM template:  [_BOM Z0000002-502653 (auto-fill từ R1)____]     │
│               │  Số máy (qty):       [ 2 ] (auto-fill từ R1 col 12 chia qtyPer..)    │
│               │                                                                       │
│               │  [← Quay lại]                                       [Tiếp theo →]    │
│               │                                                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### D.4.1. Spec Step 2

| Element | Spec |
|---|---|
| Header row picker | `<Select>` dropdown "Đổi header row" cho phép user chọn dòng khác (1-10). Default = auto-detect (thường R2). |
| Auto-detect logic | Server-side: tìm row có ≥3 cell text matching synonym dict. Default R2 vì file mẫu R1 = project name. |
| Mapping table | Table 4 col: # (col letter A-Z), Cột Excel (raw header text), Trường DB (`<Select>`), Match% (badge). Row h-9 desktop / h-12 mobile. |
| Trường DB select | Options: 9 core field + new fields cho BOM (xem D.4.2). "Bỏ qua" là option default cho cột không match. |
| Match% badge | ≥90%: emerald-50 bg / emerald-700 text. 70-89%: amber-50 / amber-700. <70%: zinc-100 / zinc-600. |
| Auto-suggest | Dùng `import-mapping.ts` synonym dict + Levenshtein ≤2. Extend dict với synonym mới (xem D.4.3). |
| Project name input | `<Input>` text auto-fill từ Excel R1 (sheet name hoặc cell R1C1). User edit được. Required. |
| Qty máy input | `<Input>` number auto-fill từ R1 cuối row (số lượng máy dự án). Default = ceil(qtyTotal / qtyPerParent). |
| Validation | Mỗi field required (`componentSku`, `qtyPerParent`) phải được map ít nhất 1 cột. Show inline error "Bắt buộc map" red text dưới select. |
| Footer | "← Quay lại" ghost (về Step 1, giữ file) + "Tiếp theo →" default (disabled nếu validation fail). |

### D.4.2. Trường DB available trong dropdown (BOM context)

| Trường DB | Type | Required | Lưu vào |
|---|---|---|---|
| `componentSku` | string | ✓ | `bom_line.component_sku` |
| `qtyPerParent` | number | ✓ | `bom_line.qty_per_parent` |
| `qtyTotal` | number | — | Phase 1: verify ngầm. Không lưu cột riêng. |
| `supplierCode` | string lookup | — | `bom_line.metadata.suggestedSupplierCode` (phase 1 specJson). Resolve qua `supplier.code` lookup. |
| `positionCode` | string | — | `bom_line.metadata.positionCode` (phase 1 specJson). Phase 2 cột riêng. |
| `materialSpec` | string | — | `bom_line.metadata.materialSpec` (phase 1 specJson). Phase 2 → `item.material_code`. |
| `dimensionSpec` | string | — | `bom_line.metadata.dimensionSpec` (phase 1 specJson). Phase 2 → `item.dimensions`. |
| `metadata.notes[0]` | string | — | `bom_line.metadata.notes[0]` |
| `metadata.notes[1]` | string | — | `bom_line.metadata.notes[1]` |
| `metadata.notes[2]` | string | — | `bom_line.metadata.notes[2]` |
| (Bỏ qua) | — | — | Skip hoàn toàn |

### D.4.3. Synonym dict mới — extend `import-mapping.ts`

Thêm vào `ITEM_FIELD_SYNONYMS` hoặc tạo `BOM_FIELD_SYNONYMS` riêng:

```ts
// File: apps/web/src/lib/bom-import-mapping.ts (NEW)
export const BOM_FIELD_SYNONYMS: Record<string, string[]> = {
  componentSku: [
    "standardnumber",
    "stdnumber",
    "ma",
    "masku",
    "mavetu",
    "mavattu",
    "soban",     // "Số bản" — số bản vẽ
    "drawingno",
    "drawingnumber",
    "partnumber",
    "partno",
  ],
  qtyPerParent: [
    "quantity",
    "qty",
    "soluong",      // ambiguous với qtyTotal — Levenshtein nhẹ hơn
    "qtypermachine",
    "qtyperunit",
    "soluong1may",
    "soluongmoimay",
  ],
  qtyTotal: [
    "soluong",       // ambiguous → fallback
    "totalqty",
    "tongsoluong",
    "qtytotal",
    "soluongtong",
  ],
  supplierCode: [
    "ncc",
    "ncv",
    "vendor",
    "vendorcode",
    "suppliercode",
    "nccvattu",
    "nguoncungcap",
  ],
  positionCode: [
    "idnumber",
    "id",
    "stt",            // có thể conflict — match ưu tiên positionCode nếu giá trị có pattern "R\d+"
    "positioncode",
    "vitri",
    "stk",            // số ký hiệu
    "ref",
    "refnumber",
  ],
  materialSpec: [
    "subcategory",
    "vatlieu",
    "material",
    "loaivl",
    "materialcode",
    "loai",
  ],
  dimensionSpec: [
    "visiblepartsize",
    "size",
    "kichthuoc",
    "dimension",
    "dimensions",
    "kt",
    "kichco",
    "dim",
  ],
  notes: [
    "note",
    "ghichu",
    "remark",
    "comment",
    "note1",
    "note2",
    "note3",
    "ghichu1",
    "ghichu2",
    "ghichu3",
  ],
};
```

**Lưu ý:** dict mới chỉ apply trong context BOM import wizard, không pollute Item importer hiện có.

## D.5. Mock ASCII Step 3 — Preview + commit

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│               │  Nhập BOM từ Excel                                                   │
│               │                                                                       │
│               │  [① Upload ✓]──[② Map cột ✓]──[③ Xem & Tạo]                          │
│               │   done emerald  done emerald   ━━━━━━━━━━━━                           │
│               │                                                                       │
│               │  Tên BOM: BOM Z0000002-502653 · Số máy: 2 · 58 line                   │
│               │                                                                       │
│               │  ⚠ Cảnh báo phát hiện:                                                │
│               │  • 3 line có NCC chưa tồn tại trong hệ thống → sẽ tạo mới             │
│               │  • 5 line có SKU chưa tồn tại → sẽ tạo Item mới (uom=PCS, type=PURCH..│
│               │  • 2 line trống ở dòng R44, R45 → sẽ bỏ qua                           │
│               │                                                                       │
│               │  ┌─────────────────────────────────────────────────────────────────┐ │
│               │  │ XEM TRƯỚC 58 LINE                                               │ │
│               │  ├─────────────────────────────────────────────────────────────────┤ │
│               │  │# │SKU       │Tên       │SLPer│Tổng│NCC      │Position│Notes    │ │
│               │  ├──┼──────────┼──────────┼─────┼────┼─────────┼────────┼─────────┤ │
│               │  │1 │POM-001   │Trục POM  │ 1   │  2 │ABC      │R01     │đã đặt..│ │  ← row OK
│               │  │2 │AL-NEW-01 │Tấm AL    │ 2   │  4 │DEF*     │R02     │chưa data│ │  ← bg-amber-50: NCC mới + SKU mới
│               │  │3 │PVC-100   │Ống PVC   │ 1   │  2 │GHI      │R03     │ducpt..  │ │
│               │  │..│          │          │     │    │         │        │         │ │
│               │  │44│-         │-         │ -   │  - │-        │-       │(empty)  │ │  ← bg-zinc-100 italic: skip
│               │  │58│SUS-200   │Bulông    │ 4   │  8 │XYZ      │R57     │         │ │
│               │  └─────────────────────────────────────────────────────────────────┘ │
│               │     * = sẽ tạo mới                                                    │
│               │                                                                       │
│               │  [← Quay lại]            [↓ Xuất CSV]    [Tạo BOM template + 58 line]│
│               │                                            ━━━━━━━━━━━━━━━━━━━━━━━━━ │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### D.5.1. Spec Step 3

| Element | Spec |
|---|---|
| Header summary | text-md (14px) zinc-700 — "Tên BOM: ... · Số máy: ... · N line" |
| Warning callout | `<div>` bg-amber-50 border-amber-200 text-amber-800 p-3 rounded-md mb-4. Bullet list các vấn đề. |
| Preview table | Sticky header. Row h-9. Max-h 480px scroll. Showing 9 cols + "#". |
| Highlight cell có vấn đề | NCC code không tồn tại → cell bg-amber-100 + asterisk * + tooltip "NCC mới sẽ được tạo". SKU không tồn tại → cell bg-amber-100 + tooltip "Item mới sẽ được tạo (uom=PCS, type=PURCHASED)". |
| Empty row | bg-zinc-100, italic, text-zinc-400, all cells "-". Tooltip "Bỏ qua dòng trống". |
| Detection skip rows | Phát hiện row có status text per-NCC (R46-R58 trong file mẫu — kiểu "Tổng kết NCC ABC: 5/10") → bg-zinc-50 + italic, tooltip "Bỏ qua row tổng kết". |
| Export CSV button | "↓ Xuất CSV" ghost button — download preview data dạng CSV để user verify offline. |
| Commit button | "Tạo BOM template + 58 line" primary blue-500. Click → POST `/api/import/bom-excel/commit` → enqueue BullMQ job, return `jobId`. |
| Polling status | Sau commit, hiện full-page loading dialog với progress bar + "Đang tạo BOM... 12/58 line". Polling `/api/import/bom-excel/job/:jobId` mỗi 1s. |
| Success | Toast "Đã tạo BOM template với 58 line" + redirect `/bom/{newId}/grid`. |
| Failure | Toast error + show error log dialog với link "Tải log lỗi". |

### D.5.2. Validation logic per-cell

| Vấn đề | Highlight | Action gợi ý |
|---|---|---|
| SKU không tồn tại | amber-100 + * | "Tạo item mới với uom=PCS, type=PURCHASED" |
| SKU chứa ký tự lạ (vd `<` hoặc unicode lạ) | red-100 | Skip line, không tạo |
| qtyPerParent ≤ 0 | red-100 | Skip line, log warning |
| supplierCode không tồn tại | amber-100 + * | "Tạo NCC mới với name=code, contact rỗng" |
| supplierCode = "1 line có 2 NCC" (vd "ABC/DEF") | amber-100 | Phase 1: lấy NCC đầu (ABC), log warning. Phase 2: support multi-supplier. |
| Empty rows giữa data (R44, R45) | zinc-100 italic | Skip |
| Hàng tổng kết per-NCC (R46-R58) | zinc-100 italic | Detect pattern: cell A = "Tổng" / "Total" → skip |
| Cell merge | — | Server-side: unmerge, lấy giá trị cell đầu, fill xuống các row sau |

### D.5.3. Commit API

```
POST /api/import/bom-excel/commit
Body: {
  fileId: string,        // tham chiếu file đã upload step 1
  sheetIndex: number,    // 0 hoặc 1
  headerRow: number,     // default 2
  columnMapping: {
    componentSku: "C",   // letter
    qtyPerParent: "F",
    supplierCode: "H",
    positionCode: "B",
    materialSpec: "D",
    dimensionSpec: "E",
    "metadata.notes[0]": "I",
    "metadata.notes[1]": "J",
    "metadata.notes[2]": "K",
  },
  bomTemplateName: string,
  machineQty: number,
  options: {
    autoCreateItems: boolean,    // default true
    autoCreateSuppliers: boolean,// default true
    skipEmptyRows: boolean,      // default true
    skipSummaryRows: boolean,    // default true
  }
}
Response: {
  jobId: string,
  estimatedDuration: "~5s for 58 lines"
}
```

## D.6. Edge case xử lý

| Case | Xử lý |
|---|---|
| Header row không phải R2 | User mở dropdown "Đổi header row" → chọn 1-10. Server reparse với header mới. |
| Empty rows giữa data (R44, R45) | Server-side detect: row có toàn cell empty/whitespace → skip với log "Skipped row 44 (empty)". |
| Hàng tổng kết per-NCC (R46-R58) | Detect pattern: cell A bắt đầu bằng "Tổng" / "Total" / "TỔNG" → skip với log. |
| File >10MB | Reject upfront ở Step 1, toast "File quá lớn (max 10MB)". |
| File 0 byte | Reject "File rỗng". |
| File không phải xlsx (extension giả) | Server detect MIME type khác → reject "Định dạng không hợp lệ". |
| Cell merge | Server-side unmerge: lấy value cell đầu, fill các cell trống sau (bottom-fill). Log "Unmerged 3 cells in column C". |
| 1 line có 2 NCC (vd "ABC/DEF") | Phase 1: split bằng "/" hoặc "," → lấy phần tử đầu. Log warning row. Phase 2: support multi-supplier per line. |
| qty âm hoặc 0 | Skip line + log "Invalid qty at row N". |
| SKU trùng nhau trong cùng sheet | Phase 1: cho phép (BOM line có thể lặp SKU với position khác). Không block. |
| Project name không có ở R1 | Default = sheet name. User edit được ở Step 2. |
| Sheet bị protect password | Reject "Sheet được bảo vệ — gỡ password trước khi import". |
| File chứa formula (vd `=SUM(...)`) | Server-side evaluate formula → lấy giá trị cuối cùng. xlsx library xử lý sẵn. |
| User reload page giữa wizard | Mất state — phase 1 chấp nhận. Phase 2: persist state localStorage. |
| Concurrent import (2 user import cùng file) | Server-side mỗi import là separate job, không conflict. BOM template name có thể trùng → suffix "(2)". |

## D.7. Mobile

**Phase 1 chỉ desktop/tablet.** Mobile defer phase 2.

Lý do:
- Excel import là task power-user (engineer ngồi máy). Operator kho không upload file Excel.
- Tablet ≥768px còn dùng được — wizard responsive nhưng table preview phải scroll-x.
- Mobile <768px hiển thị banner "Vui lòng dùng máy tính để import file Excel".

```
┌────────────────────────────────────┐
│ ☰  Nhập Excel                     │
├────────────────────────────────────┤
│                                    │
│   [Icon Monitor 48px zinc-400]    │
│                                    │
│  Vui lòng dùng máy tính            │
│  để nhập file Excel                │
│                                    │
│  Wizard nhập BOM yêu cầu màn hình  │
│  rộng để xem 58+ dòng cùng lúc.    │
│                                    │
│        [Quay lại Tổng quan]        │
│                                    │
└────────────────────────────────────┘
```

## D.8. Component file tree

```
apps/web/src/
├── app/(app)/import/bom/
│   ├── page.tsx                              ← NEW container Server Component
│   └── _components/
│       ├── BomImportWizard.tsx               ← NEW client wrapper, manage step state
│       ├── SheetPickerStep.tsx               ← NEW Step 1
│       ├── MapColumnsStep.tsx                ← NEW Step 2
│       ├── PreviewCommitStep.tsx             ← NEW Step 3
│       ├── PreviewTable.tsx                  ← NEW sub-component
│       └── ImportJobStatusDialog.tsx         ← NEW polling status full-page
├── components/domain/
│   └── WizardStepper.tsx                     ← NEW reusable 1-2-3 indicator
├── lib/
│   └── bom-import-mapping.ts                 ← NEW synonym dict mở rộng
└── app/api/import/bom-excel/
    ├── parse/route.ts                        ← NEW POST upload + parse
    ├── commit/route.ts                       ← NEW POST commit + enqueue
    └── job/[jobId]/route.ts                  ← NEW GET poll status
```

---

# §E. Phụ lục

## E.1. Synonym dict tổng hợp (extension to `import-mapping.ts`)

Đã liệt kê chi tiết §D.4.3. Tóm tắt: 7 BOM-specific field × ~6-10 synonym mỗi field = ~50 synonym entries mới.

## E.2. ASCII reference — Card 380×120px (desktop)

```
┌─ 380px ─────────────────────────────┐
│ p-4 (16px padding)                  │
│ ┌─────────────────────────────────┐ │
│ │ Title row h-5                   │ │  16px
│ │ ────────────                    │ │
│ │ Hero % h-8                      │ │  32px (text-4xl)
│ │ Bar h-2 + spacer mt-2           │ │  10px
│ │ ────────────                    │ │
│ │ Subtitle row h-3                │ │  12px
│ │ ────────────                    │ │
│ │ Divider h-px + drilldown h-4    │ │  17px
│ └─────────────────────────────────┘ │
│  Total: 87px content + 32px padding  │
│       ≈ 120px height                 │
└──────────────────────────────────────┘
```

## E.3. Audit checklist trước merge phase 1

- [ ] grep `safety-orange|orange-(500|600|700)` trong files mới — chỉ cho phép trong context shortage badge.
- [ ] grep `font-bold` trong heading dashboard / wizard — phải là `font-semibold` (600).
- [ ] grep `slate-\d+` trong files mới — KHÔNG được có (V2 đã migrate sang zinc).
- [ ] grep `focus:shadow-focus` trong files mới — phải dùng `focus-visible:outline-2 outline-blue-500`.
- [ ] Verify Vietnamese diacritics render đúng trên 5 string mẫu: "Bộ phận Kỹ thuật", "Đặt hàng", "Đã nhận đủ", "Sắp ra mắt", "Số máy".
- [ ] WCAG AA contrast check: tất cả text trên bg với contrast checker. Min 4.5:1.
- [ ] Tap target ≥44px trên mobile cho tickbox + qty input.
- [ ] Reduced motion respect: `@media (prefers-reduced-motion: no-preference)` wrap mọi transition >150ms.
- [ ] Aria labels đầy đủ: progress bar, drilldown link, wizard step.
- [ ] Loading skeleton cho mọi async component.
- [ ] Empty state cho mọi list/table.

## E.4. Effort estimate UI work phase 1

| Task | Story points (Fib) | Dev days |
|---|---|---|
| A. Sidebar regroup 5 bộ phận | 2 | 1 |
| B. Trang Tổng quan `/` (page + 4 component mới + API v2) | 8 | 5 |
| C. PO Detail tickbox receiving (UI + API + service) | 5 | 3 |
| D. Excel BOM importer V1 wizard (3 step + 3 API) | 8 | 5 |
| E. Polish + a11y + responsive QA | 3 | 2 |
| **Total UI phase 1** | **26** | **16** |

Với 1 dev senior, 5 ngày/tuần → 16 dev day = **3.2 tuần**. Khớp với phase 1 brainstorm (3 tuần).

## E.5. Open questions trước implement

1. **Q (Sidebar):** Section `/admin` tách riêng group 6 hay gộp vào "Quản trị" cùng với items future như audit/logs?
   - **Default đề xuất:** giữ tách `admin` group riêng phase 1, phase 2 thêm sub-items (audit, logs).
2. **Q (Dashboard):** 6 progress bar có hardcode label hay configurable per-tenant?
   - **Default:** hardcode VN labels phase 1. Phase 3 i18n nếu cần multi-tenant.
3. **Q (PO tickbox):** Có cần upload ảnh chứng từ nhận hàng kèm không?
   - **Default:** phase 1 không. Phase 2 thêm upload ảnh per receipt.
4. **Q (Importer):** Phase 1 chỉ nhập BOM mới hay support update BOM tồn tại?
   - **Default:** chỉ tạo mới. Update phase 2.
5. **Q (Importer):** Auto-create supplier/item có cần admin approval không?
   - **Default:** auto-create không cần approval phase 1 (giảm friction). Phase 2 nếu user phàn nàn data rác → thêm flag pending approval.

## E.6. Rủi ro UI cụ thể

| Rủi ro | Tác động | Giảm nhẹ |
|---|---|---|
| User confused vì sidebar group đổi sau update | Medium | Onboarding tour `react-joyride` 5 step lần đầu login UI mới. Banner top "Sidebar đã regroup theo bộ phận — [Xem hướng dẫn]". |
| Progress bar tooltip công thức quá kỹ thuật | Low | Verify với 1 user UAT — nếu confused, đơn giản hoá ngôn ngữ ("Số linh kiện đã sẵn sàng / Tổng số linh kiện cần"). |
| PO tickbox PWA thao tác nhầm trên mobile | High | Confirm dialog cho mọi action save. Toast undo 5s sau commit ("Đã ghi nhận. [Hoàn tác]"). |
| Excel preview table 58 line lag trên Chrome cũ | Medium | Virtualize với `@tanstack/react-virtual` nếu >100 row. Phase 1 chỉ 58 line — dùng table thường OK. |
| Drilldown route filter break vì module gốc chưa support param | High | Coordinator với backend dev: mỗi module gốc verify support `?status=...` param trước khi merge dashboard. Nếu chưa → fallback dashboard link → module trang chính (không filter). |

---

## E.7. Migration path từ V2 hiện tại

### E.7.1. Sidebar
- File `nav-items.ts` thay đổi: edit type + label + ORDER + items array. Sidebar.tsx KHÔNG đổi.
- `groupNavBySection()` cần update để return cả group có 0 item (cho UX "Không có quyền truy cập").
- Test: login với mỗi role (admin/planner/operator/warehouse/purchasing) → verify sidebar render đúng.

### E.7.2. Dashboard
- `/` route hiện redirect `/bom` — thay bằng page mới render `<DashboardOverviewPage>`.
- Backward-compat: keep `/bom` accessible (sidebar có link).
- API `/api/dashboard/overview` cũ: keep, đánh deprecated. API mới `/api/dashboard/overview-v2` separate file.
- Cache strategy: Redis key `dashboard:overview-v2:{userId}` TTL 30s.

### E.7.3. PO detail
- Page `/procurement/purchase-orders/[id]/page.tsx` hiện có 4 tab (Info / Lines / History / Payment). Edit tab "Lines" để add column "Đã nhận?" + sticky footer.
- Backward-compat: trang `/receiving` cũ vẫn accessible — operator có thể dùng song song.
- DB: không cần migration phase 1 — service layer đẩy vào `inbound_receipt` + `inbound_receipt_line` schema có sẵn.

### E.7.4. Excel importer
- Route mới `/import/bom` (không đụng `/import` cũ cho Item).
- Sidebar item "Nhập Excel" → `/import` (giữ landing chọn loại import: Item / BOM). Phase 2 cleanup nếu BOM chiếm trọn.
- DB: không cần migration phase 1.

---

## E.8. Spec component `<DrilldownLink>`

```tsx
// File: apps/web/src/components/domain/DrilldownLink.tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DrilldownLinkProps {
  href: string;
  label: string;          // "Xem chi tiết"
  ariaLabel: string;      // Full sentence cho a11y
  className?: string;
  /** Analytics event name khi click */
  trackEvent?: string;
}

export function DrilldownLink({
  href,
  label,
  ariaLabel,
  className,
  trackEvent,
}: DrilldownLinkProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      onClick={() => {
        if (trackEvent && typeof window !== "undefined") {
          // analytics.track(trackEvent);
        }
      }}
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium text-blue-600",
        "transition-colors duration-150 hover:text-blue-700",
        "focus:outline-none focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 focus-visible:rounded-sm",
        className,
      )}
    >
      {label}
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
}
```

## E.9. Spec component `<WizardStepper>`

```tsx
// File: apps/web/src/components/domain/WizardStepper.tsx
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: string;
  label: string;          // "Upload"
  status: "done" | "active" | "upcoming";
}

export interface WizardStepperProps {
  steps: WizardStep[];
  className?: string;
}

export function WizardStepper({ steps, className }: WizardStepperProps) {
  return (
    <ol
      aria-label={`Tiến trình: bước ${steps.findIndex((s) => s.status === "active") + 1}/${steps.length}`}
      className={cn("flex items-center gap-2", className)}
    >
      {steps.map((step, i) => (
        <li key={step.id} className="flex items-center gap-2">
          <div
            aria-current={step.status === "active" ? "step" : undefined}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm font-medium",
              step.status === "done" && "border-emerald-500 bg-emerald-500 text-white",
              step.status === "active" && "border-blue-500 bg-blue-500 text-white",
              step.status === "upcoming" && "border-zinc-300 bg-white text-zinc-400",
            )}
          >
            {step.status === "done" ? (
              <Check className="h-3.5 w-3.5" aria-label="Đã hoàn thành" />
            ) : (
              i + 1
            )}
          </div>
          <span
            className={cn(
              "text-md font-medium",
              step.status === "done" && "text-emerald-700",
              step.status === "active" && "text-blue-700",
              step.status === "upcoming" && "text-zinc-400",
            )}
          >
            {step.label}
          </span>
          {i < steps.length - 1 && (
            <div className="mx-2 h-px w-8 bg-zinc-200" aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
}
```

---

## E.10. Tổng kết

**4 nhóm thiết kế phase 1:**
1. **Sidebar V2** — regroup 5 section + 1 admin, edit `nav-items.ts` only. ~1 ngày dev.
2. **Trang Tổng quan `/`** — 6 progress card + KPI row + reuse table/alerts. 5 ngày dev.
3. **PO Detail tickbox** — column mới + sticky footer + batch save API. 3 ngày dev.
4. **Excel BOM importer V1** — wizard 3 step + 3 API + synonym dict. 5 ngày dev.

**Tổng UI phase 1:** ~16 dev days (3 tuần) — khớp brainstorm §6 phase 1.

**Đặc điểm chung:**
- Bám sát design-guidelines-v2 (zinc + blue + Inter).
- KISS: drilldown route, không modal. Wizard 3 bước, không hơn.
- Tiếng Việt 100% UI.
- Mobile-second: chỉ dashboard + tickbox PWA, importer desktop only.
- Component reuse cao: KpiCard, OrdersReadinessTable, AlertsList, StatusBadge — đều dùng lại.

**Component mới:** 12 (tính cả 4 sub-component wizard) — manageable, không quá nặng.

**Acceptance criteria phase 1:**
- [ ] Sidebar render 6 section đúng thứ tự cho admin role.
- [ ] Dashboard `/` load <1s với cache hit, hiện đủ 6 progress + 4 KPI + 5 order + 5 alert.
- [ ] PO detail tickbox: tick 5 line, save 1 lần → DB có 1 inbound_receipt + 5 inbound_receipt_line + bom_snapshot_line.received_qty cập nhật.
- [ ] Excel importer: file mẫu thực `Z0000002-502653` import được 56/58 line (R44, R45 skip), tạo BOM template + 56 bom_line.
- [ ] WCAG AA pass: contrast checker + axe-core a11y scan.
- [ ] Reduced motion: animation tắt khi `prefers-reduced-motion: reduce`.
- [ ] Vietnamese diacritics: 100% string render đúng.
- [ ] PWA tickbox tap target ≥44px verified Chrome DevTools mobile.

---

*UI Spec by ui-ux-designer agent — 2026-04-25.*
*Version 1.0 — Phase 1 quick wins, scope locked.*
