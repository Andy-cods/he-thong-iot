# Brainstorm: Đánh giá kiến trúc BOM-centric V1

**Persona:** Solution Brainstormer (YAGNI / KISS / DRY, brutal honesty)
**Ngày:** 2026-04-16
**Phạm vi:** Xưởng cơ khí 1 site, ~12 máy, ~10.000 SKU, ~20-50 user, chưa có ERP, VPS dùng chung với Song Châu ERP (4 vCPU / 8GB).

---

## 1. Điểm mạnh (top 5)

1. **BOM Template → Revision → Snapshot là quyết định đúng nhất trong toàn bộ doc.** Đây là bài học duy nhất mà không có Excel-workaround nào thay thế được. Nó ngăn chặn đúng pain point hiện tại: đơn hàng đang chạy bị sửa BOM gốc.
2. **Transaction-first inventory (stock_transaction làm nguồn truth, không phải on-hand).** Bắt buộc cho traceability/audit. Không có nó, lot/serial vô nghĩa.
3. **PostgreSQL + modular monolith thay vì microservices.** Phù hợp 100% với quy mô 1 xưởng. Recursive CTE cho BOM explode là lựa chọn khôn ngoan (không cần graph DB, không cần Neo4j).
4. **Manual-first cho tiến độ gia công, CNC gateway đẩy sang V2.** Tránh vết xe đổ của các dự án IIoT "chưa làm xong ERP đã lao vào OPC UA".
5. **PWA offline queue cho scan barcode** thay vì native app. Tiết kiệm 2-3 tháng dev, tablet Android rẻ chạy được ngay.

## 2. Điểm yếu / Rủi ro (top 7)

1. **Over-engineered RLS + 11 schema + 11 role cho V1.** Với 20-50 user, 1 xưởng, chia 11 schema PostgreSQL và 3 lớp authorization (app + data-scope + RLS `current_setting`) là **quá đắt**. RLS gây debug địa ngục, session context dễ sai, performance hit trên mọi query. Khuyến nghị: V1 chỉ cần RBAC ở app layer + deny-by-default + audit log. RLS chỉ cho 2 bảng thực sự nhạy cảm (`costing.*`). Rest: defer.
2. **Scope V1 quá tham vọng — 14 module cho 10 tuần là ảo tưởng.** Doc liệt kê: Identity, Master, Engineering, Order, Planning/MRP, Procurement, Warehouse, QC, Manufacturing, Assembly, Shipping, Costing, Dashboard, Audit. Với 2 full-stack + 1 BA, **không thể** làm xong trong 10 tuần. Một trong hai: cắt scope, hoặc kéo dài 20-24 tuần.
3. **Costing (Moving Average + Standard Cost + variance) trong V1 là bẫy.** Cần accounting buy-in, test case kế toán, reconciliation với sổ cũ. Đây là rabbit hole 4-6 tuần riêng.
4. **Thiếu spec cho concurrent reservation / race condition.** Doc nói "no negative stock" nhưng không đặc tả lock strategy (pessimistic row lock? advisory lock? version? Redis distributed lock?). Đây là nguồn bug sản xuất số 1 trong WMS.
5. **Partitioning `stock_transaction` theo RANGE(posted_at) ngay từ V1 là YAGNI rõ rệt.** 10k SKU × 50 txn/ngày ≈ 18k/tháng, 220k/năm. PostgreSQL xử lý 10M rows không cần partition. Thêm partition = thêm operational overhead (maintenance scripts, attach/detach). Defer.
6. **Object storage MinIO tự host trên cùng VPS = điểm lỗi tồi.** 8GB RAM share với Postgres + Redis + Node + Nginx + Song Châu → MinIO sẽ bị OOM. File đính kèm (CAD/PDF) có thể lưu filesystem thường + Nginx serve, hoặc đẩy sang object storage bên ngoài (Cloudflare R2, Backblaze B2, Wasabi) — rẻ hơn và giảm tải VPS.
7. **Monitoring stack Prometheus + Grafana + Loki + Alertmanager cho 1 xưởng = gold-plating.** Mỗi cái ngốn 200-500MB RAM. Trên VPS 8GB dùng chung, sẽ chết. V1: chỉ cần `pg_stat_statements`, uptime check ngoài (UptimeRobot free), và log file rotate. Quan sát thật sự cần khi có sự cố, không phải có sẵn "cho đẹp".

## 3. Giả định cần thẩm định lại (top 5)

1. **"10.000 mã vật tư" — thực tế có bao nhiêu active?** Nếu 80% là legacy/dead code thì nhập cleansing trước quan trọng hơn schema đẹp. Cần user xác nhận số active SKU trong 12 tháng gần nhất.
2. **"BOM nhiều cấp" — sâu bao nhiêu cấp thực sự?** Nếu chỉ 2-3 cấp (thường gặp ở cơ khí SMB), recursive CTE overkill. Nếu 5-7 cấp với phantom/substitute thì phải design kỹ. User cần show 3-5 BOM thật đại diện.
3. **"Giao từng đợt" — bao nhiêu đợt/đơn trung bình?** Phân biệt partial shipment (1 đơn 2-3 đợt) vs running delivery (20-30 đợt). Hai bài toán khác nhau hoàn toàn.
4. **"Operator cập nhật tiến độ thủ công" — ai, ở đâu, bằng gì?** Tablet tại máy? Supervisor tổng hợp cuối ca? Đây quyết định UX hoàn toàn khác. Nếu supervisor gom thủ công → không cần tablet per machine ở V1.
5. **"20-50 user" — peak concurrent bao nhiêu?** 50 người có tài khoản ≠ 50 người dùng cùng lúc. Nếu peak 10-15 concurrent, mọi lo ngại performance đều thừa.

## 4. Ba phương án kiến trúc thay thế

### Phương án A — Giữ nguyên (doc hiện tại)
**Pros:** Đầy đủ, "đúng sách", scale tốt về sau.
**Cons:** 10 tuần không đủ với 2 dev; RLS + 11 schema debug khó; overhead vận hành cao cho team không có DevOps chuyên.
**Phù hợp khi:** Team có 4+ engineers, 6 tháng thời gian, có senior Postgres.

### Phương án B — Lean Monolith (khuyến nghị) ⭐
- 1 schema `app` duy nhất (prefix bảng: `item_`, `bom_`, `wo_`, `inv_txn`…).
- RBAC ở app layer bằng middleware + policy function JS/TS. RLS chỉ cho `cost_*` và `audit_*`.
- Bỏ MinIO, dùng filesystem volume + Nginx static serve hoặc Cloudflare R2.
- Bỏ Prometheus/Grafana/Loki → dùng `pino` JSON logs + `pg_stat_statements` + UptimeRobot.
- Bỏ partitioning V1, thêm khi bảng > 5M rows.
- Bỏ MRP-lite, Costing, Shipping khỏi V1.

**Pros:** Làm được trong 10 tuần với 2 dev; ít moving parts; dễ onboard người mới; share VPS không gây áp lực.
**Cons:** Phải refactor khi scale nhiều site (nhưng YAGNI — chỉ có 1 xưởng).

### Phương án C — SaaS/Off-the-shelf trước, custom sau
Triển khai **Odoo Community** (MRP + Inventory + PLM + Barcode) trên cùng VPS (hoặc VPS riêng ~150k/tháng), dùng 3-6 tháng làm production, parallel build custom UI cho các luồng đặc thù (BOM snapshot rigor, TV dashboard xưởng).
**Pros:** Go-live trong 3-4 tuần; rủi ro thấp nhất; học được requirement thật.
**Cons:** Odoo có learning curve riêng; khó custom sâu; license Enterprise đắt nếu cần PLM rollback.

### Khuyến nghị cuối: **Phương án B**.
Lý do: Bối cảnh rõ ràng là xưởng đã quyết làm nội bộ, có dev team, đã đầu tư discovery. Odoo sẽ bị kháng cự văn hóa. Phương án A sai về resource reality. B cân bằng nhất.

## 5. Scope V1 tối thiểu (2 dev + 1 BA × 10 tuần)

### Top 10 MUST-HAVE V1

1. **Auth + RBAC cơ bản** (4 role: admin, planner, warehouse, operator). Bỏ MFA V1, thêm V1.1.
2. **Item master** (import từ Excel, edit, barcode gen).
3. **BOM Template + Revision** (editor đơn giản, lock revision khi release).
4. **Sales Order + BOM Snapshot** (core value, không thể cắt).
5. **Shortage calculation** (explode BOM × qty đơn − on-hand = thiếu gì).
6. **Purchase Order + Receipt** (no QC workflow sâu — chỉ pass/fail flag).
7. **Inventory transaction + lot/serial** (receive, issue, transfer, reserve).
8. **Work Order + manual progress** (status + % completed, không có routing operations chi tiết).
9. **Pick + Assembly scan (PWA)** (luồng giá trị cao nhất cho xưởng).
10. **Audit log + Dashboard tiến độ đơn** (1 bảng xem readiness toàn bộ đơn hàng).

### Top 5 DEFER sang V1.5/V2

1. **MRP-lite + ETA learning + supplier scorecard** — cần 2 quý dữ liệu thật mới có ý nghĩa.
2. **Costing (Moving Average + Standard + variance)** — cần accounting SME, 4-6 tuần riêng.
3. **QC workflows đầy đủ** (quality plan, nonconformance, CAPA) — V1 chỉ cần flag pass/fail trên receipt.
4. **CNC Gateway / machine telemetry** — đúng như doc đã nói, sang V2.
5. **ECO / substitute parts / phantom BOM** — tính năng advanced, chưa đủ bằng chứng xưởng cần ngay.

## 6. Cảnh báo tích hợp VPS Song Châu

**Rủi ro:**

- **RAM 8GB là constraint cứng.** Song Châu hiện chạy Nginx + Postgres + Redis + Node API + Next.js ≈ ước tính 3-4GB ổn định. Thêm he-thong-iot (Postgres mới, Node API mới, Next.js/PWA mới, worker) → dễ chạm 7-7.5GB → OOM killer sẽ xử Postgres của he-thong-iot (process trẻ hơn, RSS lớn hơn). **Đây là rủi ro lớn nhất.**
- **Postgres shared_buffers conflict.** Nếu 2 instance Postgres mỗi cái ăn 25% RAM mặc định → tổng 50%. Phải tune `shared_buffers` thủ công hoặc dùng chung 1 instance + 2 database.
- **Port conflict & Nginx routing.** Song Châu đã chiếm 80/443. he-thong-iot phải chia subdomain hoặc path prefix → cần sửa Nginx config của Song Châu (chạm vào nguyên tắc "không động Song Châu" trong CLAUDE.md).
- **Backup window đụng nhau.** Nếu 2 hệ cùng pg_dump lúc 2AM → I/O bão hòa.
- **Log và disk share.** 60GB disk nhanh cạn với 2 hệ.

**Đề xuất cô lập:**

1. **Dùng chung 1 Postgres instance** (của Song Châu), tạo database `hethongiot` riêng, role riêng, `pg_hba.conf` tách. Tiết kiệm ~500MB RAM. Đàm phán với team Song Châu về maintenance window.
2. **Nếu buộc tách Postgres:** cấu hình `shared_buffers=512MB`, `work_mem=16MB`, `max_connections=30`, dùng PgBouncer transaction pool.
3. **Nginx:** tạo file riêng `/etc/nginx/conf.d/hethongiot.conf` với `server_name iot.domain` (subdomain) — **không sửa file của Song Châu**, chỉ add file mới. Reload `nginx -s reload` test kỹ.
4. **Resource limits bắt buộc:** tất cả container `he-thong-iot` chạy với `mem_limit` Docker rõ ràng (API 512MB, worker 256MB, Next.js 512MB) → không bao giờ ăn quá allocation.
5. **Object storage: ĐỪNG chạy MinIO trên VPS này.** Dùng Cloudflare R2 (10GB free, $0.015/GB sau đó) — tiết kiệm RAM + disk.
6. **Backup:** pg_dump lúc 3AM (Song Châu 2AM), output ra disk riêng hoặc rsync ngay ra off-site.
7. **Monitoring tối thiểu:** 1 script bash cron check RAM/disk mỗi 5 phút, alert Telegram. Không cần Prometheus.
8. **Nếu budget cho phép:** VPS riêng 2 vCPU / 4GB (~120k/tháng) giải quyết 90% lo ngại trên. Đây là option đáng cân nhắc nghiêm túc.

---

**Kết luận thẳng:** Doc context hiện tại là thiết kế tốt về mặt học thuật nhưng **over-specced cho thực tế 2 dev × 10 tuần × VPS share**. Chọn Phương án B, cắt scope còn 10 feature, defer RLS/MinIO/Prometheus/partitioning sang khi có dữ liệu thật chứng minh cần. Rủi ro lớn nhất không phải code — là RAM 8GB share với Song Châu. Giải quyết infra trước, code sau.
