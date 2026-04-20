# Deployment + Feature Flag + Rollback

> **Estimate:** 0.5 ngày (4h) — thực thi gộp với buffer day.
> **Owner:** Thắng.
> **Dependency:** tất cả 5 trụ cột DONE + test xong local.

---

## 1. Bundle size impact

### 1.1 Univer footprint

| Package | Gzip size (ước tính) |
|---|---|
| `@univerjs/presets` | ~50KB |
| `@univerjs/preset-sheets-core` | ~300KB |
| `@univerjs/preset-sheets-advanced` (formula + conditional) | ~150KB |
| `@univerjs/sheets-clipboard` | ~40KB |
| **Tổng** | **~540KB gzip** |

Baseline route `/bom/[code]` hiện tại: ~180KB gzip.
Sau khi thêm: ~720KB gzip (chỉ trên route này).

### 1.2 Giảm nhẹ

- **Dynamic import** (đã mô tả Trụ cột 2 §10):
  ```tsx
  const UniverGrid = dynamic(() => import("@/components/bom-grid/UniverGrid"), { ssr: false });
  ```
- **Preload sau login 2s**: để first-time open `/bom/[code]` không chậm:
  ```tsx
  // apps/web/src/app/(app)/layout.tsx
  useEffect(() => {
    const t = setTimeout(() => {
      import("@/components/bom-grid/UniverGrid").catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, []);
  ```
- **Không import** ở route khác → route `/items`, `/orders`… không tăng size.
- Lighthouse budget: FCP <2.5s, LCP <3.5s cho `/bom/[code]` trên mạng 4G mô phỏng.

---

## 2. Migration order trên production

**KHÔNG được** chạy migration + deploy code cùng lúc — rủi ro race condition.

### 2.1 Trình tự chuẩn

```
Step 1: Deploy code MỚI với feature flag OFF (default)
        ─────▶ Container chạy, các route mới trả 404 (flag off)
        ─────▶ Route /bom/[code] vẫn dùng table HTML cũ

Step 2: Run migration 0008a + 0008b + 0008c trên production DB
        ─────▶ ADD COLUMN zero-lock; CREATE TABLE không ảnh hưởng gì
        ─────▶ Backfill + seed alias

Step 3: Smoke test local (nhìn container logs không lỗi)

Step 4: Bật flag NEXT_PUBLIC_FF_BOM_GRID_V2=true cho ADMIN trước
        ─────▶ ENV scoped: NEXT_PUBLIC_FF_BOM_GRID_V2_ROLES=admin
        ─────▶ Chỉ admin mở /bom/[code] mới thấy Univer
        ─────▶ User thường vẫn thấy table cũ

Step 5: Quan sát 24-48h
        ─────▶ Check Grafana: error rate, latency p95, bundle load time
        ─────▶ Activity log có entry UPDATE_CELL bình thường?
        ─────▶ Status sync job không backlog?

Step 6: Bật cho TẤT CẢ
        ─────▶ NEXT_PUBLIC_FF_BOM_GRID_V2=true (không scope roles)
```

### 2.2 Command cụ thể

```bash
# Bước 1: build + push image
cd c:/dev/he-thong-iot
pnpm build
docker build -t ghcr.io/andy-cods/he-thong-iot:v1.5.0 .
docker push ghcr.io/andy-cods/he-thong-iot:v1.5.0

# Bước 2: SSH VPS, pull + restart với FLAG OFF
ssh -i ~/.ssh/iot_vps root@123.30.48.215
cd /opt/hethong-iot
echo "NEXT_PUBLIC_FF_BOM_GRID_V2=false" >> .env
echo "NEXT_PUBLIC_FF_PRODUCT_LINES=false" >> .env
docker compose pull
docker compose up -d

# Bước 3: Migration
docker compose exec iot_web pnpm -F @iot/db drizzle:migrate
docker compose exec iot_web pnpm -F @iot/db run seed:product-line-backfill
docker compose exec iot_web pnpm -F @iot/db run seed:alias-supplier

# Bước 4: Bật cho admin
sed -i 's/NEXT_PUBLIC_FF_BOM_GRID_V2=false/NEXT_PUBLIC_FF_BOM_GRID_V2=true/' .env
echo "NEXT_PUBLIC_FF_BOM_GRID_V2_ROLES=admin" >> .env
echo "NEXT_PUBLIC_FF_PRODUCT_LINES=true" >> .env
echo "NEXT_PUBLIC_FF_PRODUCT_LINES_ROLES=admin" >> .env
docker compose up -d iot_web

# Bước 5: quan sát 24-48h (Grafana dashboard)

# Bước 6: bật cho tất cả
sed -i '/NEXT_PUBLIC_FF_BOM_GRID_V2_ROLES/d' .env
sed -i '/NEXT_PUBLIC_FF_PRODUCT_LINES_ROLES/d' .env
docker compose up -d iot_web
```

---

## 3. Feature flag implementation

File: `apps/web/src/lib/feature-flags.ts`.

```ts
import { cookies } from "next/headers";

type Flag = "bomGridV2" | "productLines" | "activityLog" | "statusSync";

const FLAG_ENV: Record<Flag, { envKey: string; rolesEnvKey?: string }> = {
  bomGridV2:   { envKey: "NEXT_PUBLIC_FF_BOM_GRID_V2",   rolesEnvKey: "NEXT_PUBLIC_FF_BOM_GRID_V2_ROLES" },
  productLines:{ envKey: "NEXT_PUBLIC_FF_PRODUCT_LINES", rolesEnvKey: "NEXT_PUBLIC_FF_PRODUCT_LINES_ROLES" },
  activityLog: { envKey: "NEXT_PUBLIC_FF_ACTIVITY_LOG" },
  statusSync:  { envKey: "NEXT_PUBLIC_FF_STATUS_SYNC" },
};

export function isFlagOn(flag: Flag, userRoles?: string[]): boolean {
  const cfg = FLAG_ENV[flag];
  if (process.env[cfg.envKey] !== "true") return false;

  // Role scope?
  const scoped = cfg.rolesEnvKey ? process.env[cfg.rolesEnvKey] : undefined;
  if (!scoped) return true;

  const allowedRoles = scoped.split(",").map((s) => s.trim());
  return (userRoles ?? []).some((r) => allowedRoles.includes(r));
}
```

Client usage:

```tsx
import { isFlagOn } from "@/lib/feature-flags";
import { useSession } from "@/hooks/useSession";

const { user } = useSession();
if (isFlagOn("bomGridV2", user.roles)) {
  return <UniverGrid ... />;
}
return <LegacyBomTable ... />;
```

---

## 4. Rollback plan

### 4.1 Rollback soft (feature flag off)

Nếu phát hiện bug nặng:

```bash
# SSH VPS
ssh -i ~/.ssh/iot_vps root@123.30.48.215
cd /opt/hethong-iot
sed -i 's/NEXT_PUBLIC_FF_BOM_GRID_V2=true/NEXT_PUBLIC_FF_BOM_GRID_V2=false/' .env
sed -i 's/NEXT_PUBLIC_FF_PRODUCT_LINES=true/NEXT_PUBLIC_FF_PRODUCT_LINES=false/' .env
docker compose up -d iot_web
# ⏱ ~30s downtime của container web
```

Ảnh hưởng:
- Grid trở về table HTML cũ (route `/bom/[code]`).
- Nav "Dòng sản phẩm" biến mất.
- Activity log server vẫn nhận insert bình thường (không liên quan flag).
- Status sync worker vẫn chạy (data vẫn cập nhật, chỉ UI không show).

### 4.2 Rollback hard (revert code)

Nếu flag off chưa đủ (VD: migration schema sai):

```bash
# Revert code về tag v1.4.x
ssh -i ~/.ssh/iot_vps root@123.30.48.215
cd /opt/hethong-iot
docker compose stop
docker tag ghcr.io/andy-cods/he-thong-iot:v1.4.x iot-web:latest  # nếu có backup tag
docker compose up -d

# Revert migration (nếu cần)
docker compose exec iot_web pnpm -F @iot/db drizzle:migrate:down --steps=3
# ↑ phải đã viết sẵn DOWN migration — xem §4.3
```

### 4.3 Down migrations

Mỗi file `0008X.sql` UP cần 1 file `0008X.down.sql` tương ứng:

```sql
-- 0008a.down.sql
DROP TABLE IF EXISTS app.alias_item;
DROP TABLE IF EXISTS app.alias_supplier;
DROP TRIGGER IF EXISTS trg_activity_log_no_update ON app.activity_log;
DROP FUNCTION IF EXISTS app.fn_activity_log_append_only();
DROP TABLE IF EXISTS app.activity_log;
DROP TABLE IF EXISTS app.product_line_member;
DROP TABLE IF EXISTS app.product_line;
```

```sql
-- 0008b.down.sql
ALTER TABLE app.bom_line
  DROP COLUMN IF EXISTS derived_status_source,
  DROP COLUMN IF EXISTS derived_status_updated_at,
  DROP COLUMN IF EXISTS derived_status;

ALTER TABLE app.bom_template
  DROP COLUMN IF EXISTS univer_snapshot_updated_by,
  DROP COLUMN IF EXISTS univer_snapshot_updated_at,
  DROP COLUMN IF EXISTS univer_snapshot;
```

⚠️ **Data loss cảnh báo:** rollback migration = mất `univer_snapshot` + `derived_status`. Bắt buộc `pg_dump` trước khi rollback.

---

## 5. Monitoring sau deploy

### 5.1 Metrics thêm vào Grafana

Theo V1.4 setup đã có Prometheus + Grafana:

- `bom_grid_save_total` (counter) — số lần save snapshot.
- `bom_grid_save_duration_seconds` (histogram) — latency POST.
- `bom_grid_snapshot_size_bytes` (histogram) — size JSONB.
- `status_sync_jobs_total{kind, result}` (counter) — success/fail per event kind.
- `status_sync_job_duration_seconds` (histogram).
- `activity_log_insert_total{action}` (counter).
- `sse_connections_active` (gauge) — số client đang connect `/bom/[id]/stream`.

### 5.2 Alert rules mới

```yaml
# deploy/prometheus/alerts.yml
- alert: BomGridSaveFailureRate
  expr: rate(bom_grid_save_total{result="fail"}[5m]) > 0.05
  for: 10m
  annotations: { summary: "BOM Grid save fail rate >5%" }

- alert: StatusSyncBacklog
  expr: bullmq_queue_size{queue="status-sync"} > 100
  for: 5m
  annotations: { summary: "Status sync queue backlog >100 jobs" }

- alert: SSEConnectionsSurge
  expr: sse_connections_active > 50
  for: 15m
  annotations: { summary: "SSE connections unusually high" }
```

### 5.3 Log sampling

- Log 100% `STATUS_SYNC` action (debug dễ).
- Log 10% `UPDATE_CELL` (cell edit quá nhiều — sampling đủ).
- Log 100% errors.

---

## 6. Files phải tạo/sửa

| Path | Action |
|---|---|
| `apps/web/src/lib/feature-flags.ts` | CREATE |
| `packages/db/migrations/0008a.down.sql` | CREATE |
| `packages/db/migrations/0008b.down.sql` | CREATE |
| `packages/db/migrations/0008c.down.sql` | CREATE |
| `.env.example` | EDIT — thêm 4 flag |
| `deploy/prometheus/alerts.yml` | EDIT — thêm 3 alert |
| `deploy/grafana/dashboards/bom-grid.json` | CREATE — dashboard mới |
| `PROGRESS.md` | EDIT — checklist V1.5 |
| `docs/deploy-v1.5.md` | CREATE — runbook triển khai |

---

## 7. TODO checklist

- [ ] Viết `feature-flags.ts` + unit test
- [ ] Viết down migrations
- [ ] Update `.env.example` với 4 flag
- [ ] Grafana dashboard BOM Grid (save rate, sync backlog)
- [ ] Alert rules Prometheus
- [ ] Runbook deploy-v1.5.md step-by-step
- [ ] Backup DB trước deploy (`pg_dump | gpg`)
- [ ] Deploy staging (nếu có) — nếu không, deploy directly trong giờ ít người dùng
- [ ] Smoke test sau deploy: login admin, mở `/product-lines`, mở `/bom/Z0000002`, sửa cell
- [ ] Quan sát Grafana 24h
- [ ] Mở flag cho tất cả user
