# Code Review — V4.2 Hardening (`git diff 9efc4e2 HEAD`, branch `v42/hardening`)

Review type: READ-ONLY, correctness-focused. Không sửa file nào. Bỏ qua các
file "xuất kho từ phiếu đề xuất" (purchase-requests mark-issued/goods issue)
đang có thay đổi dở trong working tree (agent khác đang làm).

## Tóm tắt

Đã đọc kỹ: `bomTemplates.ts` (clone batch insert), `prApprovedNoPoScan.ts` +
`apps/worker/src/index.ts` (cron/registration), `finInvoices.ts` (VOID
payment fix), `finance/accounts/[id]` (block hide-with-balance), 4 route
`warehouse/*` (RBAC siết `read:inventory` + toàn bộ caller phía client),
`purchase-requests/*` (role lock + self-approval), `wo-guards.ts` +
`workOrders.ts` + `WorkOrderActions.tsx` + `useWorkOrders.ts` (PROD-01 hoàn
thành thiếu SL), `seed.ts` (production guard), `excelSafety.ts` +
`importLimits.ts` + các file export Excel, `activity-log` entity mapping,
`report-targets` audit, `NotificationBell` polling, `tabs.tsx`,
`sales/page.tsx` + `OverviewTabLazy.tsx` (server/client boundary), deleted
eco/shortage files (kiểm tra dangling reference).

Phần lớn thay đổi ĐÚNG và cẩn thận (đặc biệt: clone BOM batch-insert dùng
đúng bất biến `level = parent.level+1` được đảm bảo bởi `resolveLevel`, nên
map theo index của multi-row `INSERT...RETURNING` an toàn; RBAC siết
`inventory` đã rà hết caller thực tế, không phá route nào). 2 phát hiện thật
bên dưới.

---

## P2 — `TabsList` tự cuộn lại vị trí mỗi lần re-render, không chỉ khi đổi tab

**File:** `apps/web/src/components/ui/tabs.tsx` dòng 26-36 (hàm mới thêm trong
`TabsList`).

```tsx
React.useEffect(() => {
  const el = innerRef.current;
  if (!el) return;
  const active = el.querySelector<HTMLElement>('[data-state="active"]');
  if (active && el.scrollWidth > el.clientWidth) {
    const left = active.offsetLeft - el.clientWidth / 2 + active.offsetWidth / 2;
    el.scrollLeft = Math.max(0, left);
  }
}); // KHÔNG có dependency array
```

**Kịch bản lỗi:** `useEffect` không truyền dependency array → chạy lại sau
**MỌI** render của `TabsList`, không riêng lúc tab active đổi. `TabsList`
được dùng ở khắp app kể cả các trang Tài chính vừa redesign
(`CashbookGroupTab`, `SettlementsGroupTab` qua `sales/page.tsx` — chính màn
hình mobile 390px mà comment nói là mục tiêu sửa). Các tab này nằm trong cây
component có React Query polling/refetch (KPI, danh sách hoá đơn/thanh
toán...). Khi tab bar bị tràn (`scrollWidth > clientWidth` — đúng trường hợp
cần fix), bất kỳ re-render nào của component cha (refetch nền, đổi filter,
gõ input ở tab khác...) đều làm `TabsList` re-render → effect chạy lại → ép
`el.scrollLeft` quay về giữa tab active, xoá mất vị trí cuộn ngang mà user
vừa tự tay kéo để xem các tab bị che khuất. Trải nghiệm: user vuốt sang xem
tab ẩn, vài giây sau (refetch) thanh tab tự nhảy về vị trí cũ — đúng ngay màn
hình mobile mà fix này nhắm tới.

**Đề xuất:** Chỉ chạy effect khi tab active thực sự đổi, ví dụ track qua
`value`/`defaultValue` prop của `Tabs` (context) hoặc dùng
`MutationObserver`/so sánh `data-state` trước đó bằng `useRef`, rồi đặt giá
trị đó vào dependency array thay vì để trống.

---

## P2 — `tests/e2e/full-coverage-100.mjs` vẫn gọi `/api/eco` đã bị xoá

**File:** `tests/e2e/full-coverage-100.mjs` dòng 611-613.

```js
header("U — ECO");
const eco = await call("TK-A", "GET", "/api/eco?pageSize=5");
record("U", "list ECO", eco.ok ? "PASS" : "FAIL", eco.status, "");
```

Diff đã xoá toàn bộ `apps/web/src/app/api/eco/**` (route.ts + 5
subroute) trong V4.2 dọn dẹp, nhưng script e2e "full coverage" (đúng loại
script CLAUDE.md yêu cầu chạy để verify trước khi báo "xong") không được cập
nhật theo. Chạy suite này trước khi lên production sẽ luôn thấy mục "U — list
ECO" báo FAIL (404) dù hệ thống hoàn toàn bình thường — gây nhiễu kết quả
audit cuối cùng hoặc khiến người review bỏ qua một FAIL thật khác nằm cạnh nó
("quen mắt" với FAIL giả).

Đã kiểm tra: không còn nơi nào khác trong `apps/web/src`, `apps/worker/src`,
route/redirect (`next.config.js`, `hidden-features.ts`) gọi các endpoint ECO/
shortage/wo-trend đã xoá — chỉ riêng file e2e này còn sót.

**Đề xuất:** Xoá khối "U — ECO" (dòng 610-613) khỏi
`full-coverage-100.mjs`, hoặc đổi thành check "route đã gỡ, kỳ vọng 404" nếu
muốn giữ làm regression test cho việc xoá tính năng.

---

## Đã kiểm tra kỹ, KHÔNG phải lỗi (loại trừ chủ động)

- **Clone BOM batch insert (`bomTemplates.ts` `cloneTemplate`)** — map
  `idMap` theo index của multi-row `INSERT ... VALUES (...) RETURNING` dựa
  trên giả định Postgres giữ đúng thứ tự hàng trả về đúng thứ tự VALUES khi
  không có `ON CONFLICT`/song song hoá. Đây là hành vi thực thi chuẩn của
  Postgres (không có bước sắp xếp lại ngầm trong `ModifyTable`/`ValuesScan`,
  INSERT không chạy song song). Điều kiện tiên quyết "level = parent.level+1
  luôn đúng" được xác nhận đúng qua `bomLines.ts` `resolveLevel()` (dùng cho
  mọi đường tạo dòng, kể cả từ `bomImportParser.ts`) và hàm move-line cũng
  luôn cập nhật lại `level` toàn bộ subtree. Có test `bomTemplates.test.ts`
  xác nhận logic map cha/con đúng qua FakeDb.
- **`prApprovedNoPoScan.ts` worker job** — cột/trạng thái đúng schema thật
  (`purchase_order.pr_id`, `purchase_request.status`/`approval_step`); cron
  `30 0 * * *` UTC = 07:30 VN, đúng như comment, lệch giờ với
  `fin-invoice-reminder-scan` (07:00) để tránh đánh thức DB cùng lúc; dedupe
  qua bảng `notification` theo `eventType+entityId+createdAt>threshold` đúng
  pattern có sẵn. Điều kiện lọc PR "chưa có PO" dựa vào
  `approvalStep='DIRECTOR_APPROVED'` là đủ (mọi lần tạo PO đều set PR sang
  `CONVERTED` trong cùng transaction ở `purchaseOrders.ts`), nên không có
  nguy cơ nhắc nhầm PR đã có PO.
- **`recalcInvoicePaidAmount` bỏ payment VOID** + **block ẩn nguồn còn số
  dư** — đúng, có test, kiểu numeric string được convert `Number()` đúng chỗ.
- **RBAC siết `read:inventory`** trên 4 route `warehouse/*` — đã rà toàn bộ
  8 nơi gọi các endpoint này ở client (`receiving wizard`,
  `AdjustInventoryDialog`, `ItemQuickEditSheet`, `BinActions`, `ReportTab`,
  `GoodsIssuePanel`, `IssueMovementView`, `WarehouseLayoutTab`); tất cả đều
  nằm sau route-guard `/warehouse` hoặc `/receiving` (chỉ `admin`/`warehouse`
  theo `route-guard.ts`), khớp đúng 2 role có `inventory:read` trong
  `matrix.ts`. Không role nào bị 403 oan.
- **PROD-01 (hoàn thành LSX thiếu sản lượng)** — guard server
  (`checkWoCompletable`) + UI (`WorkOrderActions.tsx`) + hook
  (`useWorkOrders.ts`, giữ overload cũ) + repo (`completeWO` ghi lý do vào
  `notes`) khớp nhau; caller duy nhất (`work-orders/[id]/page.tsx`) đã truyền
  đủ `goodQty`/`plannedQty`.
- **Server/client boundary** (`sales/page.tsx` Server Component +
  `OverviewTabLazy.tsx` client wrapper cho `next/dynamic(ssr:false)`) — đúng
  pattern, không lặp lại lỗi từng làm sập `/warehouse`.
- **Excel formula-injection sanitize** — chỉ áp dụng field chuỗi tự do (tên,
  ghi chú, lý do), không đụng field số/ngày; đã kiểm `dnvtExportExcel.ts`,
  `ycvtExportExcel.ts` không sót field nào cần sanitize bị bỏ quên và không
  sanitize nhầm field số.
- **`seed.ts` production guard** — chặn đúng, `onConflictDoNothing` thay
  `onConflictDoUpdate` không còn ghi đè mật khẩu admin thật.
- **`activity-log` entity mapping** — sửa đúng lỗ hổng cũ (check quyền luôn
  bằng `bomTemplate` bất kể xem log của PO/WO/item gì); đã đối chiếu RBAC
  matrix, không role nào có quyền đọc log cũ nhưng mất quyền đọc log mới.
