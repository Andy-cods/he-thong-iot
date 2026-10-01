# Trạng thái NHÓM E + C-PR — Sản xuất/Lệnh SX/Bảng SX/Gia công + Đề xuất vật tư (V4.4 UI)

Branch worktree: `agent-a6467734eb8cf88ed` (base: `v43/warehouse` @ `840131a` — đã merge, xác nhận
đúng commit "Merge branch 'worktree-agent-a84b765de00d33bac' into v43/warehouse" theo yêu cầu).

## Đã sửa

| # | Mức | Điểm lệch | File |
|---|---|---|---|
| C.A | P0 | Tên gọi "Yêu cầu mua" ↔ "Đề xuất vật tư" tự mâu thuẫn cùng màn `/engineering?tab=pr` | `app/(app)/engineering/page.tsx` (tab label + pageTitle/pageSubtitle), `lib/breadcrumb-items.ts` (`HUB_TAB_LABELS["/engineering"].pr`), `lib/breadcrumb-items.test.ts` |
| C.B | P0/P1 | Form MRF còn mang tên "YCVT" (breadcrumb/H1/toast/placeholder) khác biệt DNVT song song; dialog dùng chung PR detail hiện "Phiếu YCVT" dù record là DNVT | `app/(app)/procurement/purchase-requests/new-mrf/page.tsx`, `app/(app)/procurement/purchase-requests/[id]/page.tsx` (biến `formLabel` theo `pr.formType`, áp cho toast từ chối/huỷ, dialog đóng/từ chối/huỷ/xoá) |
| C.C | P1 | Hex `#005D9F` rò ra ngoài khung phiếu, lẫn vào toolbar app (badge số phiếu) | `app/(app)/procurement/purchase-requests/[id]/page.tsx` (đổi sang `<Badge variant="info">`) |
| C.D | P1 | Bảng dòng vật tư `new-dnvt`/`new-mrf` cắt cụt mobile không chỉ báo cuộn | `new-dnvt/page.tsx`, `new-mrf/page.tsx` (thêm dòng "← Vuốt ngang để xem đủ cột →" trên mobile) |
| C.D | P1 | `DnvtDetailBody` thiếu hẳn card-list mobile (nhánh MRF đã có) | `components/procurement/DnvtDetailBody.tsx` (thêm `DnvtLineItemCard` + `Metric`/`Meta`, bảng chỉ hiện ≥md) |
| C.F | P2 | Ô "Kiểm tra tồn kho"/"Kiểm tra kỹ thuật" trống hoàn toàn, không nhất quán "—" | `components/procurement/DnvtDetailBody.tsx` (`ApprovalRow`: "—" trên màn hình, vẫn trống khi in) |
| A3 | P2 | `.toLocaleString()`/`.toLocaleDateString()` cục bộ thay vì `lib/format.ts` | `PRTab.tsx`, `new-dnvt/page.tsx`, `new-mrf/page.tsx` (gộp `formatDateVN` cục bộ → gọi `formatDate`), `work-orders/new-lsx/page.tsx`, `work-orders/[id]/page.tsx` (`fmtNum` nay gọi `formatNumber`), `components/procurement/ConvertPRToPODialog.tsx`, `components/operations/AssemblyOverviewTab.tsx`, `components/engineering/WorkOrdersTab.tsx` |
| A4 | P2 (tuỳ chọn) | `<input type="date">` → `DateField` dd/mm/yyyy ở các form phiếu chính (không áp cho ô ngày trong bảng dòng dạng spreadsheet — xem "Không sửa") | `PRTab.tsx` (filter Từ/Đến), `work-orders/new-lsx/page.tsx` (Ngày bắt đầu/kết thúc) |
| E#1 | P1 | Bảng "Lô thành phẩm đã nhập kho" dùng `overflow-hidden` (không phải `overflow-x-auto`) → cột "Nhập lúc" mất hẳn trên mobile | `app/(app)/work-orders/[id]/page.tsx` (bảng chỉ ≥md, thêm card-list đầy đủ 5 trường cho mobile) |
| E#2 | P1 | `BoardItemDialog` Dialog 12 trường vi phạm N6 | `components/production-board/BoardItemDialog.tsx` — viết lại thành Sheet + `SheetHeaderNav`, nhóm trường inset (`<Label uppercase>` theo 3 nhóm: Thông tin sản phẩm / Tiến độ & đơn vị / Khác), lỗi hiện dưới trường + cuộn tới lỗi đầu tiên (2 trường bắt buộc), cảnh báo đóng khi có thay đổi chưa lưu (mẫu giống `ItemQuickEditSheet`), ô SL căn phải tabular-nums hiện ĐVT, "Hạn giao" đổi sang `DateField` |
| E#2b | P2 | "Pcs" viết thường 4+1 chỗ khác quy ước ĐVT viết hoa | `components/production-board/BoardItemDialog.tsx` (default `uom: "PCS"`, input tự uppercase, placeholder "PCS / SET") |
| E#3 | P2 | Breadcrumb TopBar `?tab=assembly` hiện "Quy trình lắp ráp" dù nội dung thật fallback về "Yêu cầu sản xuất" (tab ẩn qua `HIDDEN_FEATURES.legacyAssembly`) | `lib/breadcrumb-items.ts` (`HUB_TAB_ALIASES["/operations"]` alias `assembly → requests` khi cờ ẩn bật), `lib/breadcrumb-items.test.ts` |
| E (trạng thái cấp vật tư) | P2 (DRY) | `work-orders/[id]/page.tsx` tự vẽ 3 span màu rời rạc cho trạng thái cấp vật tư BOM thay vì qua `StatusPill` | Thêm domain `woMaterial` vào `lib/status.ts`, đổi sang `<StatusPill domain="woMaterial" code={materialStatus} dot />` |
| Nhóm 4 (chung) | P1 | Thanh tab hub mobile — `ScrollTabsList` chỉ có mép mờ bên PHẢI, thiếu mép TRÁI khi đã cuộn qua (có thể trông như cắt chữ tab đầu khi cuộn ngược) | `components/common/ScrollTabsList.tsx` (thêm `moreLeft` + gradient trái, `scroll-smooth`) — dùng chung bởi `HubTabsNav`, `WarehouseTabsNav`, `PoSecondaryTabs`, không đổi API |
| "Xin vật tư theo BOM" (màn mới) | P2 | Bảng 6 cột không chỉ báo cuộn ngang mobile | `components/work-orders/RequestMaterialsSheet.tsx` (thêm dòng gợi ý cuộn) |

## Đã rà, KHÔNG cần sửa (ghi nhận để agent sau không lặp lại)

- `WorkOrderActions.tsx` — dialog "Hoàn thành lệnh sản xuất?" (SL thành phẩm + vị trí lưu + Chờ QC +
  lý do thiếu SL, `HIDDEN_FEATURES.fgReceipt` đã bật) ĐÃ ĐÚNG chuẩn: tối đa 4 trường hiện cùng lúc
  (ngắn, Dialog hợp N6), có `tabular-nums`, loading/disable chống bấm 2 lần, `Label required`. Không
  đổi.
- `RequestMaterialsSheet.tsx` ("Xin vật tư theo BOM") — đã dùng đúng Sheet + `SheetHeaderNav`, thuật
  ngữ "Đề xuất vật tư"/"Yêu cầu xuất kho" phân biệt rõ 2 luồng khác nhau (không lẫn PR với ISR). Chỉ
  thêm chỉ báo cuộn ngang (bảng tổng hợp read-only, giữ nguyên `overflow-x-auto` theo đúng tiền lệ đã
  chấp nhận ở `work-orders-new-lsx`).
- Ô ngày `type="date"` trong bảng dòng vật tư `new-dnvt`/`new-mrf` (per-row "Ngày cần"/"Ngày giao
  hàng") — CỐ Ý giữ `<input>` trần, KHÔNG đổi sang `DateField`: đây là ô text 11px không viền mô phỏng
  spreadsheet trong khung phiếu giấy, `DateField` (có viền + nút lịch) sẽ phá vỡ layout dày đặc. Đã đổi
  DateField ở nơi phù hợp (form-field có nhãn riêng: `PRTab` filter, `new-lsx` Ngày bắt đầu/kết thúc).
- `MarkPrIssuedDialog.tsx` dùng `.toFixed(4)` — ĐÂY LÀ logic tính giá trị mặc định ô nhập (không phải
  hiển thị), không thuộc nhóm lỗi A3 (format hiển thị cục bộ) — không đổi để tránh đụng logic.

## Chưa sửa — ngoài phạm vi file được giao (ghi lại cho nhóm khác)

- `components/admin/UserPermissionMatrix.tsx`, `components/dashboard/ProgressBarStack.tsx`,
  `components/procurement/PoCreateWizard.tsx`, `app/(app)/procurement/purchase-orders/new/page.tsx` —
  cùng lỗi C.A (còn "Yêu cầu mua"/"YCVT") nhưng thuộc nhóm Quản trị/Dashboard/PO, ngoài phạm vi file.
- `lib/wo-material-plan.ts`, `components/warehouse/*`, `components/procurement/po-detail/*` — có vài
  chỗ `.toLocaleString()` còn sót (PO, Kho) — ngoài phạm vi file (nhóm B/C-PO).

## Kiểm chứng

- `pnpm install --frozen-lockfile`: OK.
- `pnpm -r typecheck`: OK (4/4 package).
- `pnpm --filter @iot/web test`: OK — 46 file / 733 test pass (1 test breadcrumb cập nhật theo đúng
  hành vi mới đã sửa — xem `lib/breadcrumb-items.test.ts`).
- `pnpm --filter @iot/web build` (1 lần, env từ `staging-local.env`, `APP_URL`/`PORT=4600` ghi đè):
  build thành công, không lỗi biên dịch/collect page data.
- `next start -p 4600`: start OK (`Ready in 570ms`).
- Login flow end-to-end: `POST /api/auth/login` (admin/ChangeMe!234) → 200 + `set-cookie
  iot_session=...` → `GET /api/items` kèm cookie → 200.
- Smoke-test SSR (curl + cookie, không phải Playwright) 200 OK, không có marker lỗi, cho mọi route đã
  sửa: `/engineering?tab=pr`, `/engineering?tab=work-orders`, `/procurement/purchase-requests`,
  `/procurement/purchase-requests/new-dnvt`, `/new-mrf`, `/procurement/purchase-requests/[id]` (PR thật
  trên staging), `/work-orders/new-lsx`, `/work-orders/[id]` (WO thật trên staging), `/operations`,
  `/operations?tab=assembly`, `/production-board`. Xác nhận qua grep HTML: breadcrumb `/engineering`
  không còn "Yêu cầu mua", đã có "Đề xuất vật tư"; `bg-[#005D9F]` không còn trong vùng response (bảng
  dữ liệu client-render qua react-query nên nội dung động không nằm trong SSR tĩnh — xem ghi chú dưới).
- **GIỚI HẠN ĐÃ KHAI BÁO TRUNG THỰC**: môi trường agent này KHÔNG có công cụ trình duyệt/Playwright khả
  dụng (đã tìm qua ToolSearch, không có kết quả) — KHÔNG chụp được ảnh desktop/mobile/light/dark theo
  đúng yêu cầu "XEM TỪNG ẢNH". Đã bù bằng: (1) build production thật + SSR smoke-test có cookie đăng
  nhập thật trên dữ liệu staging thật (không phải chỉ `/api/health`), (2) đọc kỹ lại từng đoạn JSX đã
  sửa đối chiếu API component sẵn có (`DateField`, `StatusPill`, `Badge`, `Sheet`/`SheetHeaderNav`,
  `Checkbox`) để đảm bảo đúng prop/behavior, (3) typecheck + 733 test pass. Khuyến nghị: nhờ agent có
  Playwright chụp lại các màn trong bảng trên trước khi coi đây là "đã duyệt hình ảnh" đầy đủ theo đúng
  nghĩa gốc của yêu cầu.
