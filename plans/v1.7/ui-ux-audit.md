# UI/UX Audit V1.6

## Mục tiêu
- Audit UI/UX hiện tại của V1.6 theo góc nhìn vận hành thật cho BOM-centric workspace.
- Ưu tiên các vấn đề ảnh hưởng trực tiếp tới cảm giác “chuyên nghiệp”, độ rõ ràng thao tác, và độ tin cậy khi user đi từ dashboard vào BOM workspace rồi tới Grid.
- Không sửa code ở bước này.

## Phạm vi đã đọc và kiểm tra
- Đã đọc:
  - `apps/web/src/app/(app)/page.tsx`
  - `apps/web/src/app/(app)/bom/[id]/layout.tsx`
  - `apps/web/src/app/(app)/bom/[id]/*`
  - `apps/web/src/app/(app)/bom/[id]/grid/page.tsx`
  - `apps/web/src/components/bom/BomTreeView.tsx`
  - `apps/web/src/components/layout/ContextualSidebar.tsx`
  - `apps/web/src/components/domain/StatusBadge.tsx`
  - `apps/web/src/components/orders/OrderListTable.tsx`
  - `apps/web/src/components/bom/BomListTable.tsx`
  - `apps/web/src/components/bom-grid/*`
  - `apps/web/src/lib/bom-grid/build-workbook.ts`
- Đã xác thực live ở mức an toàn:
  - `GET /api/health` trả `200`
  - login `admin / ChangeMe!234` thành công qua API
  - đọc BOM list live thành công
  - xác nhận các route workspace/grid có tồn tại ở production qua code path và live API/read-only checks
- Giới hạn audit:
  - production hiện chỉ có BOM cỡ nhỏ đến trung bình, BOM lớn nhất quan sát được khoảng 30 dòng; chưa có mẫu live 500 dòng để benchmark tree thật.
  - không bấm các thao tác có nguy cơ ghi dữ liệu production như `Lưu Grid` hoặc flow save-undo hoàn chỉnh.

## Kết luận nhanh
- V1.6 đã có khung BOM-centric đúng hướng, nhưng trải nghiệm tổng thể vẫn mang cảm giác “feature complete theo kỹ thuật” hơn là “một workspace production polished”.
- Điểm lệch rõ nhất nằm ở `Grid Editor`: lõi chức năng là thật, nhưng lớp trình bày đang bị Univer mặc định dẫn dắt, chưa giống một màn BOM sheet được thiết kế riêng cho xưởng.
- Mobile của BOM workspace hiện chưa xong theo đúng nghĩa usable: user vào workspace ở `<md` gần như mất điều hướng ngữ cảnh BOM.

## Kiểm thử nút Grid Editor

| Nút / khu vực | Trạng thái | Bằng chứng |
|---|---|---|
| `Lịch sử` | Hoạt động thật | Toggle `historyOpen` trong `apps/web/src/app/(app)/bom/[id]/grid/page.tsx`, render side panel log |
| `Thêm linh kiện` | Hoạt động thật | Mở `AddItemDialog`, search `/api/items`, gọi `gridRef.current?.insertItemRow(...)` |
| `Lưu Grid` | Hoạt động thật | `handleManualSave()` gọi `useSaveBomGrid()` → `POST /api/bom/templates/[id]/grid` |
| `Quay lại` | Hoạt động thật | Link thật về `/bom/[id]` |
| `Hoàn tác` | Có handler thật nhưng logic đáng ngờ | Có `handleUndo()`, nhưng stack hiện lưu snapshot sau edit nên khả năng undo không về đúng trạng thái trước |
| Toolbar spreadsheet bên trong Univer | Không phải “trang trí”, nhưng không do app kiểm soát trực tiếp | Đến từ `@univerjs/preset-sheets-core`; app hiện không expose action-level handler riêng cho từng icon |

## Top 15 vấn đề ưu tiên

### Layout

| Priority | Screenshot area | Vấn đề | Suggested fix | Effort |
|---|---|---|---|---|
| P0 | `Mobile 375px > BOM workspace > header + menu drawer` | Mobile đang mất contextual navigation của BOM workspace. `ContextualSidebar` bị `hidden md:flex`, còn drawer mobile chỉ chứa global nav, nên user không thấy 9 sub-tab ngữ cảnh BOM. | Tạo `ContextualSidebar` dạng drawer/bottom sheet cho `<md`, hoặc merge nav ngữ cảnh BOM vào mobile drawer khi ở `/bom/[id]/*`. | 4h |
| P1 | `Dashboard > landing state` | Dashboard chưa thật sự là điểm vào BOM-centric. Không có block “BOM đang chạy / workspace gần đây”, nên flow “Dashboard → vào workspace BOM” còn gượng. | Thêm 1 module “BOM đang hoạt động” hoặc “Workspace gần đây” với deep link trực tiếp vào BOM workspace. | 1d |
| P1 | `BOM workspace > nav trái` + `BOM detail > tabs trong page` | Có 2 lớp điều hướng cùng lúc: contextual sidebar bên trái và tabs nội bộ trong trang Tổng quan (`Linh kiện / Metadata / Tình trạng vật tư / Lịch sử`). Người dùng phải hiểu hai cấp nav khác nhau mà không được giải thích. | Định nghĩa lại một primary nav duy nhất. Giữ contextual sidebar cho scope workspace, hạ tabs nội bộ xuống thành section hoặc subheader nhẹ hơn. | 1d |
| P1 | `BOM workspace > Procurement / Assembly pages` | Các mục `Mua sắm` và `Lắp ráp` trông như tab production-ready nhưng thực tế là placeholder. Đây là false affordance. | Ẩn khỏi nav cho tới khi có data thật, hoặc gắn badge `Sắp có` và disable click thay vì cho vào màn empty state. | 4h |

### Component

| Priority | Screenshot area | Vấn đề | Suggested fix | Effort |
|---|---|---|---|---|
| P0 | `Grid Editor > toàn bộ sheet dữ liệu` | `buildWorkbookFromTemplate()` chỉ render root group + direct children. BOM sâu hơn 2 level sẽ không được biểu diễn đầy đủ trong grid fallback, lệch với mục tiêu “grid mặc định giống Excel mẫu”. | Chuyển builder sang recursive flatten đầy đủ mọi depth, giữ hierarchy rõ ràng và không làm rơi node cháu/chắt. | 1d |
| P1 | `Grid Editor > toolbar + vùng sheet` | Màn grid đang mang diện mạo Univer mặc định: toolbar dày, nhiều control generic, cảm giác như embed spreadsheet demo hơn là màn BOM chuyên nghiệp. | Thiết kế lại command bar riêng cho BOM Grid: chỉ giữ action có nghĩa vụ nghiệp vụ, ẩn icon không dùng, đồng bộ spacing/font với app shell. | 1d |
| P1 | `Grid Editor > header sheet và cột dữ liệu` | Dù đã có 11 cột nghiệp vụ, grid mặc định vẫn chưa “ra chất file Excel mẫu”: cột ảnh còn placeholder, cột kích thước/NCC thường rỗng, có cột dư từ spreadsheet shell, và mapping supplier đang thiên về code hơn nhãn thân thiện. | Chốt canonical column schema theo mẫu Excel: `Ảnh / Mã / Tên / Loại / Vật liệu-Nhóm / NCC / SL-bộ / Kích thước / Tổng SL / Hao hụt / Ghi chú`, với width và align cố định, không để dư cột gây nhiễu. | 1d |
| P1 | `Global pages > Work Orders / ECO` | Hệ thống status bị chia đôi: BOM workspace dùng `StatusBadge`, còn global WO/ECO dùng `Badge`. Cảm giác sản phẩm bị tách làm hai hệ visual. | Dùng một semantic status system duy nhất cho list/workspace/global pages. | 4h |
### Typography

| Priority | Screenshot area | Vấn đề | Suggested fix | Effort |
|---|---|---|---|---|
| P1 | `Grid Editor > toolbar font selector + vùng cell` | App shell đang dùng Inter/JetBrains Mono, nhưng grid mặc định cho cảm giác Arial/office-default. Sự đứt mạch font làm màn quan trọng nhất trông ít “productized”. | Khóa font mặc định của grid theo một stack rõ ràng: Inter cho UI, một sans dễ scan cho cell text, mono chỉ cho mã và số. | 4h |
| P2 | `Dashboard / workspace subtitles / empty states` | Copy còn lộ ngôn ngữ triển khai nội bộ: `V1.1`, `Phase 4`, `JOIN qua ...`, `auto-refresh 60s`. Đây là chữ đúng cho dev, sai cho user cuối. | Thay bằng copy vận hành: nói kết quả người dùng nhận được, không nói implementation detail. | 1h |

### Color

| Priority | Screenshot area | Vấn đề | Suggested fix | Effort |
|---|---|---|---|---|
| P1 | `BOM detail > tab Tình trạng vật tư` | `MaterialStatusPanel` hardcode màu riêng, không đi qua `StatusBadge`. Điều này làm semantic state lệch giữa BOM detail, workspace và board khác. | Trích meta trạng thái chung và render bằng cùng hệ thống semantic token/badge. | 4h |
### Interaction

| Priority | Screenshot area | Vấn đề | Suggested fix | Effort |
|---|---|---|---|---|
| P0 | `Grid Editor > nút Hoàn tác` | Undo hiện có khả năng không hoàn tác đúng. Trong `handleEdit()`, snapshot đưa vào stack được lấy sau khi người dùng đã edit xong, nên rất dễ chính là trạng thái mới vừa sửa. | Capture snapshot trước mutation, hoặc chuyển sang snapshot history/diff model thật. | 4h |
| P1 | `Grid Editor > trạng thái lưu góc phải` | `Chưa lưu` là trạng thái mặc định mỗi lần vào trang, ngay cả khi server đã có snapshot cũ. Đây là tín hiệu sai, làm user nghi hệ thống chưa có dữ liệu. | Load `savedAt`/`lastUpdated` từ server hoặc derive từ activity log gần nhất để hiển thị trạng thái ban đầu đúng hơn. | 1h |
| P1 | `BOM tree > 500-line scenario` | Chưa xác thực được live với BOM 500 dòng. Code hiện có virtualize > 50 dòng là đúng hướng, nhưng `flatten()`, `computeVisible()`, guide-lines per row và DnD overlay vẫn có rủi ro lag khi tree rất sâu/rộng. | Seed một BOM benchmark 500 dòng, đo FPS/interaction thật, rồi tối ưu flatten visibility + DOM guide rendering nếu cần. | 1d |

### Mobile

| Priority | Screenshot area | Vấn đề | Suggested fix | Effort |
|---|---|---|---|---|
| P1 | `BOM detail / BomTreeView trên viewport hẹp` | `BomTreeView` đang `min-w-[720px]`, nên trên màn hẹp user phải scroll ngang mạnh. Với mobile, đây gần như không usable cho cây BOM. | Định nghĩa mobile mode riêng cho tree: rút cột, chuyển metadata sang second line, hoặc khóa tree desktop-only và điều hướng sang grid/list rút gọn trên mobile. | 1d |

## 5 nhận định quan trọng nhất

1. `Grid Editor` là điểm quyết định cảm giác chuyên nghiệp của sản phẩm, nhưng hiện đang giống “spreadsheet engine được nhúng vào app” hơn là “màn BOM sheet được thiết kế riêng”.
2. Mobile của BOM workspace chưa xong ở mức flow hoàn chỉnh vì mất contextual nav.
3. Một số màn con trong workspace đang tạo kỳ vọng quá cao so với mức hoàn thiện thật vì nav cho click bình thường nhưng nội dung vẫn là placeholder.
4. Hệ thống visual semantic chưa thống nhất hoàn toàn; `StatusBadge`, `Badge`, hardcoded color và copy dev-phase đang cùng tồn tại.
5. Chức năng grid là thật, nhưng `Undo` cần được xem như lỗi nghiệp vụ tiềm ẩn chứ không phải polish nhỏ.

## Định hướng redesign riêng cho BOM Grid

- Lấy grid kiểu Excel mẫu làm mặc định, không coi đó là “view phụ”.
- Giữ đúng bộ cột nghiệp vụ của file mẫu:
  - `Ảnh`
  - `Mã linh kiện`
  - `Tên / Mô tả`
  - `Loại`
  - `Vật liệu / Nhóm`
  - `NCC`
  - `SL/bộ`
  - `Kích thước (mm)`
  - `Tổng SL`
  - `Hao hụt %`
  - `Ghi chú`
- Header BOM nên được thiết kế như sheet chuyên nghiệp:
  - tiêu đề BOM rõ
  - parent qty nổi bật
  - command bar ít nút nhưng đúng nghiệp vụ
  - typography gọn, tabular numbers rõ, freeze header đủ mạnh
- Hạn chế tối đa chrome mặc định kiểu office editor nếu nó không tạo giá trị cho user xưởng.

## Đề xuất thứ tự sửa sau audit

1. Chốt `design-spec` cho BOM Grid và BOM Workspace trước.
2. Giải quyết P0:
   - mobile contextual nav
   - recursive grid hierarchy
   - undo logic
3. Sau đó mới làm polish typography/color/empty-state copy.
