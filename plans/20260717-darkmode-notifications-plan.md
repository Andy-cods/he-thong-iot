# Plan: Hoàn thiện Dark mode + Size thông báo mobile (V3.12.4)

> Ngày: 2026-07-17 · Yêu cầu user: "còn phần dark mode và phần thông báo nữa, size chưa ổn với mobile — nghiên cứu, lên plan hoàn thiện". 2 agent khảo sát + agents phối hợp convert.

## A. Thông báo — size mobile (khảo sát xong, ĐÃ SỬA đợt này)
Phát hiện chính (agent audit):
1. **P0 — dropdown chuông tràn/cắt ~60px mép trái ở 360px**: panel `absolute right-0` neo theo NÚT chuông (nút cách mép phải ~76px do UserMenu), width `calc(100vw-1rem)` → mép trái = −60px. → ĐÃ SỬA: mobile dùng `fixed left-2 right-2 top-14`, desktop `sm:absolute sm:right-0 sm:w-[400px]`.
2. Title thông báo không line-clamp (dropdown + trang list) → ĐÃ thêm `line-clamp-2` (message list thêm `line-clamp-3`).
3. Trang /notifications: subtitle dài 3-4 dòng → rút gọn (phần phụ `hidden sm:inline`); nút "Đánh dấu tất cả đã đọc" → mobile hiện "Đã đọc hết"; empty state `p-8 md:p-12`.
4. Toast sonner width 356px sát mép màn <400px → globals.css co `calc(100vw-1rem)`.
Không phải vấn đề (đã kiểm): TopBar không chen chúc ở 360px; toast position đã responsive.

## B. Dark mode — hiện trạng (audit)
- Cơ chế ĐÃ hoạt động: `darkMode: ["class", '[data-theme=dark]']`, ThemeProvider localStorage `mes-theme`, toggle ở TopBar + Settings. PWA cố ý khoá light (`[data-route=pwa]`) — BỎ QUA pwa/*.
- Độ phủ: 222 file có màu light → **175 thiếu hoàn toàn**, 47 một phần.
- Mapping chuẩn (rút từ file mẫu PR-detail/engineering/work-orders[id]):
  `bg-white→dark:bg-zinc-900` · `bg-zinc-50→dark:bg-zinc-800(/60)` · `bg-zinc-100→dark:bg-zinc-800` · `border-zinc-200→dark:border-zinc-700|800` · `border-zinc-100→dark:border-zinc-800` · `text-zinc-900→dark:text-zinc-50` · `text-zinc-800→dark:text-zinc-200` · `text-zinc-600|500→dark:text-zinc-400` · `text-zinc-400→dark:text-zinc-500` · `hover:bg-zinc-50→dark:hover:bg-zinc-800/60` · semantic (emerald/rose/amber/indigo/blue): `*-50→dark:*-950/40` bg, `*-700→dark:*-400` text, `ring-*-200→dark:ring-*-800`.

## C. Phạm vi đợt này (V3.12.4) — Nhóm A: trang dùng hằng ngày
| Batch | File | Effort | Ai làm |
|---|---|---|---|
| 0 | `components/layout/Sidebar.tsx` (hiện MỌI trang, trắng hoàn toàn ở dark) | ~13 | Claude trực tiếp |
| 0 | `app/(app)/notifications/page.tsx` | ~29 | Claude trực tiếp |
| 1 | `engineering/PRTab.tsx` + `procurement/PRListTable.tsx` + `POListTable.tsx` + `sales/page.tsx` | ~40 | Agent 1 |
| 2 | `warehouse/OverviewTab.tsx` + `ReceivingTab.tsx` + `IssueTab.tsx` | ~150 | Agent 2 |
| 3 | `warehouse/LotSerialTab.tsx` + `ReportTab.tsx` + `ReceivingHistoryDrawer.tsx` | ~150 | Agent 3 |
| 4 | `engineering/WorkOrdersTab.tsx` + `sales/POTab.tsx` + `sales/SuppliersTab.tsx` | ~130 | Agent 4 |
| 5 | `sales/AccountingTab.tsx` (XL, 128 chỗ) | ~128 | Agent 5 |
Sau đó: typecheck + build → code-reviewer rà lỗi (contrast, sót chỗ, đổi nhầm logic) → deploy.

## D. Đợt sau (chưa làm — theo dõi codexdo)
- Nhóm B: detail nặng `purchase-orders/[id]` (103), `assembly/[woId]` (105), `receiving/wizard` (82), `new-lsx` (100), `suppliers/[id]` (61), admin/* + reports (~15 file M-XL).
- Nhóm C: BOM workspace/grid (~20 file, BomImportWizard 86...), production-board (gần xong).
- Quy tắc cho code mới: mọi PR mới phải kèm dark: theo mapping trên (đã có §12 guidelines; cân nhắc thêm mục dark vào checklist §12.6).
