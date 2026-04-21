# Duplication Audit V1.7

Ngày audit: 2026-04-21  
Phạm vi đọc: `apps/web/src/components/**/*.tsx`, `apps/web/src/hooks/*.ts`, `apps/web/src/server/repos/*.ts`  
Nguyên tắc bước này: chỉ audit, không code.

## Kết luận nhanh

Codebase V1.6 đã có pattern khá rõ, nhưng nhiều pattern mới chỉ dừng ở mức "copy rồi chỉnh nhẹ". Kết quả là maintenance cost tăng ở 4 vùng chính:

- list/table UI
- filter + URL state
- status mapping / status label
- page shell / form shell

Nếu làm refactor có chọn lọc, mình đánh giá có thể giảm đáng kể số điểm phải sửa lặp khi bước sang V1.7 redesign, đặc biệt ở BOM workspace và các list page.

## 10 cluster trùng lặp

### 1. Compact list table shell bị copy giữa nhiều domain

**File path tiêu biểu**
- `apps/web/src/components/orders/OrderListTable.tsx`
- `apps/web/src/components/bom/BomListTable.tsx`
- `apps/web/src/components/procurement/PRListTable.tsx`
- `apps/web/src/components/procurement/POListTable.tsx`
- `apps/web/src/components/shortage/ShortageListTable.tsx`
- `apps/web/src/components/snapshot/SnapshotBoardTable.tsx`

**Dấu hiệu trùng**
- Wrapper `rounded-md border border-zinc-200 bg-white`
- Row compact `h-9`
- Hover `hover:bg-zinc-50`
- Sticky header + loading skeleton + empty state
- Virtual scroll bằng `useVirtualizer`

**Đề xuất extract**
- `CompactListTable`

**API props gợi ý**
- `columns`
- `rows`
- `getRowKey`
- `rowHeight`
- `loading`
- `empty`
- `renderRow`
- `renderSkeletonRow`
- `className`
- `virtualized`

**Risk**
- Dễ over-abstract nếu cố nhét mọi table vào một primitive duy nhất.
- Một số table có selection/action cell riêng; nếu API quá cứng sẽ phát sinh workaround.
- Risk visual regression ở sticky header và width alignment.

### 2. FilterBar shell lặp giữa các list page

**File path tiêu biểu**
- `apps/web/src/components/orders/OrderFilterBar.tsx`
- `apps/web/src/components/bom/BomFilterBar.tsx`
- `apps/web/src/components/items/FilterBar.tsx`

**Dấu hiệu trùng**
- Search input có icon trái
- Segmented filter status
- Count tổng
- Nút reset filter
- Active chips có dismiss

**Đề xuất extract**
- `ListFilterBarShell`
- `SearchFilterInput`
- `SegmentedStatusFilter`
- `ActiveFilterChips`

**API props gợi ý**
- `searchValue`
- `onSearchChange`
- `segments`
- `activeSegment`
- `onSegmentChange`
- `chips`
- `onReset`
- `totalCount`
- `rightSlot`

**Risk**
- `items/FilterBar` có phần advanced filter phức tạp hơn orders/BOM.
- Nếu ép chung quá sớm sẽ làm component khó đọc hơn thay vì đơn giản hơn.

### 3. List page URL state với `useQueryStates()` đang lặp cùng một pattern

**File path tiêu biểu**
- `apps/web/src/app/(app)/orders/page.tsx`
- `apps/web/src/app/(app)/bom/page.tsx`
- `apps/web/src/app/(app)/eco/page.tsx`
- `apps/web/src/app/(app)/work-orders/page.tsx`
- `apps/web/src/app/(app)/items/page.tsx`
- `apps/web/src/app/(app)/suppliers/page.tsx`
- `apps/web/src/app/(app)/product-lines/page.tsx`
- `apps/web/src/app/(app)/procurement/purchase-requests/page.tsx`
- `apps/web/src/app/(app)/procurement/purchase-orders/page.tsx`
- `apps/web/src/app/(app)/admin/users/page.tsx`
- `apps/web/src/app/(app)/admin/audit/page.tsx`

**Dấu hiệu trùng**
- Định nghĩa parser `useQueryStates`
- Reset `page: 1` khi đổi filter
- Tính `pageCount`
- Patch URL state rồi forward sang hook data

**Đề xuất extract**
- `useListUrlState(config)`
- hoặc helper mỏng hơn: `buildListStatePatch(current, patch)`

**API props gợi ý**
- `parsers`
- `defaults`
- `resetPageOn`
- `normalize`
- `serialize`

**Risk**
- Regression ở back/forward browser history.
- Risk đổi tên query param ngoài ý muốn nếu abstraction không giữ nguyên contract hiện tại.

### 4. `request<T>()` + `buildUrl()` bị lặp ở gần như toàn bộ hooks data-fetch

**File path tiêu biểu**
- `apps/web/src/hooks/useOrders.ts`
- `apps/web/src/hooks/useWorkOrders.ts`
- `apps/web/src/hooks/useShortage.ts`
- `apps/web/src/hooks/useEco.ts`
- `apps/web/src/hooks/usePurchaseRequests.ts`
- `apps/web/src/hooks/usePurchaseOrders.ts`
- `apps/web/src/hooks/useBom.ts`
- `apps/web/src/hooks/useItems.ts`
- `apps/web/src/hooks/useAdmin.ts`
- `apps/web/src/hooks/useSuppliers.ts`

**Dấu hiệu trùng**
- Local `request<T>()` gần giống nhau
- `URLSearchParams` build query string lặp
- JSON parse + error throw lặp
- `credentials` / headers set đi set lại

**Đề xuất extract**
- `apiFetch<T>()`
- `buildQueryString(params)`

**API props gợi ý**
- `url`
- `method`
- `query`
- `body`
- `headers`
- `signal`
- `expect`
- `mapError`

**Risk**
- Mỗi hook hiện có error shape hơi khác nhau.
- Nếu unify quá mạnh ở lần đầu dễ làm hỏng toast/error message đang dùng ở UI.

### 5. Status mapping và label mapping bị phân tán theo domain

**File path tiêu biểu**
- `apps/web/src/components/orders/OrderListTable.tsx`
- `apps/web/src/components/procurement/PRListTable.tsx`
- `apps/web/src/components/procurement/POListTable.tsx`
- `apps/web/src/components/bom/BomListTable.tsx`
- `apps/web/src/app/(app)/bom/[id]/orders/page.tsx`
- `apps/web/src/app/(app)/bom/[id]/work-orders/page.tsx`
- `apps/web/src/app/(app)/bom/[id]/eco/page.tsx`
- `apps/web/src/app/(app)/bom/[id]/layout.tsx`
- `apps/web/src/app/(app)/bom/[id]/page.tsx`
- `apps/web/src/app/(app)/work-orders/page.tsx`
- `apps/web/src/app/(app)/eco/page.tsx`
- `apps/web/src/app/(app)/product-lines/[id]/page.tsx`

**Dấu hiệu trùng**
- `statusToBadge`, `woStatusToBadge`, `ecoStatusToBadge`, `bomStatusToBadge`
- Label map riêng ở từng file
- Có nơi dùng `StatusBadge`, có nơi fallback về `Badge`

**Đề xuất extract**
- `getStatusBadgeMeta(domain, status)`
- `getStatusLabel(domain, status)`

**API props gợi ý**
- `domain`
- `status`
- trả về `{ label, variant, tone? }`

**Risk**
- Đây là cluster tác động rộng nhất; sai một mapping sẽ tạo regression thị giác lẫn nghiệp vụ.
- Cần migration dần, không nên sửa đồng loạt trong một commit lớn.

### 6. BOM workspace sub-route page shell lặp mạnh

**File path tiêu biểu**
- `apps/web/src/app/(app)/bom/[id]/orders/page.tsx`
- `apps/web/src/app/(app)/bom/[id]/work-orders/page.tsx`
- `apps/web/src/app/(app)/bom/[id]/shortage/page.tsx`
- `apps/web/src/app/(app)/bom/[id]/eco/page.tsx`
- `apps/web/src/app/(app)/bom/[id]/procurement/page.tsx`
- `apps/web/src/app/(app)/bom/[id]/assembly/page.tsx`
- `apps/web/src/app/(app)/bom/[id]/history/page.tsx`

**Dấu hiệu trùng**
- `useParams()` + `useBomDetail()`
- Breadcrumb + title + subtitle
- CTA button ở header
- loading / empty / error / content shell giống nhau

**Đề xuất extract**
- `BomWorkspacePageShell`
- `BomWorkspacePageHeader`

**API props gợi ý**
- `bomId`
- `title`
- `description`
- `icon`
- `actions`
- `children`
- `state`

**Risk**
- Một số tab còn stub, một số tab đã có table thật.
- Nếu đóng khung quá sớm sẽ khó cho các tab đặc thù như `grid` hoặc `history`.

### 7. Form shell và field helper bị copy giữa nhiều form

**File path tiêu biểu**
- `apps/web/src/components/items/ItemForm.tsx`
- `apps/web/src/components/orders/OrderForm.tsx`
- `apps/web/src/components/suppliers/SupplierForm.tsx`
- `apps/web/src/components/procurement/PRForm.tsx`
- `apps/web/src/components/procurement/POForm.tsx`

**Dấu hiệu trùng**
- Section/accordion block
- Label + helper text + required marker
- Footer action row
- `useMutation` submit state + error block

**Đề xuất extract**
- `EntityFormShell`
- `FormSection`
- `FormField`
- `FormActions`

**API props gợi ý**
- `title`
- `description`
- `sections`
- `error`
- `submitting`
- `onSubmit`
- `onCancel`
- `children`

**Risk**
- `ItemForm` và `OrderForm` dùng RHF + Zod, còn `PRForm`/`POForm` thiên local state.
- Nên extract phần view shell trước, không gom logic form engine ở vòng đầu.

### 8. Dynamic line editor pattern lặp giữa procurement và ECO

**File path tiêu biểu**
- `apps/web/src/components/procurement/PRLineEditor.tsx`
- `apps/web/src/components/eco/EcoLineEditor.tsx`

**Dấu hiệu trùng**
- Add/remove row
- Patch line theo key/localId
- Empty dashed state
- Card/grid editor theo từng dòng

**Đề xuất extract**
- `LineEditorList`
- hoặc helper hook `useEditableLines<T>()`

**API props gợi ý**
- `lines`
- `onChange`
- `createLine`
- `getLineKey`
- `renderLine`
- `readonly`
- `emptyMessage`

**Risk**
- Hai domain có schema khác nhau nhiều; nên chỉ chia sẻ state helper và empty shell.
- Không nên ép chung UI row component.

### 9. Repo `listXxx()` đang lặp pattern WHERE + count + rows + pagination

**File path tiêu biểu**
- `apps/web/src/server/repos/orders.ts`
- `apps/web/src/server/repos/workOrders.ts`
- `apps/web/src/server/repos/items.ts`
- `apps/web/src/server/repos/bomTemplates.ts`
- `apps/web/src/server/repos/ecoChanges.ts`
- `apps/web/src/server/repos/purchaseRequests.ts`
- `apps/web/src/server/repos/purchaseOrders.ts`

**Dấu hiệu trùng**
- `const where: SQL[] = []`
- `const whereExpr = where.length > 0 ? and(...where) : sql\`true\``
- count query + rows query chạy song song
- `limit/offset/orderBy`

**Đề xuất extract**
- `buildWhereExpr(conditions)`
- `listWithPagination({ countQuery, rowsQuery, page, pageSize })`

**API props gợi ý**
- `conditions`
- `page`
- `pageSize`
- `countFactory`
- `rowsFactory`

**Risk**
- Join shape mỗi repo khác nhau; chỉ nên extract helper mỏng.
- Cố generic hóa query builder ở repo layer rất dễ làm code khó debug hơn.

### 10. Pagination/footer shell ở list page bị copy nguyên khối

**File path tiêu biểu**
- `apps/web/src/app/(app)/orders/page.tsx`
- `apps/web/src/app/(app)/bom/page.tsx`
- `apps/web/src/app/(app)/items/page.tsx`
- `apps/web/src/app/(app)/suppliers/page.tsx`
- `apps/web/src/app/(app)/eco/page.tsx`
- `apps/web/src/app/(app)/work-orders/page.tsx`
- `apps/web/src/app/(app)/product-lines/page.tsx`
- `apps/web/src/app/(app)/procurement/purchase-requests/page.tsx`
- `apps/web/src/app/(app)/procurement/purchase-orders/page.tsx`
- `apps/web/src/app/(app)/admin/users/page.tsx`
- `apps/web/src/app/(app)/admin/audit/page.tsx`

**Dấu hiệu trùng**
- Footer `h-9 border-t border-zinc-200 bg-white px-4`
- Text `page / pageCount`
- Prev/Next/First/Last logic lặp

**Đề xuất extract**
- `ListPaginationFooter`

**API props gợi ý**
- `page`
- `pageCount`
- `total`
- `pageSize`
- `onPageChange`
- `showFirstLast`

**Risk**
- Có page dùng text-base, có page dùng text-xs.
- Một số page cần gắn selection/bulk action vào footer, nên component phải có slot.

## Ưu tiên refactor theo impact x effort

### Quick wins: impact cao, effort thấp-trung bình

1. `apiFetch<T>()` + `buildQueryString(params)`
2. `getStatusBadgeMeta(domain, status)`
3. `ListPaginationFooter`
4. `buildWhereExpr(conditions)`

### Strategic: impact cao, effort trung bình-cao

5. `CompactListTable`
6. `BomWorkspacePageShell`
7. `ListFilterBarShell`
8. `useListUrlState(config)`

### Later: impact trung bình, effort trung bình

9. `FormSection` / `FormField` / `EntityFormShell`
10. `useEditableLines<T>()`

## Thứ tự thực thi đề xuất

1. `apiFetch<T>()` + query builder helper  
Lý do: ít ảnh hưởng UI, giảm lặp rộng nhất ở hooks.

2. `getStatusBadgeMeta(domain, status)`  
Lý do: hỗ trợ trực tiếp cho design refresh và giảm sai màu/sai label.

3. `ListPaginationFooter`  
Lý do: extract gọn, ít rủi ro, áp dụng nhanh cho nhiều page.

4. `buildWhereExpr(conditions)` ở repo layer  
Lý do: giảm noise ở server mà chưa phải generic hóa query quá đà.

5. `BomWorkspacePageHeader` rồi mới lên `BomWorkspacePageShell`  
Lý do: chia nhỏ refactor để tránh đụng đồng loạt cả 7 tab.

6. `CompactListTable`  
Lý do: giá trị cao nhưng phải làm sau khi status/footer/filter đã ổn, nếu không sẽ đụng quá nhiều thứ một lúc.

7. `ListFilterBarShell`  
Lý do: chỉ nên làm sau khi đã thống nhất design direction V1.7.

8. `FormSection` / `FormField`  
Lý do: hiệu quả tốt nhưng không cấp bách bằng list/workspace.

9. `useListUrlState(config)`  
Lý do: hữu ích, nhưng rủi ro URL/back button cao hơn tưởng tượng; nên làm sau khi có test tốt hơn.

10. `useEditableLines<T>()`  
Lý do: phạm vi hẹp nhất, để sau.

## Khuyến nghị thực dụng cho Step 5

Nếu chỉ chọn 4 refactor để bắt đầu trong V1.7, mình chọn:

1. `apiFetch<T>()`
2. `getStatusBadgeMeta(domain, status)`
3. `BomWorkspacePageHeader`
4. `ListPaginationFooter`

Bộ này cho tỷ lệ lợi ích/rủi ro tốt nhất, đồng thời mở đường cho redesign BOM workspace và grid mà chưa cần đại phẫu toàn bộ list/table architecture.
