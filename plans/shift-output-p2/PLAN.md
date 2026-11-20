# Sản lượng ca — P2: giờ chạy thực tế + ca do xưởng tự sửa + ảnh mã hàng

Nhánh `feat/shift-output-p2` (từ origin/main 39102d3). Migration **0089**.
Quyết định chủ xưởng (Thang, 20/11): tài khoản XƯỞNG tự chỉnh giờ; mã hàng có ảnh.

## 1. Dữ liệu (0089_shift_output_p2.sql — idempotent, BEGIN/COMMIT)

| Bảng | Cột mới | Ghi chú |
|---|---|---|
| `shift_output_entry` | `work_start time NULL`, `work_end time NULL` | Giờ chạy thực tế. CHECK `shift_output_entry_work_window_chk`: cả 2 NULL hoặc cả 2 có và `work_start <> work_end`. `work_end <= work_start` = qua nửa đêm. |
| `site_part` | `image_asset_id uuid NULL` FK → `bom_asset(id)` ON DELETE SET NULL | Tái dùng kho ảnh dedup sha256 của BOM V5 (0083). |

- `shift_minutes` GIỮ nghĩa "phút khả dụng của dòng": dòng có giờ thực tế → `= phút(work_start→work_end)`; dòng cũ / demo (NULL) giữ nguyên (KHÔNG backfill).
- Đổi giờ ca sau này KHÔNG đụng dòng cũ (shift_minutes + work_* là snapshot).
- `qty_planned` hiện là số NHẬP TAY (không suy từ cycle time) → không cần tính lại.
- Smoke `0089_shift_output_p2_smoke.sql` (ROLLBACK): cột/FK tồn tại, CHECK cửa sổ giờ (1 cột NULL → lỗi, bằng nhau → lỗi, qua nửa đêm OK), dừng ≤ shift_minutes vẫn chặn, xoá asset → image_asset_id NULL, dòng demo cũ không đổi.

## 2. Giờ ca & phút (lib/shift-output/shift-window.ts, thuần)

- `workWindowMinutes(start, end)`: end > start → end−start; end < start → end+1440−start; bằng → `null` (không hợp lệ). Phạm vi 1..1439.
- `entryMinutes(shift, workStart?, workEnd?)`: có giờ thực tế → `workWindowMinutes`, không → `shiftMinutes(shift)`.
- `crossesMidnight(start,end) = end < start` — ca TỰ nhận qua nửa đêm (bỏ checkbox).
- VN không có DST → phút = hiệu giờ đồng hồ (tz Asia/Ho_Chi_Minh), không cần Date.

## 3. API

| Route | Thay đổi |
|---|---|
| `POST /entries`, `/entries/bulk` | body nhận `workStart`, `workEnd` ("HH:MM", cả 2 hoặc không). shift_minutes = phút thực tế. Hàng đợi offline gửi payload nguyên → tự mang 2 trường; payload cũ (không có) → phút theo ca như P1. |
| `PATCH /entries/[id]` | `workStart/workEnd` (cả 2; `null,null` = về giờ ca). Đổi ca mà dòng có giờ thực tế → giữ giờ thực tế; không có → phút theo ca mới (như P1). V4 dừng ≤ phút thực tế. Audit diff gồm workStart/workEnd/shiftMinutes. |
| `GET /entries`, `/board`, báo cáo, Excel | trả `workStart/workEnd`; Excel thêm cột "Giờ chạy", "Phút chạy". Board: ô hiện giờ thực tế khi khác giờ ca + ảnh mã hàng nhỏ; cột ca/máy đã ngừng dùng vẫn hiện nếu ngày đó có dòng. |
| `POST/PATCH /setup/shifts` | `crossesMidnight` server tự suy (client gửi thì bỏ qua); giờ bắt đầu = kết thúc → 422. Không cho ngừng dùng ca đang dùng CUỐI CÙNG (422 LAST_ACTIVE_SHIFT). |
| `GET/POST/DELETE /parts/[id]/image` (mới) | GET `?size=thumb|full&v=` — quyền `read:shiftOutput` + phạm vi site (workshop xem được). POST multipart `file` — `update:shiftOutputSetup`, ≤ 5MB, magic-bytes JPEG/PNG/WEBP; lưu qua `saveImage()` (sharp: gốc ≤1600px, thumb webp 96px). DELETE gỡ ảnh. Audit `shift_setup_parts` UPDATE. |
| `GET /context` | `permissions.setupKinds` (danh mục user sửa được), `permissions.siteSettings`. |

## 4. RBAC

- Matrix: `workshop.shiftOutputSetup` = create, read, **update, delete** (trước: create, read).
- `SHIFT_SETUP_WORKSHOP_KINDS` = **parts, operators, shifts** — tài khoản xưởng (module-locked) chỉ thêm/sửa/ngừng dùng 3 danh mục này, guard ở route (`setupKindDenied`). Máy, lý do lỗi/dừng, Thiết lập xưởng (giờ tự khoá, lùi ngày, %NG) GIỮ admin: máy = tài sản; lý do = chuẩn Pareto; thiết lập xưởng = tham số kiểm soát (xưởng tự nới khoá là mất ý nghĩa khoá).
- Vai khác giữ hành vi P1 (danh mục ngoài 3 loại vẫn cần `update:shiftOutputSetup`).
- Phạm vi site giữ nguyên `shiftOutputScope` (ngoài site → 404).

## 5. UI (mobile-first, primitives sẵn có)

- **Nhập ca**: panel "Giờ chạy thực tế" ngay dưới chọn ca: 2 ô `<input type=time>` (picker gốc của điện thoại), mặc định giờ ca, hiện "= 12 giờ · qua nửa đêm", nút "Theo giờ ca". Đổi ca khi chưa sửa tay → tự lấy giờ ca mới. Dừng máy tối đa = phút thực tế.
- **Sửa dòng**: cùng panel; dòng cũ không có giờ thực tế chỉ gửi khi người dùng sửa.
- **Cài đặt**: xưởng sửa/ngừng dùng Mã hàng, Người phụ trách, Ca; ca bỏ checkbox "qua nửa đêm" (tự nhận, hiện nhãn). Mã hàng: cột ảnh thumbnail, ô chọn ảnh khi thêm, Thay/Gỡ ảnh khi sửa.
- **Ảnh**: `PartImage` khung cố định, nền xám nhạt, `object-contain` căn giữa 2 chiều (không méo/cắt), chạm → Dialog ảnh lớn. Dùng ở: danh sách Mã hàng, chọn mã hàng (Nhập ca), ô Máy×Ca (Hôm nay).
- **Lịch sử / Hôm nay / Báo cáo**: "07:00–19:00" khi khác giờ ca; "trên N' máy-ca" dùng phút thực tế (KPI).

## 6. KPI

`computeKpis`: phút khả dụng mỗi (ngày, ca, máy) = max(phút dòng cũ không có giờ, ĐỘ DÀI HỢP các khoảng giờ thực tế) — 2 mã chạy nối tiếp 07–12 + 12–19 = 720', 2 mã cùng giờ ca = 1 lần. Khoảng neo theo giờ bắt đầu ca (độ lệch gần nhất ±12h) để xử lý qua nửa đêm.

## 7. Ảnh — lưu trữ

`UPLOAD_DIR` (prod `/app/uploads`, bind-mount `./uploads` của compose → bền qua redeploy) `/bom/full/{sha}.{ext}` + `/bom/thumb/{sha}.webp`, bản ghi `bom_asset`. sharp chạy ở APP (đã dùng cho BOM triển khai). Phục vụ qua route có auth (cookie), cache `private, immutable` khi `v` = asset id hiện tại.

## 8. Edge cases

- Ca 19:00–07:00 (qua nửa đêm) → crosses_midnight tự bật; ngày sản xuất = ngày bắt đầu (như P1).
- Giờ thực tế 23:00–01:30 = 150'; 07:00–07:00 → lỗi (không cho ca 24h 1 dòng; muốn 24h dùng 2 ca).
- Giờ thực tế ngoài khung ca (ca 08–12, chạy 07–19) hợp lệ — xưởng tự chịu.
- Khoá dòng vẫn tính theo giờ kết thúc CA (không theo giờ thực tế) — đơn giản, nhất quán với Chốt ca.
- Dừng > phút thực tế → 422 (policy + CHECK DB).
- Hàng đợi offline cũ (chưa có workStart) vẫn gửi được.
- Ngừng dùng ca: lịch sử giữ; Hôm nay ngày cũ vẫn hiện cột ca đó nếu có dòng.

## 9. Test

- shift-window: workWindowMinutes (thường, qua nửa đêm, bằng → null), entryMinutes, crossesMidnight.
- policy: dừng > phút thực tế → DOWNTIME_OVER_SHIFT.
- kpi: phút thực tế, 2 khoảng nối tiếp/trùng, qua nửa đêm, trộn dòng cũ.
- shared schema: workStart/End cả-2-hoặc-không, bằng nhau lỗi; ca tự suy crossesMidnight.
- RBAC: workshop update/delete setup = true; approve vẫn false.
- route: POST với giờ thực tế → shiftMinutes; PATCH đổi giờ; bulk mang trường; setup workshop sửa ca OK / sửa máy 403 / site settings 403; ảnh: upload sai loại 422, quá cỡ 413, site khác 404.
