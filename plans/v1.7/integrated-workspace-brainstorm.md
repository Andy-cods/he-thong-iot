# Integrated BOM Workspace Brainstorm — V1.7-beta

**Ngày:** 2026-04-21
**Tác giả:** solution-brainstormer (auto-mode decide on behalf of user)
**Nguồn feedback:** Anh Hoạt, sau LIVE V1.7-alpha grid-default.
**Rule:** User đã yêu cầu "tự chọn cái mượt mà nhất" → file này CHỐT quyết định thay vì hỏi lại.
**Scope:** Chỉ brainstorm + quyết định + roadmap. Implementation sẽ giao `planner` sau khi user duyệt.

---

## 1. Quyết định Q1-Q5 (từ `kind-routing-brainstorm.md`)

Anh Hoạt đã nói "bạn hãy tự chọn cái mượt mà nhất". Đây là 5 chốt kèm lý do ngắn, tối ưu UX fluid + minimize cognitive load.

### Q1 — Override kind vs item master: silent hay prompt xác nhận?

**Chọn:** Silent override + badge hiển thị status.
**Lý do:** Power user xưởng muốn đổi 20 dòng liền mạch không bị popup chặn; badge nhỏ "⚠ override" ở cell là đủ tín hiệu trực quan, không ngắt rhythm grid-first.
**Tag:** V1.7-beta.

### Q2 — Khi item master đổi `itemType` về sau, bom_line.metadata.kind override có auto-sync không?

**Chọn:** Giữ nguyên override cho đến khi user clear thủ công (via button "Dùng theo master" trong Side Sheet).
**Lý do:** Override là user intent rõ ràng; auto-sync sẽ phá dữ liệu người dùng đã cố tình đặt lệch. Predictability > consistency.
**Tag:** V1.7-beta.

### Q3 — Route công đoạn: tính cost/lead-time tự động hay chỉ ghi nhận?

**Chọn:** V1.7-beta.1 chỉ **ghi nhận** (route steps + hours field), V1.7 GA tính **tự động** (process_rate × hours + material × weight).
**Lý do:** Cost calc cần seed master `manufacturing_process` + `material` từ Excel, đây là prerequisite riêng; split 2 phase để ship nhanh giá trị nghiệp vụ trước.
**Tag:** V1.7-beta.1 (ghi nhận) + V1.7 GA (auto calc).

### Q4 — Thương mại: link PR/PO hiện có vs snapshot giá?

**Chọn:** Snapshot tại thời điểm điền + hiển thị link chỉ-đọc tới PR/PO active nếu có (lazy resolve qua `/api/procurement?itemId=`).
**Lý do:** Snapshot đảm bảo BOM không bị đảo khi PR bị cancel; link chỉ-đọc giúp user biết item này đang được mua sắm mà không coupling schema.
**Tag:** V1.7-beta.1.

### Q5 — Đổi fab→com giữa chừng (đã điền route): xóa, ẩn, hay prompt?

**Chọn:** **Prompt xác nhận** với option "Giữ lại route để khôi phục sau".
**Lý do:** Route step có thể là 30-60 phút công của planner; data loss không thể undo qua Ctrl+Z vì lưu server. 1 prompt đổi vai trò là chấp nhận được.
**Tag:** V1.7-beta.1.

---

## 2. Unified Workspace Architecture — Gộp sub-routes vào Grid page

### 2.1. Đánh giá 4 pattern

| Pattern | UX fluid khi edit Grid + xem Orders/WO | Effort | Mobile fallback | Rank |
|---|---|---|---|---|
| A — Tab bar trên đầu Grid | 6/10 (đổi tab = đổi view, không đồng thời) | 1d | ✅ dễ (tabs scroll ngang) | #3 |
| B — Split Grid + Bottom Panel | 9/10 (Grid luôn visible, panel dưới) | 2d | ⚠ phải chuyển dạng stack dọc | #1 |
| C — Right Drawer on-demand | 7/10 (Grid tối đa, panel ẩn mặc định) | 1.5d | ✅ drawer fullscreen | #4 |
| D — Hybrid B + chip trong header | 9.5/10 | 2.5d | ⚠ giống B | #2 |

### 2.2. CHỐT — Pattern B (Bottom Panel) làm nền, mượn chip count từ D

**Lý do chọn Pattern B:**
1. Khớp chính xác ý user: "Grid là trung tâm tuyệt đối". Grid luôn chiếm ~65-70% viewport height, không bao giờ biến mất.
2. Pattern đã được validate ở dev tools (VS Code terminal panel, Chrome DevTools Network, pgAdmin Query tool, DataGrip). User cơ khí quen Excel + Windows sẽ đọc được pattern này nhanh.
3. Khi user điền kind dropdown ở Grid mà đang tracking "còn bao nhiêu item thiếu hàng", panel dưới show trực tiếp — không cần context-switch tab.
4. Drag resize handle cho phép user zoom vào panel khi cần đọc chi tiết (70/30 → 40/60).

**Layout cuối cùng:**

```
┌─ BomWorkspaceTopbar (h-12) — code · name · status · KPI chips · menu ─┐
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  GRID (flex-1, min-h 65%)                                           │
│                                                                     │
├─ BottomPanelTabs (h-9) — Đơn hàng·5 | WO·3 | Mua sắm·8 | Thiếu·2 | ECO | Lắp ráp | Sử ─┤
│  BottomPanelContent (h 35%, resize drag)                            │
└─────────────────────────────────────────────────────────────────────┘
```

Panel mặc định **collapsed** (chỉ tab bar h-9 visible, content h-0). Click tab = expand panel h-72. Double-click drag handle = toggle collapse. Persist state vào `localStorage('bom-workspace-panel-height')` per-user.

**Không chọn A:** Mỗi tab = "page" riêng, user mất rhythm khi đổi giữa Grid ↔ Orders liên tục.
**Không chọn C:** User phải click mới thấy panel → quên luôn module đang có bao nhiêu item. Chip count ở header giúp giảm lỗi này nhưng vẫn không trực quan bằng bottom tabs luôn hiện.
**Không chọn D làm default:** Phức tạp dư thừa (vừa có chip, vừa có tab) — vi phạm KISS. Giữ ý chip nhỏ cho KPI strip ở Topbar (đếm thôi, không click), còn mở panel vẫn dùng bottom tabs.

---

## 3. Xử lý global sidebar — Unify

### 3.1. CHỐT — Option 3: Bỏ ContextualSidebar 220px, global sidebar 220px giữ nguyên, thêm `BomWorkspaceTopbar` mỏng

**Lý do:**
- ContextualSidebar 220px hiện tại đang chứa 9 nav item sub-route — sau khi gộp vào Grid page thì sidebar này không còn lý do tồn tại.
- Giữ global sidebar 220px (Trang chủ / BOM / Đơn hàng / Work Orders / Mua sắm / Items / Reports / Settings) đầy đủ label thay vì icon-only 56px cho UX nhất quán toàn app.
- `BomWorkspaceTopbar` mỏng h-12 giữ workspace context: BOM code mono + name + StatusBadge + KPI chips + menu ⋯ (Xuất BOM / Duplicate / Tạo revision / Thoát workspace).
- Breadcrumb dạng mini bên trái topbar: `← BOM` → `Z-502653 VPS…` (clickable back).

**So sánh loại:**
- Option 1 (giữ dual sidebar V1.6): mất lý do tồn tại khi gộp sub-routes vào grid, phí 220px.
- Option 2 (bỏ ContextualSidebar, không topbar): mất context "tôi đang ở BOM nào" → user lạc.
- Option 4 (sidebar + tab topbar): nếu chọn Pattern B (bottom panel) thì top tabs thừa, gây nhiễu.

**Mobile fallback cho Topbar:** Collapse thành h-14, KPI chips xếp dòng 2 khi `<md`, menu ⋯ giữ.

---

## 4. Redesign UI/UX toàn diện cho V1.7-beta

### 4.1. BomWorkspaceTopbar (h-12)

```
┌ ← BOM │ [folder-icon] Z-502653 VPS Rack 42U · (v) REVISION 1 [DRAFT badge] │ Đơn·5 WO·3 Thiếu·2 │ [⋯] ┐
```

**CHỐT:** Bổ sung KPI strip inline (Đơn·5 / WO·3 / Thiếu·2 / BOM rev R01). Không phải block riêng, chỉ 1 dòng text secondary ở giữa topbar, click chip = scroll + activate bottom panel tương ứng.

### 4.2. Grid visual polish

Ngoài column width (đã có section 1.2 `kind-routing-brainstorm.md`):

- **Row hover:** zinc-50 (hiện chưa có, thêm qua `IRange` hover event hoặc fallback cell format ước lượng).
- **Selected cell:** outline indigo-500 ring 2px (đã sẵn Univer, chỉ tune màu qua theme override).
- **Group row collapsible:** thêm icon ▸/▾ ở col 0 row group, click toggle children rows visibility. Univer hỗ trợ row hidden API.
- **Frozen header divider:** border-b 2px zinc-900 (hiện 1px zinc-200 quá nhạt khi scroll).
- **Alternating row bands:** bỏ (zebra striping rối khi có group rows).
- **Group row click entire row = collapse** (không chỉ icon) — khớp Finder/Notion pattern.

### 4.3. Bottom panel

```
┌─ [●] Đơn hàng 5 │ WO 3 │ Mua sắm 8 │ Thiếu 2 │ ECO │ Lắp ráp │ Sử │ ⌃ ┐
│  CompactListTable reuse — columns 5-8 gọn, h-9 rows, virtualize > 30 │
└─────────────────────────────────────────────────────────────────────┘
```

**CHỐT:**
- Tab header h-9, tab active = border-top 2px indigo-500 + text zinc-900 + bg white. Tab inactive = text zinc-500 + bg zinc-50.
- Chevron `⌃`/`⌄` top-right tab bar = collapse/expand toàn panel. Double-click tab = collapse.
- Drag handle 4px ngay trên tab bar, cursor `ns-resize`, hover indigo-200.
- Content reuse `CompactListTable` (từ duplication-report.md cluster 1 — extract trước ở V1.7-beta).
- Empty state trong panel: compact, icon 24px + 1 dòng "Chưa có đơn hàng cho BOM này" + button inline "Tạo đơn".

### 4.4. Side Sheet quy trình (kind dropdown → "Chi tiết...")

**CHỐT:**
- Width 480px, backdrop zinc-900/40 (đã có Radix Dialog).
- Header h-14: title "Quy trình cho Z-502653 / C1609-24-P-00154" (mono + name) + close X.
- Tabs shadcn 2 ô: `Thương mại` / `Gia công`. Active tab border-b indigo-500.
- Form: Label uppercase tracking-wide text-[11px] text-zinc-500, field h-8 (h-9 trên mobile), spacing y-4.
- Footer sticky bottom: `[Huỷ]` ghost zinc + `[Lưu]` indigo primary. Esc = huỷ, Cmd/Ctrl+Enter = lưu.

### 4.5. Typography scale

**CHỐT giữ Inter + JetBrains Mono**, bổ sung:
- Title workspace (topbar BOM code): Inter 14px semibold (hiện là sm + mono).
- KPI chip count: Inter 11px medium, number nổi bật hơn label.
- Cell number trong Grid: JetBrains Mono 12px tabular-nums (đã có), thêm `font-feature-settings: "tnum"` cho pixel-perfect alignment.
- Label form Side Sheet: Inter 11px uppercase tracking 0.05em (10-11px vẫn readable cho Vietnamese dấu).

### 4.6. Motion

**CHỐT conservative motion**:
- Tab switch (bottom panel): `transition-opacity` 120ms (content fade, không slide — slide gây loạn scroll position).
- Panel expand/collapse: `height` transition 180ms `ease-out`.
- Side Sheet drawer: Radix default spring (320ms stiff).
- Resize drag: realtime, không animate (smooth đã do browser handle).
- Avoid: không parallax, không stagger cho rows (gây jank BOM 500 dòng).

---

## 5. Các function phụ gộp vào Grid workspace

Đánh giá 7 module phụ hiện là sub-route:

| Module | Tab hay drawer? | Data | Edit? | Effort beta.1 |
|---|---|---|---|---|
| Đơn hàng (orders) | **Tab** bottom panel | Thực (`/api/orders?bomTemplateId=`) | Read-only + link "Tạo đơn mới" mở dialog | 3h |
| Lệnh SX (WO) | **Tab** bottom panel | Thực (`/api/work-orders?bomTemplateId=`) | Read-only + link xem detail | 3h |
| Mua sắm (PR/PO) | **Tab** bottom panel | Thực V1.6.1 (PR via `pr_line→bom_snapshot_line`) | Read-only | 4h (cần join chain) |
| Thiếu hàng (shortage) | **Tab** bottom panel | Thực (compute server-side từ snapshot) | Read-only, click item = highlight row Grid | 4h |
| ECO | **Tab** bottom panel | Thực (`/api/eco?bomTemplateId=`) | Read-only list + link detail | 2h |
| Lắp ráp (assembly) | **Tab** bottom panel disabled với badge "Sắp có" | Placeholder V1.7 | — | 0h (giữ skeleton) |
| Lịch sử (history) | **Side drawer right** mở qua menu ⋯ Topbar (KHÔNG tab) | Thực (activity log) | Read-only timeline | 3h |

**Lý do history ra drawer riêng:** Log timeline dài, cần vertical scroll nhiều, nội dung metadata chi tiết — không phù hợp bottom panel h-72. Drawer right 480px giống git log hợp hơn.

**Tổng effort beta.1:** ~19h (~2.5 ngày) cho 6 module tab + 1 drawer history.

---

## 6. Roadmap thực thi 3 phase

### Phase 1 — V1.7-beta (3-4 ngày) · Deadline: 2026-04-25

**Goal:** Unified workspace layout + column tuning + kind dropdown. User có thể edit kind ngay trong Grid, thấy được panel dưới cho Orders/WO.

- [ ] Refactor layout: bỏ `ContextualSidebar`, thêm `BomWorkspaceTopbar` h-12 với KPI chips + menu ⋯.
- [ ] Global sidebar 220px full-label (bỏ thu gọn icon-only 56px khi vào workspace).
- [ ] `BomBottomPanel` shell: tab bar h-9 + resize handle + collapse state persist localStorage.
- [ ] 6 tab nội dung dùng placeholder `<CompactListTable empty={…} />` — sẽ fill data ở beta.1.
- [ ] Column widths tuning theo `kind-routing-brainstorm.md` section 1.2 (tổng 1588px).
- [ ] Bật `wrapStrategy: WRAP` cho col 2 + 4 + 10.
- [ ] Dropdown kind: `IDataValidation` list [Gia công, Thương mại] cho col 3.
- [ ] Handler `onCellValueChange` persist `bom_line.metadata.kind` qua `/api/bom/templates/[id]/grid`.
- [ ] Badge "⚠ override" inline cell khi `metadata.kind` ≠ mapItemType.
- [ ] Smoke test v1.7-beta-smoke.sh update: kiểm tra topbar + bottom panel collapse + kind persist reload.
- [ ] Mobile fallback: bottom panel stack dọc 100% khi `<md`, topbar KPI chips wrap.

**Deliverable:** Unified single-page workspace, kind dropdown persist, UI polish.

### Phase 2 — V1.7-beta.1 (3-4 ngày) · Deadline: 2026-04-29

**Goal:** Side Sheet quy trình + 6 bottom panel tab có data thực.

- [ ] Component `<KindDetailSheet />` — 2 tabs Thương mại/Gia công, width 480px, footer sticky.
- [ ] Tab Thương mại: supplier FK select + leadTime + MOQ + unitPrice + currency + note. Persist `metadata.sourcing`.
- [ ] Tab Gia công: raw material (code + blankSize + blankWeight) + dynamic route steps (add/remove/drag-reorder). Persist `metadata.routing`.
- [ ] Prompt xác nhận khi đổi fab→com có route (Q5).
- [ ] Seed master `manufacturing_process` + `material` (read-only select options, chưa cost).
- [ ] 6 bottom panel tab nội dung thực:
  - Đơn hàng: fetch `/api/orders?bomTemplateId=`, render CompactListTable.
  - WO: fetch `/api/work-orders?bomTemplateId=`.
  - Mua sắm: fetch `/api/procurement?bomTemplateId=` (cần join chain via migration 0009 index).
  - Thiếu hàng: compute server từ snapshot, click item = highlight row Grid.
  - ECO: fetch `/api/eco?bomTemplateId=`.
  - Lịch sử: drawer right 480px timeline.
- [ ] Lắp ráp: giữ placeholder + badge "Sắp có" disabled.
- [ ] Extract `CompactListTable` primitive (duplication-report cluster 1) trước khi wire tab.

**Deliverable:** Tất cả 6 module phụ có data thực trong bottom panel, Side Sheet quy trình hoạt động end-to-end, persist metadata.

### Phase 3 — V1.7 GA (5-7 ngày) · Deadline: 2026-05-06

**Goal:** Auto cost calc + PR auto-gen + polish + a11y.

- [ ] Cost calc: `routing.steps.hours × process_rate + blankWeight × material.price_per_kg × (1 + scrap%)`.
- [ ] Lead time calc: max(sum route hours / capacity xưởng, supplier leadTime).
- [ ] Cột "Ước tính lead time" + "Cost" toggle (default hidden, button toolbar toggle).
- [ ] Button "Tạo PR từ BOM" — gom line com theo supplier, bulk create PR via transaction.
- [ ] Migration 0009: index `bom_snapshot_line(bom_template_id)` + `pr_line(bom_snapshot_line_id)` cho procurement join chain.
- [ ] Migration sang schema 5c Hybrid (thêm cột `bom_line.kind` enum) khi data shape chốt — optional, nếu JSONB vẫn performant thì defer.
- [ ] Motion polish: tab switch fade, panel resize smooth, Side Sheet spring.
- [ ] A11y: Grid keyboard full (Arrow/Tab/F2/Enter/Esc), bottom panel tab Ctrl+1..7, Side Sheet focus trap + Esc.
- [ ] Mobile fallback proper: Grid horizontal scroll + freeze 2 cột đầu, panel stack.
- [ ] Export route sheet PDF cho tổ xưởng.
- [ ] Lighthouse ≥ 90 mobile.
- [ ] Tag `v1.7.0`, smoke 45+ assertions.

**Deliverable:** Cost tự động, PR auto-gen, polish hoàn thiện, mobile usable.

---

## 7. Open questions cho user (chỉ blocker thực sự)

Chỉ 2 câu thực sự blocker — không hỏi vặt:

1. **[BLOCKER Phase 2]** Khi extract `CompactListTable` primitive (duplication cluster 1 với 6 table hiện hữu — OrderListTable, BomListTable, PRListTable, POListTable, ShortageListTable, SnapshotBoardTable), anh muốn refactor **toàn bộ 6 file luôn** (rủi ro visual regression cao hơn nhưng giảm nợ kỹ thuật triệt để) hay **chỉ extract + dùng cho bottom panel tab mới** (giữ 6 file cũ nguyên, refactor lần 2 ở V1.8)?

2. **[BLOCKER Phase 2]** Sub-route cũ `/bom/[id]/orders`, `/work-orders`, `/procurement`, `/shortage`, `/eco`, `/assembly`, `/history` — có cần **giữ lại như permalink** (bookmark, share URL) với redirect sang `/bom/[id]/grid?panel=orders` hay **xoá hẳn** (route 404)? Keeping redirect an toàn hơn cho user đã save bookmark, nhưng tốn 7 file route shell.

Tất cả Q6-Q10 của brainstorm cũ (`kind-routing-brainstorm.md`) giải quyết tại lúc implement từng phase, không cần block.

---

## 8. Deliverable cuối

File này (`plans/v1.7/integrated-workspace-brainstorm.md`) commit + WORKLOG block Claude mới sau khi user duyệt.

**Next step sau khi user duyệt:**
1. Hand off `planner` agent viết implementation plan chi tiết V1.7-beta (Phase 1) với file-level breakdown + test plan.
2. `planner-researcher` verify Pattern B bottom panel + resize drag có library sẵn (`react-resizable-panels`? hay custom 20 dòng code?) — avoid NIH.
3. `ui-ux-designer` sketch mockup Topbar + bottom panel + Side Sheet trước khi code (khuyến nghị nhưng optional nếu anh Hoạt tin kế hoạch này).

**Rủi ro chính cần anh Hoạt biết:**
- **Univer `IDataValidation` list** — cần test thực tế fill-down 20 dòng có giữ validation không (tài liệu Univer ít). Có backup plan Shadcn Select overlay nếu Univer fail.
- **Recursive refactor row visibility** (group collapse) có thể xung đột với current frozen header/band coloring — cần snapshot test visual.
- **Bottom panel height persist localStorage per-user** chưa có precedent trong codebase — cần tiny hook `useLocalStorage<number>()` mới.

**Estimation tổng V1.7 beta → GA:** 11-15 ngày công (3-4 + 3-4 + 5-7). Giả định 1 dev full-time, CI/CD stable, không blocker Univer.

---

*End of brainstorm. Tổng ~2100 từ. Quyết định thay user xong, chờ anh Hoạt duyệt để chuyển planner.*
