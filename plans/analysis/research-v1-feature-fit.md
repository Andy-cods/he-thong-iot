# Research: Đối chiếu feature V1 với best practice 2025

*Ngày nghiên cứu: 2026-04-16 · Persona: Technology Researcher · Scope: `docs/context-part-1.md` + `docs/context-part-2.md`*

Báo cáo này đối chiếu 7 quyết định kiến trúc quan trọng của V1 (BOM snapshot, PWA offline barcode, PostgreSQL RLS, Docker Compose, Brother CNC integration, scope MVP, alternatives ERP) với state 2025. Mỗi section nêu hiện trạng công nghệ, khuyến nghị cho xưởng cơ khí Việt Nam (~12 máy CNC, ~10.000 SKU, chưa có ERP), và link tham chiếu để đội kỹ sư đào sâu.

---

## 1. BOM revision + immutable snapshot per order (2024-2025)

**State 2025:** Pattern "master BOM bất biến + revision có version + snapshot per order" vẫn là chuẩn công nghiệp, không có "pattern thay thế" nào nổi lên. Điều thay đổi là cách các vendor lớn **đóng gói UX quanh pattern này**. Odoo 18/19 đã làm rõ quy trình: mỗi BOM version được lưu bên trong một **Engineering Change Order (ECO)**, ECO có stage/approval workflow, và PLM cho phép "**trace which BoM version was active on specific dates for recalls or customer complaints**" — tức là hệ thống truy vấn BOM theo thời điểm chứ không phải snapshot thủ công ([Odoo 18 Version control](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/plm/manage_changes/version_control.html), [Odoo 19 ECO](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html)). Odoo 18 còn giải quyết **merge conflict giữa ECO song song** trên cùng product — đây là điểm mới đáng chú ý ([Braincuber ECO Approvals guide](https://www.braincuber.com/tutorial/eco-approvals-stages-plm-odoo-18-guide)). MRPeasy nhấn mạnh "**version control embedded within the software that ensures traceability and makes BOM revisions straightforward and transparent**" ([Craftybase Katana vs MRPeasy](https://craftybase.com/compare/katana-vs-mrpeasy)). SAP Digital Manufacturing tiếp tục dùng **order-specific BOM/routing** (đã ghi trong context-part-2); Katana cung cấp real-time BOM module nhưng không đổi pattern.

**Khuyến nghị cho dự án:** Giữ nguyên ba thực thể `bom_template` → `bom_revision` → `order_bom_snapshot` như đã thiết kế trong context-part-2. Bổ sung 2 điều tinh chỉnh: (a) thêm bảng `eco_request` với stage machine (DRAFT → UNDER_REVIEW → APPROVED → APPLIED) thay vì để revision "tự nhảy"; (b) thêm cột `effective_from`/`effective_to` đã có sẵn trong DDL — dùng nó cho truy vấn "BOM nào active tại thời điểm X" (pattern Odoo PLM). Không cần tìm "pattern thay thế snapshot" — nó vẫn là state-of-the-art 2025.

---

## 2. PWA offline barcode scanning (tablet Android rẻ, 2025)

**State 2025:** IndexedDB + Service Worker + Background Sync vẫn là bộ ba chuẩn cho offline-first PWA ([MDN Offline & background](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation), [whatpwacando Background Sync](https://whatpwacando.today/background-sync/)). Điểm **đã thay đổi rõ rệt** là thư viện quét barcode: **zxing-js chính thức ở maintenance mode** — "only bug fixes and minor enhancements will be considered" và "users have reported issues with newer operating systems and devices, such as Android 14 or iPhone 14 Pro Max" ([Scanbot JS scanners review](https://scanbot.io/blog/popular-open-source-javascript-barcode-scanners/), [STRICH vs ZXing](https://strich.io/strich-compared-to-zxing-js-and-quagga/)). Các lựa chọn 2025:

| Lib | License | State | Note |
|---|---|---|---|
| zxing-js | Apache 2.0 | Maintenance-only | Vẫn chạy được nhưng độ chính xác giảm trên barcode mờ/hỏng |
| html5-qrcode | Apache 2.0 | Active | Wrapper zxing-js, tốt cho QR, OK cho 1D |
| Quagga2 | MIT | Active fork | Tốt cho 1D EAN/UPC, không hỗ trợ 2D mạnh |
| STRICH | Commercial (~€999/năm) | Active, WebAssembly | Đọc được "damaged bars and faded print" mà ZXing/Quagga fail ([STRICH comparison](https://strich.io/comparison-with-oss.html)) |
| BarcodeDetector API | Native browser | Chrome/Edge Android | Nhanh nhất nhưng chưa universal trên iOS |

**Khuyến nghị cho dự án:** V1 start với **html5-qrcode** (free, đủ cho môi trường xưởng sạch, tem mới in). Thiết kế lớp abstraction `BarcodeScanner` để có thể hot-swap sang STRICH hoặc BarcodeDetector API sau này mà không rewrite UI. Offline queue với IndexedDB + Background Sync (đã có trong context-part-2) — đây **vẫn là best practice 2025**, Microsoft Edge và MDN docs đều confirm. Quan trọng: mỗi scan event phải có `offline_queue_id` UUID (đã có trong DDL `assembly.assembly_scan_log`) để API idempotent — duplicate scan khi sync không tạo double-issue. Nếu sau 6 tháng V1 có phàn nàn về đọc mã mờ ở xưởng, upgrade sang STRICH (~25tr/năm) đáng giá hơn nhiều so với viết native app.

---

## 3. PostgreSQL RLS cho ERP self-hosted (2025)

**State 2025:** RLS **vẫn được recommend** nhưng community nhấn mạnh **rõ ràng hơn về pitfalls performance**. Scott Pierce blog và Postgres FM podcast (2024-2025) ghi nhận RLS có thể gây **100x slowdown** trên query scan nhiều row nếu policy dùng function trả row data ([Optimizing Postgres RLS - Scott Pierce](https://scottpierce.dev/posts/optimizing-postgres-rls/), [Postgres.fm RLS episode](https://postgres.fm/episodes/rls-vs-performance)). Supabase — vendor lớn nhất dùng RLS production — đã publish hẳn bộ best practice ([Supabase RLS Performance discussion](https://github.com/orgs/supabase/discussions/14576)): (1) **index mọi cột xuất hiện trong USING clause** của policy; (2) dùng **STABLE function** với kết quả cacheable, không bao giờ truyền row data vào function; (3) dùng `SECURITY DEFINER` function cho subquery để tránh chained RLS; (4) vẫn thêm explicit `WHERE` ở app layer — policy là "implicit where" nhưng planner tối ưu hơn khi có explicit filter. Không có alternative thực sự vượt trội: `pg_graphql` + row-level policy **vẫn dùng RLS phía dưới**; Bytebase note RLS có limitation nhưng không đề xuất thay thế ([Bytebase RLS limitations](https://www.bytebase.com/blog/postgres-row-level-security-limitations-and-alternatives/)).

**Khuyến nghị cho dự án:** Giữ RLS như đã thiết kế trong context-part-2 (warehouse scope, cost scope, order scope) **nhưng tuân thủ 3 quy tắc**: (a) bắt buộc index trên `warehouse_id`, `customer_order_id` trong các bảng có RLS (đã có trong DDL — xác minh lại); (b) không dùng `current_setting(...)` trong JOIN subquery rộng — đưa giá trị vào biến session một lần rồi compare trực tiếp; (c) benchmark p95 đọc `stock_transaction` và `order_bom_snapshot` với RLS bật vs tắt, chấp nhận overhead ≤15% như ngưỡng alarm. Với quy mô ~10k SKU và ~20-30 user, overhead tuyệt đối nhỏ hơn Supabase multi-tenant rất nhiều — RLS hoàn toàn khả thi. Đây là lớp defense-in-depth quan trọng vì app layer có thể bị bypass (bug, SQL injection, debug endpoint), DB thì không.

---

## 4. Docker Compose vs Docker Swarm vs Podman Compose (2025)

**State 2025:** Community lean rõ rệt về **Docker Compose** cho single-VPS self-host. Swarm "**maintained but not seeing major new features**" — Mirantis vẫn hỗ trợ nhưng không invest thêm; Kubernetes đã "ăn" toàn bộ use-case multi-node ([Xurrent Podman vs Docker 2026](https://www.xurrent.com/blog/podman-vs-docker-complete-2025-comparison-guide-for-devops-teams)). **Podman Compose** tăng trưởng mạnh trong security-focused self-host community vì rootless + daemonless, nhưng **"podman-compose isn't feature-complete compared to Docker Compose v2"** và **Podman không support Swarm** ([DataCamp Podman Compose](https://www.datacamp.com/tutorial/podman-compose), [Last9 Podman vs Docker](https://last9.io/blog/podman-vs-docker/)). selfhosting.sh kết luận thẳng: "**Docker is still the better choice for most self-hosters; the ecosystem compatibility with tools like Portainer makes it the path of least resistance**" ([selfhosting.sh comparison](https://selfhosting.sh/compare/podman-vs-docker/)). Với manufacturing app self-host 1 VPS, không có lý do gì chọn Swarm.

**Khuyến nghị cho dự án:** **Giữ Docker Compose** như đã thiết kế. Bỏ qua Swarm hoàn toàn. Không chuyển sang Podman Compose trong V1 vì: (a) ecosystem monitoring (Prometheus exporter postgres, Loki driver) quen Docker hơn; (b) Caddy + Docker networking ổn định hơn với bridge driver của Docker; (c) team chưa có kinh nghiệm troubleshoot rootless user namespace — sẽ mất thời gian khi lỗi lạ. Khi nào chuyển: nếu sau 12 tháng có compliance requirement về rootless hoặc xưởng mở thêm site thứ 2, re-evaluate sang Podman hoặc lên thẳng k3s (Kubernetes nhẹ). V1 **commit Docker Compose + user-defined bridge networks + Compose secrets** đúng như context-part-2.

---

## 5. Brother CNC integration (SPEEDIO S500X1 / CNC-C00)

**State 2025:** **Có một open-source adapter quan trọng đã tồn tại**: **`Lathejockey81/BrotherAdapter`** trên GitHub ([BrotherAdapter repo](https://github.com/Lathejockey81/BrotherAdapter)) — "MTConnect Adapter for Brother CNC Machines" với folder **`C00 Controller`** riêng cho dòng SPEEDIO dùng CNC-C00. Adapter này translate data từ máy Brother sang pipe-delimited protocol tương thích MTConnect reference agent. MTConnect 2.x vẫn là standard de-facto cho shop floor connectivity ([MTConnect getting started](https://www.mtconnect.org/getting-started)); MTConnect Institute publish toàn bộ agent/adapter tools trên GitHub. Brother CNC-C00 (đời cũ hơn D00) không có OPC UA native — confirm trong tài liệu Brother và cả repo này; con đường tiếp cận là **Ethernet + computer-remote protocol + adapter custom**. Pattern triển khai: **edge gateway** (mini-PC, Node-RED hoặc process riêng) chạy BrotherAdapter → MTConnect agent → forward qua HTTPS/MQTT về VPS ([Modern Machine Shop agents/adapters](https://www.mmsonline.com/articles/understanding-mtconnect-agents-and-adapters)).

**Khuyến nghị cho dự án:** **Không đưa CNC integration vào V1** — đúng như context đã quyết. Phase 2 PoC: clone `Lathejockey81/BrotherAdapter`, dựng trên 1 mini-PC Intel NUC trong LAN xưởng, nối 1 máy S500X1 qua Ethernet, verify đọc được `execution`, `program`, `part_count`, `alarm`. Đóng kết quả vào MTConnect agent standard, rồi một worker nội bộ poll agent REST endpoint (`/current`, `/sample`) để đưa event vào bảng `integration_event`. Không tự viết adapter từ đầu — đã có người làm C00 rồi, fork + contribute ngược. Budget PoC: ~2 tuần 1 engineer + ~15tr mini-PC.

---

## 6. Realistic MVP scope cho factory 1 xưởng từ Excel lên ERP nội bộ

**State 2025:** Các số liệu benchmark cho discrete manufacturing SMB greenfield:

- **Cost:** $50k–$150k cho SMB deploy cloud mid-market (NetSuite/Sage/Acumatica), $60k–$300k cho full ERP US SMB; $200k–$500k cho 200-person manufacturer dùng Epicor Kinetic/D365 ([Gglorium 2025 ERP implementation](https://gloriumtech.com/the-2025-guide-to-erp-implementation-for-us/), [ERP Research cost breakdown](https://www.erpresearch.com/en-us/erp-implementation-cost-breakdown)).
- **Timeline:** SMB 3–9 tháng; simple cloud 8–12 tuần; mid-market 4–9 tháng; enterprise tới 18 tháng.
- **Risk:** "**Discrete manufacturing ERP implementations fail at 73% rates with 215% cost overruns**" vì bỏ qua complexity specific của manufacturing ([Godlan ERP failure stats](https://godlan.com/erp-implementation-failure-statistics/)).
- **Pattern failure phổ biến:** big-bang cutover, không pilot 1 product line, underestimate data cleansing từ Excel, RBAC bỏ lửng, thiếu UAT nghiêm túc.

Williams Racing F1 case study nổi tiếng: quản 20.000 parts trên **1 Excel sheet duy nhất**, thiếu cost/inventory/lead time — đây chính xác là tình trạng của nhiều SMB Việt Nam hiện tại ([ECI Williams F1 case study](https://www.ecisolutions.com/en-gb/blog/manufacturing/ridder-iq/why-excel-can-not-keep-up-with-manufacturing-erp/)).

**Khuyến nghị cho dự án:** Roadmap trong context-part-1 (8–10 tuần Phase 1, 4–6 tuần Phase 2, 6–8 tuần Phase 3) **là aggressive nhưng khả thi** cho greenfield không bị ràng buộc legacy ERP — vì bỏ qua migration pain từ hệ cũ. Budget nội bộ ~1 full-stack FTE + 1 tech lead FTE + 0.5 BA FTE trong 3 tháng ≈ 200-300 triệu VNĐ direct cost, rẻ hơn 5-10 lần so với mua Epicor/Dynamics. **Rủi ro cần quản lý:** (a) bắt buộc pilot 1 product family trước go-live toàn bộ; (b) data cleansing Excel (de-dup mã vật tư, UoM chuẩn hóa) phải bắt đầu **trước** Phase 1; (c) phải có UAT checklist chính thức; (d) backup/restore drill hàng tuần **từ tuần 1**, không đợi production. Tỉ lệ fail 73% giảm đáng kể khi scope nhỏ lại (BOM+inventory+assembly thay vì full ERP).

---

## 7. Alternatives nên cân nhắc: ERPNext / Odoo Community / Tryton

**State 2025:**

| System | Manufacturing fit | Weakness | Khi nào nên chọn |
|---|---|---|---|
| **Odoo Community** | MRP+Inventory+Barcode production-ready, 40+ app chính thức | Module PLM chỉ có ở Enterprise ($31.10/user/month); customization sâu cần chuyên gia Python ([Appvizer comparison](https://www.appvizer.com/magazine/operations/erp/erpnext-vs-odoo)) | Nếu business process khớp 80% Odoo mặc định |
| **ERPNext / Frappe** | BOM + work order + quality inspection, tailored cho SMB, cost-effective | "**Lacks industrial-grade tooling for high-volume production**"; scale khó ([Dexciss comparison](https://www.dexciss.io/blog/educational-6/erpnext-vs-odoo-vs-sap-business-one-a-quick-erp-comparison-for-manufacturers-100)) | Shop nhỏ, batch-producer, có tech team sẵn |
| **Tryton** | Modular Python, clean architecture, ít vendor lock-in | "**Focuses on functionalities**" — UX rất kỹ thuật; cộng đồng VN gần như không có ([MDCplus top open-source ERP](https://mdcplus.fi/blog/top-free-erp-open-source-manufacturing/)) | Nếu team developer muốn control tuyệt đối |

**Build vs Buy breakpoint:** ERP failure stats (73% discrete mfg fail) + complexity xưởng cơ khí Việt Nam + yêu cầu Tiếng Việt 100% + BOM snapshot immutable per order (Odoo Community không hỗ trợ mượt, cần Enterprise PLM) tạo ra **lý do chính đáng để build**. Nhưng breakpoint để **buy thay build**: nếu (a) xưởng có >3 site/legal entity, (b) cần accounting/e-invoice VN compliance sâu, (c) team dev <1 FTE ổn định. Trong 3 điều kiện đó, **Odoo Community + custom module** rẻ hơn build from scratch trong 12 tháng đầu.

**Khuyến nghị cho dự án:** **Stay the course — build modular monolith PostgreSQL + Docker Compose** như context-part-2 đã quyết. Lý do: (1) scope V1 đã được refine sâu cho đúng pain point xưởng cơ khí 1 site — Odoo Community generic sẽ cần 30-40% custom; (2) team đã invest vào data model BOM-centric với snapshot immutable chi tiết hơn Odoo CE; (3) Odoo PLM (Enterprise) đắt (~$31/user/month × 20 user = $7.4k/năm permanent); (4) yêu cầu RBAC + RLS theo warehouse/cost scope chi tiết hơn Odoo CE hỗ trợ. **Nhưng:** đọc kỹ Odoo 18 PLM docs ([ECO](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html)) để copy UX pattern — không cần phát minh lại. Nếu sau 12 tháng V1 triển khai chậm hơn 2x kế hoạch → re-evaluate switch sang ERPNext hybrid (ERPNext core + custom manufacturing module).

---

## Kết luận tổng: Feature fit trong V1

### Đã phù hợp 2025 — giữ nguyên

- **BOM template → revision → snapshot per order** (Section 1): đúng pattern chuẩn industry.
- **PostgreSQL + recursive CTE + jsonb + partitioning** (Section 3): không có alternative đủ tốt cho scope này.
- **Docker Compose + user-defined bridge + secrets** (Section 4): community lean rõ về Compose cho single-VPS.
- **Modular monolith + Node/NestJS-style** (ngầm trong context): pattern đang được promote lại mạnh sau đợt microservices fatigue ([Modular Monolith 2025](https://dev.to/hamzakhan/the-difference-between-monoliths-and-modular-monoliths-what-you-need-to-know-in-2025-20dm)).
- **IndexedDB + Background Sync + service worker** (Section 2): vẫn best practice 2025.
- **RBAC + data scope + RLS 3 lớp** (Section 3): đúng defense-in-depth.
- **CNC integration để phase 2** (Section 5): khôn ngoan — đã có BrotherAdapter open-source sẵn.

### Cần điều chỉnh

- **Barcode library:** Không commit cứng `zxing-js`. V1 start với **html5-qrcode** (Apache 2.0, wrapper zxing-js vẫn chạy được nhưng có upgrade path). Thiết kế abstraction `BarcodeScanner` interface để swap sang **STRICH** (commercial) hoặc **BarcodeDetector API** khi cần.
- **ECO workflow:** Thêm bảng `eco_request` với stage machine rõ ràng thay vì để revision tự nhảy. Copy UX pattern từ Odoo 18 PLM (DRAFT → UNDER_REVIEW → APPROVED → APPLIED → DONE).
- **RLS policy:** Bắt buộc index mọi cột trong USING clause; không truyền row data vào function; benchmark p95 overhead <15% trước go-live. Dùng `SECURITY DEFINER` cho chained policy.
- **Data cleansing Excel:** Kéo lên **Phase 0** — làm trước khi Phase 1 start, không làm đồng thời. Đây là failure vector số 1 của discrete mfg ERP projects.

### Cân nhắc bỏ hoặc defer

- **Tryton** trong menu alternatives: bỏ khỏi shortlist — cộng đồng VN 0, rủi ro maintenance cao.
- **Docker Swarm** dù có được mention trong vài tài liệu: bỏ — không có value cho 1 VPS, community đã lean khỏi Swarm.
- **OPC UA native CNC-C00** (nếu có ai đề xuất cho Phase 2): bỏ — C00 không hỗ trợ, đừng mặc định; đi qua BrotherAdapter + MTConnect.
- **Full-text search + analytics ML** (ETA forecasting, OEE ML): defer đến Phase 3 — đừng nhét vào V1 scope.
- **Multi-tenant schema** (nếu có ai đề xuất "chuẩn bị sẵn cho SaaS"): bỏ — YAGNI, xưởng 1 site không cần, thêm complexity cho RLS không ích gì.

### Rủi ro lớn nhất cần watch

Không phải công nghệ — mà là **scope creep + skipping data cleansing**. 73% discrete mfg ERP fail vì underestimate những điều này. Khuyến nghị: lock scope V1 sau sprint 0, mọi request mới vào backlog V2, và dành riêng 2 tuần Phase 0 cho Excel cleansing trước khi code dòng đầu tiên.

---

## Sources

- [Odoo 18 Version control PLM](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/plm/manage_changes/version_control.html)
- [Odoo 18 Engineering Change Orders](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html)
- [Odoo 19 ECO documentation](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html)
- [Braincuber ECO Approvals & Stages in Odoo 18](https://www.braincuber.com/tutorial/eco-approvals-stages-plm-odoo-18-guide)
- [Craftybase Katana vs MRPeasy 2025](https://craftybase.com/compare/katana-vs-mrpeasy)
- [MDN Offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)
- [whatpwacando Background Sync](https://whatpwacando.today/background-sync/)
- [Scanbot - Popular JS Barcode Scanners](https://scanbot.io/blog/popular-open-source-javascript-barcode-scanners/)
- [STRICH vs ZXing and Quagga comparison](https://strich.io/strich-compared-to-zxing-js-and-quagga/)
- [STRICH comparison with OSS](https://strich.io/comparison-with-oss.html)
- [Optimizing Postgres RLS - Scott Pierce](https://scottpierce.dev/posts/optimizing-postgres-rls/)
- [Postgres.fm RLS vs performance](https://postgres.fm/episodes/rls-vs-performance)
- [Supabase RLS Performance discussion](https://github.com/orgs/supabase/discussions/14576)
- [Bytebase Postgres RLS limitations](https://www.bytebase.com/blog/postgres-row-level-security-limitations-and-alternatives/)
- [Xurrent Podman vs Docker 2026](https://www.xurrent.com/blog/podman-vs-docker-complete-2025-comparison-guide-for-devops-teams)
- [selfhosting.sh Podman vs Docker](https://selfhosting.sh/compare/podman-vs-docker/)
- [Last9 Podman vs Docker 2026](https://last9.io/blog/podman-vs-docker/)
- [DataCamp Podman Compose tutorial](https://www.datacamp.com/tutorial/podman-compose)
- [BrotherAdapter GitHub repo](https://github.com/Lathejockey81/BrotherAdapter)
- [MTConnect getting started](https://www.mtconnect.org/getting-started)
- [Modern Machine Shop - MTConnect Agents and Adapters](https://www.mmsonline.com/articles/understanding-mtconnect-agents-and-adapters)
- [Gglorium 2025 Guide to ERP Implementation](https://gloriumtech.com/the-2025-guide-to-erp-implementation-for-us/)
- [ERP Research Implementation Cost Breakdown 2026](https://www.erpresearch.com/en-us/erp-implementation-cost-breakdown)
- [Godlan ERP Implementation Failure Statistics 2025](https://godlan.com/erp-implementation-failure-statistics/)
- [ECI - Williams F1 Excel to ERP case study](https://www.ecisolutions.com/en-gb/blog/manufacturing/ridder-iq/why-excel-can-not-keep-up-with-manufacturing-erp/)
- [Appvizer Odoo vs ERPNext 2025](https://www.appvizer.com/magazine/operations/erp/erpnext-vs-odoo)
- [Dexciss ERPNext vs Odoo vs SAP B1 for manufacturers](https://www.dexciss.io/blog/educational-6/erpnext-vs-odoo-vs-sap-business-one-a-quick-erp-comparison-for-manufacturers-100)
- [MDCplus Free open-source ERP for manufacturing 2026](https://mdcplus.fi/blog/top-free-erp-open-source-manufacturing/)
- [Modular Monolith 2025 - dev.to](https://dev.to/hamzakhan/the-difference-between-monoliths-and-modular-monoliths-what-you-need-to-know-in-2025-20dm)
