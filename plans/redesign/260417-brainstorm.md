# UI/UX Brainstorm — V1 sau tuần 2 (brutal honesty)

*Ngày:* 2026-04-17 · *Persona:* solution-brainstormer + UI/UX designer
*Trạng thái codebase:* Login + Items CRUD + Import wizard đã chạy production (https://mes.songchau.vn). Worker container tắt, migration 0002 chưa chạy.
*Scope review:* `apps/web/src/app/login/page.tsx`, `(app)/layout.tsx`, `(app)/items/page.tsx`, `(app)/items/new/page.tsx`, `(app)/items/[id]/page.tsx`, `(app)/items/import/page.tsx`, `components/items/*`, `components/ui/*`, `tailwind.config.ts`, `globals.css`, `docs/design-guidelines.md`, `plans/design/260416-v1-wireframes.md`.

---

## §1 Phân tích UI/UX hiện tại — 10 điểm brutal honesty

### 1. Login page khác hoàn toàn wireframe đã chốt — "dev-happy-path", không phải UX
Wireframe chốt split 50/50 (hero CNC line-art trái, form phải 420px, footer build info). Thực tế `app/login/page.tsx` là card `max-w-md` lủn củn giữa màn hình trắng, **không logo, không hero, không footer build**. Nhìn như demo Next.js tutorial. Lần đầu user mở trên màn 24" sẽ nghĩ trang bị vỡ. Input height 40px (không phải 48px như spec mobile), focus ring bị `focus:ring-0` override → mất ring luôn, fail WCAG 2.4.7.

### 2. Sidebar "dumb list" — không có Dashboard, không Command palette, không collapse
`(app)/layout.tsx` nav chỉ 3 item: Danh mục vật tư / Nhập Excel / Nhà cung cấp. **Thiếu route /suppliers** (link 404). Không có `/` dashboard, không có search Ctrl+K, không có breadcrumb, không có user menu dropdown. Nav item height 40px (OK desktop) nhưng **không responsive** — md:flex nghĩa là < 768px sidebar biến mất hoàn toàn mà không có bottom nav / hamburger thay thế → tablet portrait và mobile login-only không truy cập được menu.

### 3. Density sai với hot path — 48px row height lãng phí, 10k SKU nhìn như 50k
`ItemListTable.tsx` `estimateSize: 48` — wireframe nói rõ 40px desktop / 56px tablet. Hiện tại là hybrid tệ nhất: quá cao cho desktop (chỉ xem ~15 rows/screen), quá thấp cho găng tay tablet. Zebra stripe dùng `v.index % 2` nhưng header grid-cols cứng 8 cột `140px_1fr_120px_80px_120px_180px_90px_100px` → tổng ~950px, **chắc chắn horizontal scroll trên tablet 768px** (vi phạm anti-pattern #5 trong design-guidelines.md).

### 4. Click entire row → mở edit page mà không có quick preview
Row là `<Link href="/items/${id}">` → click đâu cũng nhảy route. Không có inline expand, không có side-panel preview, không có multi-select, không có context menu. Wireframe nói rõ "column Actions `[👁][✏][📋]`" + bulk action bar khi `selectedRows > 0`. Thiếu toàn bộ. Checkbox column trong wireframe cũng không có → không thể bulk-delete / bulk-export.

### 5. Filter bar thiếu tính năng cơ bản cho xưởng 10k SKU
Chỉ có `q` text + type select + active select. **Thiếu:** lọc theo nhóm (category), theo supplier, theo lot-tracked/serial-tracked, theo min-stock violation, theo barcode existence. Không có URL state (filter mất khi refresh). Không có "Save filter" / preset. Không có NFD normalize client-side hint — mặc dù backend có pg_trgm + unaccent (nhưng migration 0002 chưa apply → search tiếng Việt không dấu hiện **không chạy**).

### 6. Form Item — UX lỗi thời, không có sections, label/input cramped
`ItemForm.tsx` là một tường dài 8 field không chia section. Wireframe spec dày hơn: Thông tin cơ bản | Kho & bổ sung | Tracking | Mô tả. Hiện tại 2-col grid khô khan, label trên input (OK) nhưng helper text `min-h-[16px]` tạo jank khi message xuất hiện/biến mất. Checkbox "Quản lý theo lô" dùng native `<input type="checkbox">` thay vì shadcn Checkbox → không có focus ring thống nhất. SKU real-time check là plus, nhưng **không debounce UI feedback** — "Mã khả dụng" nháy liên tục khi user gõ.

### 7. Import Wizard — palette không match, dùng brand-500/600 không tồn tại
`ImportWizard.tsx` hard-code `border-brand-500 bg-brand-50` và `bg-brand-600 text-white`, nhưng `tailwind.config.ts` chỉ định nghĩa `brand.DEFAULT / ink / steel / mist` — **không có scale 50-900**. Result: 4 class dead, dropzone active state không đổi màu, step indicator hiển thị màu mặc định trắng-xám. Stats card dùng `text-emerald-700 / text-red-700` trực tiếp (bypass tokens success/danger). Preview table render `any` → TS type leak. Không có remap cột Excel (mapping wizard), không có template download flow có instructions.

### 8. Empty / Error / Loading states — text trần, không design
- Items list empty: `"Không có dữ liệu."` gray text giữa white box. Không illustration, không CTA "Import từ Excel" hay "Tạo mới", không gợi ý.
- Items list loading: `"Đang tải…"` — không skeleton row, user thấy white flash rồi table nhảy.
- Item detail loading: `"Đang tải thông tin…"` text plaintext trong page.
- Item detail 404: text đỏ trần, không button "Về danh sách".
- Form validation: helper text `min-h-[16px]` đủ cho 1 dòng, nhưng error dài sẽ clip.
- Delete: dùng native `confirm()` (!) — wireframe rõ ràng yêu cầu shadcn Dialog type-to-confirm cho destructive action.

### 9. Dashboard / overview — CHƯA CÓ, và đó là vấn đề lớn nhất
Landing page `/` là static card "Đăng nhập" + "Kiểm tra hệ thống" → không có. Wireframe #2 dành cả màn Dashboard tổng Readiness (4 KPI + Orders table + alerts + WO progress + sparklines). User login xong redirect `/app` (nhưng `/app` không tồn tại, route group `(app)` chỉ là layout) → thực tế router.push sẽ 404 hoặc rơi vào `/items`. **Admin đăng nhập không có cái gì để nhìn** — đây là trải nghiệm đầu tiên và nó trống rỗng.

### 10. Tablet + PWA + Scan UX — ZERO tồn tại trong code
Wireframe #7 (Receiving), #8 (PWA Picklist + Scan) là P0 hot path cho warehouse/operator. Code chưa có route `/pwa/*`, không có `next-pwa` config, không có `manifest.webmanifest` thật sự (layout khai báo nhưng file chưa có → PWA icons 404), không có service worker, không có `html5-qrcode`, không có Dexie offline queue, không có haptic/beep abstraction. Nói thẳng: V1 chưa cover 2/8 màn chính và đó lại là 2 màn decide "dùng được ở xưởng hay không". Desktop-only → user warehouse sẽ vẫn mở Excel.

### Bonus findings
- **Focus ring:** login input `focus:ring-0` override token `shadow-focus` → WCAG 2.4.7 fail.
- **Button icon spacing:** `gap-1.5` (6px) ổn; nhưng `Link` wrap button dùng `<Button asChild>` — icon bên trong nested `<Link>` không có `aria-hidden` nhất quán.
- **Mã SKU mono font** render OK trong table, nhưng detail page `<span className="font-mono">` không áp `text-xs` → font size lớn hơn xung quanh → không cân đối.
- **Toast position:** Sonner default (top-right) — wireframe yêu cầu bottom-right desktop, top-center PWA. Chưa config.
- **Date format:** `updatedAt` trong ItemRow chưa render ở đâu → wasted column trong interface.
- **Suppliers route:** nav link `/suppliers` dẫn 404 — user click vào là mất uy tín.
- **Keyboard nav:** không có Ctrl+K, không có `/` focus search, không có `j/k` di chuyển row table.

---

## §2 Ba direction redesign + tradeoffs

### Direction A — Polish tối thiểu (giữ nguyên xương, chỉ fix thịt)
**Giữ:** Industrial Slate palette, sidebar trái, route structure, shadcn stack.
**Đổi:**
- Viết lại `/login` theo wireframe #1 (split 50/50, hero SVG, footer build).
- Thêm `/app/page.tsx` dashboard tối thiểu (4 KPI cards + "Xin chào" + quick links).
- Sửa `ItemListTable` row 40/56, bỏ horizontal scroll (responsive cột), thêm checkbox + Actions column.
- Thêm skeleton loading states, illustration empty state.
- Thay `confirm()` bằng shadcn Dialog.
- Fix focus ring login, palette brand-500/600 → cta/slate.
- Tạo route `/suppliers` stub (hoặc xoá nav item tới khi có).
- Config Sonner position.
**Tradeoff:**
- **Ưu:** 3–5 ngày work, không risk, deploy được trước demo khách.
- **Nhược:** Vẫn thiếu Dashboard thật, BOM editor, PWA, Receiving. User warehouse vẫn không xài được.
- **Khi chọn:** nếu mục tiêu ngắn hạn là "show được cho Song Châu xem" mà chưa cần roll-out thực.

### Direction B — Refresh trung bình (cùng palette, restructure navigation + Dashboard mới + 1 hot-path PWA)
**Giữ:** Industrial Slate palette + typography (đã chốt, WCAG ổn, không đổi).
**Đổi structurally:**
- App shell mới: sidebar collapsible (w-60 / w-14 icon-only), top bar với Ctrl+K Command palette (`cmdk`) + breadcrumb + user menu dropdown + notification bell.
- Dashboard thật `/` với Orders Readiness table + 4 KPI + alerts + sparklines (wireframe #2 desktop variant).
- Items list redesign đúng density: row 40px, sticky first col, resize/pin cột, URL-state filter, bulk action bar, side-panel quick-edit thay vì full page edit.
- Import Wizard v2: thêm bước "Map cột Excel → trường DB" (xưởng thường có sẵn file format riêng), sửa palette dead.
- Item detail: dùng Sheet trượt phải thay vì `/items/[id]` full page — faster navigation.
- Form validation: chia section với Accordion, inline helper text không jank (reserve space).
- **Thêm 1 hot path PWA:** `/pwa/scan` minimal — receive PO (wireframe #7). Dexie queue + html5-qrcode + manual input fallback. Không làm full PWA picklist, chỉ cover "nhận hàng" flow.
- Thêm skeleton, illustration empty state, Dialog confirm.
**Tradeoff:**
- **Ưu:** 10–14 ngày work, deliver được 3 trong 8 màn wireframe chất lượng production, đủ cho UAT đầu tiên với warehouse thực.
- **Nhược:** BOM editor + Picklist PWA vẫn chưa có → planner và operator tablet chưa dùng full flow.
- **Khi chọn:** nếu có 2 tuần tới trước milestone và muốn UAT đúng nghĩa với xưởng Song Châu.

### Direction C — Redesign toàn diện (modern SaaS look + dark mode + keyboard-first)
**Đổi tất cả:**
- Palette v2: zinc/stone thay slate, accent electric-blue (#3B82F6) thay safety-orange cho CTA, dark mode default cho desktop (light mode cho tablet xưởng — toggle by device, không user preference).
- Typography: thêm `Geist` (Vercel) cho heading, giữ Inter body, JetBrains Mono mono.
- Command palette đóng vai trò navigation chính (kiểu Linear / Raycast), sidebar chỉ là visual redundancy.
- Full keyboard navigation: j/k di chuyển, `/` focus search, `e` edit selected, `d` delete, `?` help.
- Radix primitives + framer-motion transitions (slide/fade spring), haptic-like micro-interactions.
- Dashboard dạng "metric tiles" draggable (kiểu Datadog), persist per-user.
- Tạo toàn bộ 8 màn wireframe + thêm 3 màn mới: global Search, Notification inbox, Saved filter manager.
- PWA full (Receiving + Picklist + Scan + Offline queue + Background sync).
**Tradeoff:**
- **Ưu:** Nhìn xịn, competitive với Linear/Notion, team tech hào hứng, recruit dễ.
- **Nhược:** 6–10 tuần, risk cao, **dark mode trái nguyên tắc design-guidelines.md** ("xưởng sáng, không dark mode V1"), keyboard-first không hợp user warehouse đeo găng, electric-blue CTA làm mất signal orange dùng cho "shortage/alert" — phá convention industrial. Nhiều feature user không yêu cầu (YAGNI fail).
- **Khi chọn:** nếu scope V1 slip thành V2 và muốn "đẹp để demo đầu tư", không phải đẹp để xưởng dùng.

---

## §3 Khuyến nghị

**Chọn Direction B — Refresh trung bình.**

**Lý do:**
1. **Palette Industrial Slate đã đúng context** — design-guidelines.md đã reasoning kỹ (xưởng sáng, găng tay, contrast AAA, WCAG AA). Đổi palette (Direction C) là vứt 2 tuần research + cook.
2. **Direction A không giải quyết vấn đề cốt lõi:** Dashboard trống, PWA không có. Polish login không cứu được trải nghiệm roll-out thực.
3. **Direction C over-engineer:** Dark mode, keyboard-first, command-palette-as-nav là pattern SaaS B2B Tier 1 (Linear), không phải MES xưởng Việt Nam. User chính không phải dev ninja — là thủ kho, planner Excel power-user. Họ cần "rõ ràng + ít click", không cần "cool".
4. **Direction B hit 3 acceptance criteria quan trọng nhất:**
   - Admin login xong thấy Dashboard có thông tin → dùng được ngay.
   - Items list đủ density + filter URL-state → replace Excel được cho 10k SKU.
   - Receiving PWA min viable → warehouse tablet có thể scan thay vì ghi giấy (chứng minh flow end-to-end chạy).
5. **Budget realistic:** Tuần 3–4 dedicate vào FE polish + 1 PWA route, tuần 5 cho BOM editor, tuần 6 cho Order Detail + Snapshot Board. Khớp plan 10 tuần V1.

**Điều kiện nếu khuyến nghị khác:**
- Nếu demo cho khách lớn trong < 1 tuần → Direction A (không đủ time làm B).
- Nếu user thực tế là planner trẻ quen Notion / Linear → Direction C có thể consider cho V1.5 (sau khi V1 production 2 tháng).

---

## §4 Bug full-stack cần fix song song (trước khi FE redesign merge)

Ghi nhận ngay để khi bắt đầu work Direction B không bị block bởi hạ tầng. Mỗi bug kèm priority + estimate.

### P0 — Block production correctness
1. **`lib/env.ts` regex bug inject DATABASE_URL.**
   - Triệu chứng: password có ký tự đặc biệt (`!`, `$`) bị URL-encode sai khi ghép DSN.
   - Workaround hiện tại: hard-code DATABASE_URL trong `.env` VPS.
   - Fix: viết lại với `new URL()` thay regex + unit test với 5 password edge case (space, `!`, `@`, `:`, `/`).
   - Effort: 2h.
2. **Migration 0002 `pg_trgm + unaccent` chưa apply.**
   - Triệu chứng: search tiếng Việt không dấu `banh rang` không match `bánh răng` (backend không lỗi, chỉ trả rỗng).
   - Fix: `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent;` + GIN index `items_search_gin` + function `immutable_unaccent`. Run qua `drizzle-kit migrate` trên VPS.
   - Effort: 1h (viết migration) + 30m apply.
3. **Worker container disabled — pnpm symlink missing trong runtime image.**
   - Triệu chứng: `docker compose up worker` exit 1, shared package không resolve.
   - Fix options:
     - (a) Dockerfile dùng `pnpm deploy --filter=@iot/worker ./deploy` rồi copy `deploy/` vào runtime stage.
     - (b) Hoặc bundle worker thành single file bằng `tsup` / `esbuild`, bypass workspace symlink hoàn toàn.
   - Recommend (b) cho worker (ít file, ít dep), giữ (a) cho web nếu cần sau.
   - Effort: 4–6h.

### P1 — Block full UAT
4. **Cookie name consistency.**
   - `(app)/layout.tsx` dùng `AUTH_COOKIE_NAME` (`iot_session`?), middleware có dùng tên khác không? Verify grep `iot_session` vs `iot_access` cross-codebase.
   - Fix: single source of truth trong `@iot/shared/constants.ts`.
   - Effort: 1h grep + align.
5. **TS typecheck clean (`pnpm -r typecheck`).**
   - Likely có `any` leak trong `ImportWizard.tsx` preview row, router.push tới `/app` (route không tồn tại), `ItemDetail` cast `data as ItemDetail`.
   - Fix: sinh type từ zod schema, xoá any, fix router target.
   - Effort: 2–3h.
6. **Test fail (`pnpm -r test`).**
   - Chưa verify — chạy trước khi redesign để biết baseline.
   - Effort: 1h audit + 2–4h fix tuỳ số lượng.

### P2 — Polish UX và hạ tầng
7. **PWA icons 404.**
   - `manifest.webmanifest` khai báo trong metadata nhưng chưa có file thật trong `public/`.
   - Fix: sinh icon set 192/256/384/512 + favicon + apple-touch-icon từ logo SVG (dùng `pwa-asset-generator` hoặc ImageMagick). Viết `manifest.webmanifest` chuẩn với `display: standalone`, `theme_color: #0F172A`, `background_color: #F8FAFC`.
   - Effort: 2h.
8. **CSP cleanup.**
   - Hiện tại có `Content-Security-Policy` không? Check `next.config.js` + Caddy. Nếu `unsafe-inline` cho script → siết lại với nonce; style cho phép `unsafe-inline` tạm (Tailwind runtime không cần).
   - Effort: 3h (tuỳ mức strict muốn đạt).
9. **R2 storage placeholder cho file (ảnh item, scan attachment, export Excel).**
   - Hiện tại chưa có upload ảnh item trên form. Direction B nên thêm field "Ảnh" → cần bucket thật.
   - Fix: tạo bucket `iot-prod` trên Cloudflare R2, lưu credentials vào `.env` VPS, viết `lib/storage.ts` với signed URL + client-direct-upload pattern. Không block V1 nếu user OK không có ảnh item tuần này.
   - Effort: 4h lần đầu setup + 2h FE presigned upload.

### P3 — Nice-to-have
10. **Rate limiting login endpoint** (5 sai/phút/IP).
11. **Audit log UI** (wireframe mention nhưng chưa P1).
12. **TV kiosk mode** (wireframe #2 TV variant) — V1.1.

---

## §5 Scope đề xuất cho Direction B redesign

### 5.1 Screens cần touch (prioritized)

| # | Route | Action | Priority | Effort |
|---|-------|--------|----------|--------|
| 1 | `/login` | Rewrite theo wireframe split 50/50 + hero SVG + footer build | P0 | 1d |
| 2 | `/` (root) | Tạo Dashboard mới (4 KPI + Orders Readiness table placeholder + system status) | P0 | 2d |
| 3 | `(app)/layout.tsx` | App shell v2: collapsible sidebar, top bar, Ctrl+K Command palette, user menu, breadcrumb | P0 | 2d |
| 4 | `(app)/items` | Density fix (40/56px), responsive cột, checkbox + Actions, URL-state filter, bulk action bar, Sheet quick-edit | P0 | 2.5d |
| 5 | `(app)/items/new` + `(app)/items/[id]` | Chuyển sang Sheet variant (hoặc giữ page nhưng thêm Tabs "Thông tin / Tồn kho / Tracking / Ảnh"), confirm Dialog thay `confirm()` | P1 | 1.5d |
| 6 | `(app)/items/import` | Fix palette brand-*, thêm bước map cột, improve preview table (sticky header, row # col, invalid row highlight) | P1 | 1.5d |
| 7 | `/suppliers` | Stub list đơn giản (reuse ItemListTable pattern) để nav link không 404 | P1 | 1d |
| 8 | `/pwa/receive/[poId]` | Receiving console tablet tối thiểu (wireframe #7): list PO lines, scan input, qty + lot, QC radio, offline-capable | P1 | 3d |

**Total:** 14.5 ngày — fit trong sprint 2 tuần (10 working days) × 1.5 người ≈ khả thi.

### 5.2 Component mới cần cook

| Component | Vị trí | Ghi chú |
|-----------|--------|---------|
| `AppShell` | `components/layout/AppShell.tsx` | Wrap `(app)/layout.tsx`, chứa Sidebar + TopBar + Breadcrumb |
| `Sidebar` (collapsible) | `components/layout/Sidebar.tsx` | w-60 / w-14 toggle, persist localStorage, icon-only mode có tooltip |
| `TopBar` | `components/layout/TopBar.tsx` | Logo (mobile), breadcrumb, CmdK trigger, notification bell, user menu |
| `CommandPalette` | `components/command/CommandPalette.tsx` | `cmdk` lib, Ctrl+K global, nav + search items + action "Tạo mới" |
| `UserMenu` | `components/layout/UserMenu.tsx` | Dropdown với username, role, settings, logout |
| `Breadcrumb` | `components/ui/breadcrumb.tsx` | shadcn primitive, auto-generate từ pathname |
| `Dialog` | `components/ui/dialog.tsx` | shadcn, thay `confirm()` |
| `Sheet` | `components/ui/sheet.tsx` | shadcn, quick-edit item side panel |
| `Checkbox` | `components/ui/checkbox.tsx` | shadcn, thay native checkbox trong form |
| `Skeleton` | `components/ui/skeleton.tsx` | shadcn, list loading states |
| `EmptyState` | `components/ui/empty-state.tsx` | Illustration + title + desc + CTA, preset `no-data`, `no-filter-match`, `error` |
| `StatusBadge` | `components/domain/StatusBadge.tsx` | icon + label + color (3 kênh, không color-only), preset `active`, `inactive`, `shortage`, `ready`, `draft`, `released` |
| `KpiCard` | `components/domain/KpiCard.tsx` | value + label + delta + status color |
| `OrdersReadinessTable` | `components/domain/OrdersReadinessTable.tsx` | Dashboard table (data mock V1 tuần này, real khi orders module ready) |
| `ItemQuickEditSheet` | `components/items/ItemQuickEditSheet.tsx` | Sheet wrap ItemForm, open from list |
| `ColumnMapperStep` | `components/items/ColumnMapperStep.tsx` | Import wizard new step 2: map source header → target field |
| `BarcodeScanner` | `components/scan/BarcodeScanner.tsx` | html5-qrcode wrap, fallback manual input |
| `ScanQueueBadge` | `components/scan/ScanQueueBadge.tsx` | Dexie queue count, clickable xem chi tiết |
| `ReceivingConsole` | `components/receiving/ReceivingConsole.tsx` | PWA hot path wireframe #7 |

### 5.3 Design tokens cần đổi / thêm

**Không đổi palette chính** (Industrial Slate × Stock Green × Safety Orange giữ nguyên).

**Thêm / fix:**
- `tailwind.config.ts` — thêm `brand` scale 50-900 (tương đương slate, mapping: 50→#F8FAFC, 500→#334155, 600→#1E293B, 700→#0F172A) để `ImportWizard` hết dead class, **hoặc** refactor ImportWizard dùng `cta` / `slate` (chọn option 2, đúng design system).
- Thêm `text-success-strong: #047857` (darker green) cho state "Đã xác nhận scan" — đạt contrast 7:1 trên bg-base.
- Thêm `border-focus: rgba(3, 105, 161, 1)` cho focus-visible (currently shadow only).
- Thêm keyframe `shake` (scan error) + `flash-success` (scan OK) trong globals.css.
- Thêm utility `.tabular-nums` default cho tất cả `.font-mono` element (đã có một phần).
- Thêm CSS variable `--sidebar-width` + `--sidebar-width-collapsed` (persist qua localStorage, restore SSR-safe).
- Thêm `z-index` scale: `z-sidebar: 20`, `z-topbar: 30`, `z-command-palette: 50`, `z-dialog: 60`, `z-toast: 70` — hiện đang lộn xộn.

### 5.4 Non-UI changes cần pair

- Sonner provider: set `position="bottom-right"` desktop, `position="top-center"` khi `window.matchMedia('(max-width: 1024px)')`.
- `next/font` giữ nguyên, nhưng thêm `preload: true` cho Be Vietnam Pro (heading visible first).
- Middleware: verify `/` được protect (cần login) — hiện chỉ `(app)/*` protect. Cần cho root redirect → `/login` nếu unauth, `/` dashboard nếu auth.
- Route group: đổi `/app` reference trong login page → `/` (Dashboard) sau khi có dashboard.
- Query client default: `staleTime: 30s` cho list, `5m` cho constants (UoM, ItemType).

### 5.5 Acceptance criteria cho merge Direction B

- [ ] Lighthouse ≥ 90 Performance + 95 Accessibility + 100 Best Practices trên `/login`, `/`, `/items`.
- [ ] axe-core 0 serious/critical trên 3 route trên.
- [ ] Tablet 1024×768 không có horizontal scroll trên `/items`.
- [ ] Tap target ≥ 48px trên `/pwa/receive/*`.
- [ ] Search tiếng Việt không dấu hoạt động (`banh rang` → `bánh răng`) sau khi migration 0002 apply.
- [ ] `pnpm typecheck` + `pnpm test` pass 100%.
- [ ] PWA install prompt hiển thị trên Chrome Android (manifest + icons + service worker hợp lệ).
- [ ] Dashboard render < 1s TTI với data mock; < 2s với API thật.
- [ ] Keyboard-only user navigate được từ Dashboard → Items → Item detail → Back → Logout.
- [ ] Tất cả empty/loading/error states có design riêng (không plaintext).

---

## §6 Next steps (không phải todo, là thứ tự logic)

1. **Ngày 1:** Fix §4 P0 (env.ts, migration 0002, worker Dockerfile). Không touch FE.
2. **Ngày 2–3:** Cook AppShell v2 + CommandPalette + Dialog + Sheet + Checkbox + Skeleton + EmptyState + StatusBadge + KpiCard (components foundation).
3. **Ngày 4:** Rewrite `/login` + tạo `/` Dashboard skeleton.
4. **Ngày 5–6:** Items list redesign (density + filter + bulk + Sheet quick-edit).
5. **Ngày 7:** Item detail refactor (Tabs section + Dialog confirm) + ItemForm polish.
6. **Ngày 8:** Import Wizard v2 (palette fix + ColumnMapper step).
7. **Ngày 9:** Suppliers stub + `/pwa/receive/*` min viable.
8. **Ngày 10:** Accessibility audit + Lighthouse + final QA + merge.

---

*End of brainstorm. Version 1.0 — 2026-04-17. Output này không thực thi code, là blueprint cho sprint redesign.*
