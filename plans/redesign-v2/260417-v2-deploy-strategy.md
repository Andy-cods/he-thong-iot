# V2 Deploy Strategy — Branch `redesign/direction-b-v2` lên VPS `123.30.48.215`

> **Ngày:** 2026-04-17
> **Mục tiêu:** Deploy V2 FE redesign (24 commits từ V1 Direction B base) lên VPS hiện tại — không đổi schema, không đổi domain, downtime ≤ 60s, có rollback ≤ 2 phút.
> **Input tham chiếu:**
> - `plans/redesign-v2/260417-v2-implementation-plan.md` §12 (VPS mới — không áp dụng vì giữ VPS cũ)
> - `plans/redesign-v2/260417-v2-design-spec.md` §9 Migration strategy
> - `PROGRESS.md` Giai đoạn 3 + 5
> - `Dockerfile` (root) multi-stage runtime + worker-runtime
> - `deploy/docker-compose.yml` (tag image `:local` đang dùng)
> **Owner:** Claude Code (cook agent sẽ thực thi §9 checklist)
> **Brutal honesty:** plan này KHÔNG né tránh khó khăn — build trên VPS 2 vCPU HDD là điểm đau bắt buộc 35-45 phút, không có cách nhanh hơn nếu không thay đổi thiết lập hiện tại.

---

## §1. Strategy đề xuất — 3 option

### A. Clean rebuild trên VPS (RECOMMEND)

**Mô tả:** SCP source V2 từ Windows local → VPS, prune Docker build cache 9.5GB lấy lại RAM/IO cache, `docker build --target runtime -t hethong-iot:v2` trên VPS, tag lại `:local` để compose đang dùng không cần edit, `docker compose up -d --force-recreate app worker` → smoke.

**Pros:**
- Pipeline quen thuộc (V1 đã chạy flow tương tự) — rủi ro "điều chưa biết" thấp nhất.
- Không cần Docker Desktop local (user confirm không có).
- Không cần setup Docker registry private (GHCR, Docker Hub) — bỏ qua auth/quota.
- Caddy/Postgres/Redis không đụng → cert Let's Encrypt, volume data an toàn tuyệt đối.
- Rollback đơn giản: đổi tag image → compose up.

**Cons:**
- Build 30-45 phút trên HDD 2 vCPU. Không tránh được.
- Downtime ~30s lúc `docker compose up -d --force-recreate app` (container cũ stop → container mới start + healthcheck settle).
- Ngốn RAM peak ~1.6GB trong build (swap 4GB đã cover — V1 đã chứng minh).

**Khi nào chọn:** default — đây là baseline.

**Timing:** 50-70 phút end-to-end.

---

### B. Build local Windows + `docker save` / `docker load` (REJECT)

**Mô tả:** `pnpm build` local → `docker build` local (cần Docker Desktop) → `docker save hethong-iot:v2 | gzip > iot-v2.tar.gz` (~280 MB) → scp → ssh `docker load`.

**Pros lý thuyết:**
- Tổng thời gian 10-15 phút (build local SSD nhanh gấp 8×, transfer 280MB ~5 phút qua VN network).

**Cons thực tế — kill option:**
- **User KHÔNG có Docker Desktop.** Cài mới tốn 2-3GB download + license Docker Desktop for Windows cho commercial use (Song Châu có thể vướng) + phải bật WSL2 nếu chưa có + reboot.
- Docker build on Windows không dùng cache registry nên lần đầu vẫn pull 1GB base images.
- Mix platform risk: `node:20-bookworm-slim` linux/amd64 thì OK từ Windows Docker Desktop, nhưng vẫn có case argon2 native binding khác giữa build host và runtime host → khó debug.
- SCP 280MB trên HDD VPS → write IO thắt cổ chai cỡ 15-20MB/s → 15-20 phút upload (không nhanh như lý thuyết).

**Kết luận:** Tiết kiệm ~20 phút build nhưng overhead setup + rủi ro khác platform không đáng. REJECT — reuse A.

**Khi nào tái xét:** V2.1 nếu user cài Docker Desktop, hoặc setup GHCR build workflow (plan §12.2 trong implementation-plan đã note).

---

### C. Blue-green deploy (REJECT)

**Mô tả:** Spin up `iot_app_v2` + `iot_worker_v2` chạy image mới song song với `iot_app` V1 (cùng network `iot_net`), healthcheck pass → edit Caddyfile upstream từ `iot_app:3001` sang `iot_app_v2:3001` → reload Caddy → stop V1.

**Pros lý thuyết:**
- Downtime 0 giây (Caddy reload hot).
- Rollback cực nhanh (flip upstream lại).

**Cons kill option — VPS chỉ 2GB RAM:**
- `iot_app` hiện `mem_limit: 768m` + `iot_worker` `mem_limit: 256m` + `iot_postgres` `mem_limit: 640m` + `iot_redis` `mem_limit: 192m` + `iot_caddy` `mem_limit: 128m` = **1984 MB đã đặt chỗ**.
- Thêm `iot_app_v2` + `iot_worker_v2` = +1024 MB nữa → tổng 3008 MB > 2GB RAM physical → OOM killer sẽ bóp cổ Postgres hoặc Redis trước (lowest cgroup priority) → mất data integrity.
- Swap 4GB có cover về mặt lý thuyết nhưng swap trên HDD IOPS cực tệ → Postgres queries sẽ timeout 30s+.
- Container name collision: docker-compose hiện chỉ khai báo `app`/`worker` — phải viết compose file phụ `docker-compose.v2.yml` với service name khác → thêm 1 file cần maintain.
- Caddyfile hiện hard-code `reverse_proxy app:3001` → phải edit Caddyfile + reload → tiếp xúc Let's Encrypt flow, rủi ro cert drop nếu reload sai.

**Kết luận:** Không khả thi trên VPS 2GB. REJECT dứt khoát.

**Khi nào tái xét:** VPS upgrade ≥ 4GB RAM, hoặc split Postgres sang VPS riêng.

---

### Recommend: **Option A — Clean rebuild**

Lý do: đơn giản, ít thay đổi, ít surface bug. Downtime 30s chấp nhận được cho system MES nội bộ < 10 user concurrent. Tổng thời gian 50-70 phút — user uống cà phê xong là xong.

---

## §2. Clean V1 artifacts trước deploy

### 2.1 KEEP (tuyệt đối không touch)

| Hạng mục | Path / Tên | Lý do |
|---|---|---|
| Postgres data volume | `iot_pg_data` (Docker named volume) | Admin user + seeded data + migration 0001/0002a/0002b/0002c đã apply. V2 KHÔNG đổi schema — reuse nguyên trạng. |
| Redis data volume | `iot_redis_data` | BullMQ state (nếu có job queue), session nếu dùng. Stateless cache đa phần nhưng không mất gì khi giữ. |
| Caddy volumes | `iot_caddy_data` + `iot_caddy_config` | Let's Encrypt cert `mes.songchau.vn` + ACME state. **Nếu xóa → mất cert, phải re-issue, Let's Encrypt có rate limit 5/week/domain → rủi ro chết.** |
| Caddyfile | `/opt/hethong-iot/Caddyfile` | Config TLS + CSP + reverse proxy đang work. V2 không đổi. |
| Secrets folder | `/opt/hethong-iot/secrets/*.txt` | JWT, DB password, session, R2 keys. V2 reuse nguyên. |
| Backups folder | `/opt/hethong-iot/backups/` | Dump cũ đề phòng — giữ để có history. |
| `docker-compose.yml` | `/opt/hethong-iot/docker-compose.yml` | File inline JWT_SECRET middleware fix. **Backup `.bak.$(date +%s)` trước khi touch**, nhưng sau backup vẫn reuse bản hiện tại (V2 không cần đổi compose). |
| `.env` | `/opt/hethong-iot/.env` | APP_URL, R2 vars. Giữ nguyên. |

### 2.2 DELETE / PRUNE

| Hạng mục | Command | Kỳ vọng free |
|---|---|---|
| Old source tree | `rm -rf /root/he-thong-iot` | ~500 MB (V1 checkout + node_modules nếu có) |
| Dangling images | `docker image prune -f` | ~200-500 MB (V1 builds cũ intermediate) |
| Unused images KHÔNG dùng bởi container đang chạy | `docker image prune -a -f` (chỉ xóa image không có container referencing) | 500 MB - 2 GB |
| Build cache | `docker builder prune -a -f` | **9.5 GB** (con số user đưa) |
| Stopped containers (nếu có) | `docker container prune -f` | 10-50 MB |
| **TUYỆT ĐỐI KHÔNG** `docker volume prune` | — | — sẽ xóa `iot_pg_data` mất admin user |
| **TUYỆT ĐỐI KHÔNG** `docker system prune --volumes` | — | lý do như trên |

### 2.3 Commands cụ thể từng bước (copy-paste SSH)

```bash
# 0. Verify disk BEFORE
df -h /
du -sh /var/lib/docker/ /root/he-thong-iot/ /opt/hethong-iot/ 2>/dev/null
docker system df

# 1. Tag V1 image hiện tại làm backup (rollback điểm)
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep hethong-iot
docker tag hethong-iot:local hethong-iot:v1-backup-$(date +%Y%m%d)
docker images | grep hethong-iot  # verify tag v1-backup-YYYYMMDD tồn tại

# 2. Xóa source V1 cũ
rm -rf /root/he-thong-iot
ls -la /root/  # verify không còn

# 3. Prune images dangling (không xóa :v1-backup-* và :local đang dùng)
docker image prune -f

# 4. Prune build cache (đây là phần to nhất, ~9.5GB)
docker builder prune -a -f

# 5. Verify AFTER
df -h /
du -sh /var/lib/docker/
docker system df
# expected: /var/lib/docker/ giảm từ ~10.72GB xuống ~2-3GB
```

**Acceptance:** `docker system df` → Build Cache "RECLAIMABLE 0B" hoặc < 100 MB; disk `/` free tăng ≥ 9 GB.

**Rollback nếu lỡ tay:** Không có. Đây là chỗ duy nhất hoàn toàn destructive — nếu xóa nhầm image `:local` phải rebuild 40 phút. Vì vậy BƯỚC 1 (tag `v1-backup-*`) là mandatory trước khi prune.

---

## §3. Deploy sequence — 10 bước

Mỗi bước có: **Command**, **Verify**, **Rollback point**. Bước nào fail thì chặn lại, rollback tại điểm gần nhất, không đi tiếp.

### Bước 1. Pre-check + backup Postgres

```bash
# 1a. Backup Postgres (critical — V2 không đổi schema nhưng phòng hờ)
ssh -i ~/.ssh/iot_vps root@123.30.48.215 'bash -c "
  mkdir -p /opt/hethong-iot/backups
  DUMP=/opt/hethong-iot/backups/pre-v2-$(date +%Y%m%d-%H%M%S).sql.gz
  docker exec iot_postgres pg_dump -U hethong_app -d hethong_iot | gzip > \$DUMP
  ls -lh \$DUMP
"'

# 1b. Verify backup > 100KB (schema + data seeded ≥ 100KB)
# Command trả size. Nếu < 100KB → fail.
```

**Verify:** File dump size ≥ 100 KB, gzip integrity pass (`gzip -t /opt/.../pre-v2-*.sql.gz`). Nếu FAIL → stop, debug Postgres container trước khi tiếp.

**Rollback point:** Không cần — đây là backup READ-ONLY.

---

### Bước 2. Kill dangling docker build process (nếu có)

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 'bash -c "
  ps aux | grep -E \"docker.build|buildkit\" | grep -v grep
  # Nếu có process zombie từ lần trước → kill
  # pkill -f \"docker build\" 2>/dev/null || true
"'
```

**Verify:** `ps aux | grep docker.build` chỉ còn dockerd/containerd daemon.

**Rollback:** N/A.

---

### Bước 3. Tag V1 image backup + Prune Docker

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 'bash -c "
  # 3a. Tag V1 image đang dùng làm :v1-backup-<date>
  docker tag hethong-iot:local hethong-iot:v1-backup-$(date +%Y%m%d)

  # 3b. Verify tag tồn tại
  docker images | grep hethong-iot

  # 3c. Prune
  docker image prune -f
  docker builder prune -a -f
  docker container prune -f
"'
```

**Verify:**
- `docker images | grep v1-backup` → có dòng `hethong-iot:v1-backup-YYYYMMDD`.
- `docker system df` Build Cache < 100 MB.
- `df -h /` free tăng.

**Rollback point:** Từ đây rollback được bằng `docker tag hethong-iot:v1-backup-YYYYMMDD hethong-iot:local && docker compose up -d --force-recreate app worker`.

---

### Bước 4. Verify disk free đủ cho build mới

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 'df -h /'
# expected: Avail ≥ 8 GB (build cần ~4GB working space + safety margin)
```

**Verify:** `Avail ≥ 8GB` trên `/`. Nếu < 5GB → stop, prune tiếp hoặc xóa log cũ (`/opt/hethong-iot/logs/*.log` nếu có).

**Rollback:** N/A (read-only check).

---

### Bước 5. Tar local V2 source + SCP

```bash
# Chạy trên Windows local (cwd C:\dev\he-thong-iot)
cd /c/dev/he-thong-iot

# 5a. Verify checkout đúng branch V2
git branch --show-current
# expected: redesign/direction-b-v2

# 5b. Verify build pass local (nên đã pass theo task) — skip nếu đã verify
# pnpm -F @iot/web build

# 5c. Tar source, exclude node_modules/.git/.next/dist/logs
tar --exclude='./node_modules' \
    --exclude='./.git' \
    --exclude='./apps/web/.next' \
    --exclude='./apps/worker/dist' \
    --exclude='./packages/*/dist' \
    --exclude='./deploy/logs' \
    --exclude='./.vs' \
    --exclude='./tmp' \
    -czf /tmp/iot-src-v2.tar.gz -C /c/dev/he-thong-iot .

ls -lh /tmp/iot-src-v2.tar.gz
# expected: ~5-15 MB

# 5d. SCP tarball lên VPS
scp -i ~/.ssh/iot_vps /tmp/iot-src-v2.tar.gz root@123.30.48.215:/tmp/iot-src-v2.tar.gz

# 5e. Verify trên VPS
ssh -i ~/.ssh/iot_vps root@123.30.48.215 'ls -lh /tmp/iot-src-v2.tar.gz && tar -tzf /tmp/iot-src-v2.tar.gz | head -20'
```

**Verify:**
- Tarball local ≥ 3 MB (nếu < 1 MB → có thể excluded nhầm).
- `tar -tzf` liệt kê được file (không corrupt).
- Thấy `package.json`, `Dockerfile`, `apps/web/`, `plans/redesign-v2/`.

**Rollback point:** N/A (chỉ write vào `/tmp`).

---

### Bước 6. Extract source V2 trên VPS

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 'bash -c "
  rm -rf /root/he-thong-iot
  mkdir -p /root/he-thong-iot
  tar xzf /tmp/iot-src-v2.tar.gz -C /root/he-thong-iot
  cd /root/he-thong-iot
  ls -la
  cat package.json | grep version
  git log --oneline -5 2>/dev/null || echo '(no git, OK)'
"'
```

**Verify:**
- Folder `/root/he-thong-iot/apps/web/`, `/root/he-thong-iot/Dockerfile` tồn tại.
- `apps/web/src/lib/dashboard-mocks.ts` tồn tại (bug fix V2).
- `apps/web/tailwind.config.ts` chứa palette zinc (verify: `grep -q 'zinc' apps/web/tailwind.config.ts`).

**Rollback point:** N/A (chỉ extract source, chưa động container).

---

### Bước 7. Docker build V2 image

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 'bash -c "
  cd /root/he-thong-iot
  # Build target runtime (web). Worker tái sử dụng cùng image (đã COPY worker-deploy vào /app/apps/worker-deploy trong stage runtime).
  # --progress=plain để xem log linh hoạt
  # --target runtime để tránh build luôn stage worker-runtime (không dùng)
  DOCKER_BUILDKIT=1 docker build \
    --target runtime \
    -t hethong-iot:v2 \
    --progress=plain \
    . 2>&1 | tail -200
"'
```

**Timing:** 30-45 phút trên 2 vCPU HDD. Monitor qua `top` trên SSH thứ 2 nếu muốn — CPU 190%+ + IO wait cao là bình thường.

**Verify:**
- Exit code 0.
- `docker images | grep hethong-iot:v2` hiện dòng mới với SIZE ~270-300 MB.
- Command `docker inspect hethong-iot:v2 --format '{{.Created}}'` ra timestamp vừa xong.

**Rollback point:** Nếu build FAIL (syntax error, dep missing, OOM):
- Image `:local` và `:v1-backup-*` vẫn còn nguyên.
- Không cần rollback gì — container V1 vẫn đang chạy image cũ (build mới không replace).
- Debug: `docker build` lại với `--no-cache` nếu nghi cache hỏng; hoặc check log cuối cùng để xem stage nào fail.

---

### Bước 8. Tag image V2 thành `:local` (để compose pick up)

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 'bash -c "
  # Tag V2 thành :local → compose default pull tag này
  docker tag hethong-iot:v2 hethong-iot:local

  # Verify 2 tag trỏ cùng image ID
  docker images | grep hethong-iot
  # expected:
  # hethong-iot  local                <V2_IMAGE_ID>
  # hethong-iot  v2                   <V2_IMAGE_ID>
  # hethong-iot  v1-backup-<date>     <V1_IMAGE_ID>
"'
```

**Verify:** 3 tag tồn tại, `:local` và `:v2` cùng image ID, `:v1-backup-*` image ID khác.

**Rollback point:**
- **ROLLBACK TAG-LEVEL (< 10s):** `docker tag hethong-iot:v1-backup-YYYYMMDD hethong-iot:local` → khôi phục `:local` trỏ về V1.

---

### Bước 9. Recreate app + worker containers

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 'bash -c "
  cd /opt/hethong-iot

  # 9a. Backup compose file (dù V2 không touch compose — phòng hờ)
  cp docker-compose.yml docker-compose.yml.bak.$(date +%Y%m%d-%H%M%S)

  # 9b. Force recreate chỉ app + worker (giữ postgres, redis, caddy)
  docker compose up -d --force-recreate --no-deps app worker

  # 9c. Verify container state
  sleep 5
  docker ps --filter name=iot_ --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
"'
```

**Expected containers sau bước 9c:**

```
NAMES          STATUS                      IMAGE
iot_app        Up 5 seconds                hethong-iot:local   (image ID mới)
iot_worker     Up 5 seconds                hethong-iot:local   (image ID mới)
iot_postgres   Up X hours (healthy)        postgres:16-alpine  (KHÔNG restart)
iot_redis      Up X hours (healthy)        redis:7-alpine      (KHÔNG restart)
iot_caddy      Up X hours                  caddy:2-alpine      (KHÔNG restart)
```

**Verify:**
- `iot_app` + `iot_worker` Status "Up" với uptime ngắn (≤ 30s).
- `iot_postgres`/`iot_redis`/`iot_caddy` uptime KHÔNG reset (vẫn "Up X hours").
- Image ID của `iot_app` = image ID của tag `:local` mới = image ID `:v2`.

**Rollback point:**

```bash
# Rollback CONTAINER-LEVEL (~30s):
docker tag hethong-iot:v1-backup-YYYYMMDD hethong-iot:local
docker compose up -d --force-recreate --no-deps app worker
```

---

### Bước 10. Wait + Smoke test

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 'bash -c "
  # 10a. Wait 15s cho Next.js boot + BullMQ connect Redis
  sleep 15

  # 10b. Check container logs (không có error fatal)
  docker logs iot_app --tail=50 2>&1 | tail -30
  docker logs iot_worker --tail=30 2>&1 | tail -15
"'
```

Tiếp theo chạy smoke test suite ở §4.

**Verify app logs:**
- `Next.js 14.x.x` hoặc `- Local: http://...:3001` xuất hiện.
- KHÔNG có `Error:`, `FATAL`, `unhandledRejection` trong 50 dòng cuối.

**Verify worker logs:**
- `BullMQ ready` hoặc `Worker connected to Redis`.
- KHÔNG có `ECONNREFUSED`, `Cannot find module`.

**Rollback point:** Nếu smoke test FAIL → về §5 rollback plan.

---

## §4. Smoke test suite (12 curl tests)

Chạy từ máy bất kỳ có internet (local Windows OK). Expect: mỗi test exit code 0 + assertion pass.

```bash
# Lấy cookie từ login
BASE=https://mes.songchau.vn
COOKIE=/tmp/iot-v2-cookie.txt
rm -f $COOKIE

# T1. Health check public
curl -sS -o /dev/null -w 'T1 /api/health → %{http_code}\n' $BASE/api/health
# expect: 200

# T2. Login (set cookie)
curl -sS -c $COOKIE -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"ChangeMe!234"}' \
  -w 'T2 login → %{http_code}\n' -o /tmp/iot-login.json
cat /tmp/iot-login.json | grep -q '"ok":true' && echo "T2 body OK" || echo "T2 body FAIL"
# expect: 200 + body có "ok":true + cookie file có iot_session

# T3. Verify cookie file
grep -q 'iot_session' $COOKIE && echo "T3 cookie OK" || echo "T3 cookie FAIL"

# T4. /api/me với cookie
curl -sS -b $COOKIE -o /tmp/iot-me.json -w 'T4 /api/me → %{http_code}\n' $BASE/api/me
grep -q '"username":"admin"' /tmp/iot-me.json && echo "T4 body OK" || echo "T4 body FAIL"
# expect: 200 + body có "username":"admin"

# T5. Dashboard HTML render (V2 greeting)
curl -sS -b $COOKIE -o /tmp/iot-dash.html -w 'T5 / → %{http_code}\n' $BASE/
grep -q 'Xin chào\|Tổng quan\|KPI\|Dashboard' /tmp/iot-dash.html && echo "T5 body OK" || echo "T5 body FAIL"
# expect: 200 + body render (không còn bug 500 generateMockOrders)

# T6. Items list HTML
curl -sS -b $COOKIE -o /tmp/iot-items.html -w 'T6 /items → %{http_code}\n' $BASE/items
grep -q 'Danh mục vật tư\|Vật tư\|SKU' /tmp/iot-items.html && echo "T6 body OK" || echo "T6 body FAIL"
# expect: 200

# T7. Items API list
curl -sS -b $COOKIE -o /tmp/iot-items.json -w 'T7 /api/items → %{http_code}\n' "$BASE/api/items?limit=5"
grep -q '"items"' /tmp/iot-items.json && echo "T7 body OK" || echo "T7 body FAIL"
# expect: 200 + body có "items":[...]

# T8. Suppliers list HTML
curl -sS -b $COOKIE -o /tmp/iot-sup.html -w 'T8 /suppliers → %{http_code}\n' $BASE/suppliers
grep -q 'Nhà cung cấp\|Supplier' /tmp/iot-sup.html && echo "T8 body OK" || echo "T8 body FAIL"
# expect: 200

# T9. Suppliers API
curl -sS -b $COOKIE -o /tmp/iot-sup.json -w 'T9 /api/suppliers → %{http_code}\n' "$BASE/api/suppliers?limit=5"
grep -q '"suppliers"\|"items"' /tmp/iot-sup.json && echo "T9 body OK" || echo "T9 body FAIL"
# expect: 200

# T10. Login page static (check V2 zinc palette)
curl -sS -o /tmp/iot-login.html -w 'T10 /login → %{http_code}\n' $BASE/login
grep -q 'Đăng nhập' /tmp/iot-login.html && echo "T10 body OK" || echo "T10 body FAIL"
# expect: 200 (public page)

# T11. PWA receive demo page (nếu có PO demo seed)
curl -sS -b $COOKIE -o /tmp/iot-pwa.html -w 'T11 /pwa/receive/demo → %{http_code}\n' $BASE/pwa/receive/demo
# expect: 200 hoặc 404 nếu không seed demo PO — 404 KHÔNG phải fail deploy, chỉ cần không 500

# T12. Static asset (verify standalone files served)
curl -sS -o /dev/null -w 'T12 /favicon.ico → %{http_code}\n' $BASE/favicon.ico
# expect: 200 (V2 có asset favicon.ico)
```

**Acceptance block (ALL must pass):**

| Test | Expected | Fail = block deploy? |
|---|---|---|
| T1 /api/health 200 | Yes | Yes |
| T2 login 200 + body ok:true | Yes | **Yes — critical** |
| T3 cookie set | Yes | Yes |
| T4 /api/me 200 + username admin | Yes | **Yes — auth flow** |
| T5 / 200 + dashboard render | Yes | **Yes — dashboard bug V1 phải hết** |
| T6 /items 200 + render | Yes | Yes |
| T7 /api/items 200 + items array | Yes | Yes |
| T8 /suppliers 200 + render | Yes | Yes |
| T9 /api/suppliers 200 | Yes | Yes |
| T10 /login 200 + render | Yes | Yes |
| T11 /pwa/receive/demo 200 hoặc 404 | 200 or 404 | No (404 OK nếu không seed demo) |
| T12 /favicon.ico 200 | Yes | No (asset bỏ sót warning thôi) |

---

## §5. Rollback plan

### 5.1 Rollback cấp độ — chọn theo mức độ hỏng

#### Level 1 — Tag-level (< 15s, data intact)

**Áp dụng:** Smoke test fail, container V2 start được nhưng logic lỗi (dashboard 500 quay lại, login redirect loop, render sai).

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 'bash -c "
  # 1. Trỏ tag :local về V1 backup
  V1_TAG=\$(docker images --format \"{{.Repository}}:{{.Tag}}\" | grep hethong-iot | grep v1-backup | head -1)
  echo \"Rollback target: \$V1_TAG\"
  docker tag \$V1_TAG hethong-iot:local

  # 2. Recreate app + worker
  cd /opt/hethong-iot
  docker compose up -d --force-recreate --no-deps app worker

  # 3. Verify
  sleep 10
  docker ps --filter name=iot_
  curl -sS https://mes.songchau.vn/api/health
"'
```

**Timing:** 15-30s tổng. Postgres/Redis/Caddy KHÔNG touch.

---

#### Level 2 — Container-level (restart toàn stack ~1 phút)

**Áp dụng:** Level 1 chưa đủ, nghi ngờ compose config hỏng.

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 'bash -c "
  cd /opt/hethong-iot

  # 1. Restore docker-compose.yml backup (nếu đã touch — §3 bước 9 có backup tự động)
  LATEST_BAK=\$(ls -t docker-compose.yml.bak.* | head -1)
  echo \"Latest backup: \$LATEST_BAK\"
  # cp \$LATEST_BAK docker-compose.yml   # uncomment nếu cần

  # 2. Tag về V1
  V1_TAG=\$(docker images --format \"{{.Repository}}:{{.Tag}}\" | grep hethong-iot | grep v1-backup | head -1)
  docker tag \$V1_TAG hethong-iot:local

  # 3. Down + up toàn stack
  docker compose down
  docker compose up -d
  sleep 20
  docker ps --filter name=iot_
"'
```

**Timing:** 1-2 phút (bao gồm Postgres healthcheck settle).

---

#### Level 3 — Data corrupt (restore Postgres từ pg_dump step 1)

**Áp dụng:** Worst case — V2 chạy migration auto (KHÔNG nên xảy ra vì V2 không đổi schema), ghi nhầm data, hoặc Postgres volume corrupt do hết disk.

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 'bash -c "
  cd /opt/hethong-iot

  # 1. Stop app + worker (ngừng ghi DB)
  docker compose stop app worker

  # 2. Restore Postgres từ dump
  LATEST_DUMP=\$(ls -t backups/pre-v2-*.sql.gz | head -1)
  echo \"Restore from: \$LATEST_DUMP\"

  # 3. Drop + recreate schema app (cẩn thận — destructive)
  docker exec iot_postgres psql -U hethong_app -d hethong_iot -c 'DROP SCHEMA IF EXISTS app CASCADE;'

  # 4. Restore
  zcat \$LATEST_DUMP | docker exec -i iot_postgres psql -U hethong_app -d hethong_iot

  # 5. Verify
  docker exec iot_postgres psql -U hethong_app -d hethong_iot -c \"SELECT count(*) FROM app.users WHERE username='admin';\"

  # 6. Bring app back với V1 image
  V1_TAG=\$(docker images --format \"{{.Repository}}:{{.Tag}}\" | grep hethong-iot | grep v1-backup | head -1)
  docker tag \$V1_TAG hethong-iot:local
  docker compose up -d app worker
"'
```

**Timing:** 3-5 phút.

**ĐÁNH GIÁ RỦI RO:** Level 3 xác suất < 1% vì V2 hoàn toàn không đổi schema. Chỉ chuẩn bị phòng hờ.

---

### 5.2 Caddy + cert — KHÔNG TOUCH

Kế hoạch V2 deploy **TUYỆT ĐỐI KHÔNG** thay đổi:
- `Caddyfile` → không edit.
- `docker compose up` **chỉ** cho `app` + `worker` (`--no-deps` trong §3 bước 9 ensure).
- `iot_caddy` container **không restart** → Let's Encrypt cert session không bị reset → không trigger ACME rate limit.

Nếu vì lý do nào đó Caddy crash → rollback Caddy:

```bash
docker compose up -d caddy
# Caddy tự reload Caddyfile, cert từ volume iot_caddy_data được reuse (không re-issue).
```

---

## §6. Risks + mitigation

| # | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **OOM trong build trên VPS 2GB** | Medium | Build FAIL | Đã có swap 4GB (V1 chứng minh OK 13 phút). `NODE_OPTIONS=--max-old-space-size=1536` trong Dockerfile đã giới hạn Node heap. Nếu vẫn OOM → build với `pnpm -F @iot/web build` standalone rồi copy artifact (fallback, không nên cần). |
| 2 | **Build timeout do HDD IOPS** | High | Long wait | Chấp nhận 30-45 phút. SSH keep-alive (`ServerAliveInterval 60` trong `~/.ssh/config`) để không drop session. Monitor `iostat -x 5` trên SSH thứ 2 nếu muốn — `await` > 100ms là normal. Không cần optimization — đây là cost của 2 vCPU HDD. |
| 3 | **Image V2 crash runtime do env vars mismatch** | Low | Downtime | V2 không đổi env vars. Dockerfile đã có dummy `DATABASE_URL`/`JWT_SECRET` build-time. Runtime env vẫn dùng `JWT_SECRET` inline (middleware fix V1). Mitigation: Level 1 rollback < 15s. |
| 4 | **docker-compose.yml bị edit nhầm** | Low | Compose break | Bước 9 TỰ ĐỘNG `cp docker-compose.yml docker-compose.yml.bak.$(date +%s)` trước mọi touch. Rollback Level 2 restore file. |
| 5 | **Postgres connection pool exhaust trong build** | None | — | Build KHÔNG connect DB (env dummy). Next.js `generateStaticParams` nếu có gọi DB sẽ FAIL build-time → phát hiện ngay, không đến runtime. V2 schema không đổi → không có migration mới cần chạy. |
| 6 | **Free tier Let's Encrypt rate limit bị trigger** | Low | Cert re-issue fail 7 days | Không touch Caddy container. Không `docker volume rm iot_caddy_data`. Nếu lỡ tay → wait 7 ngày hoặc dùng staging cert tạm. |
| 7 | **Browser user bị cookie invalid do JWT_SECRET thay đổi** | None | User phải login lại | V2 reuse secrets/jwt_secret.txt. Không regenerate. Session persist. |
| 8 | **Redis state mất (BullMQ queue pending jobs)** | None | — | Redis container KHÔNG restart. Volume persist. |
| 9 | **Caddy reverse_proxy trỏ sai upstream** | None | 502 Bad Gateway | Caddyfile hard-code `reverse_proxy app:3001` — `app` là service name Docker DNS, container restart vẫn giữ IP alias → Caddy resolve lại trong ≤ 30s. |
| 10 | **User login trong lúc deploy** | Low | 30s gián đoạn | Deploy sau giờ làm (sau 18h VN) để giảm user concurrent. Nếu cần thông báo → Telegram alert `/opt/hethong-iot/scripts/health-check.sh` sau rollback. |

---

## §7. Timing realistic end-to-end

| Bước | Mô tả | Thời gian | Cumulative |
|---|---|---|---|
| 0 | SSH connect + verify state | 1' | 1' |
| 1 | pg_dump backup | 2' | 3' |
| 2 | Kill zombie docker build | 30s | 3.5' |
| 3 | Tag V1 backup + prune cache 9.5GB | 2-3' | 6' |
| 4 | Verify disk free | 30s | 6.5' |
| 5 | Tar local + SCP (5-15 MB qua network VN) | 3-5' | 11' |
| 6 | Extract + verify V2 source trên VPS | 1' | 12' |
| 7 | **Docker build V2** (HDD bottleneck) | **30-45'** | 42-57' |
| 8 | Tag `:v2` → `:local` | 10s | 42-57' |
| 9 | docker compose up --force-recreate app worker | 1' | 43-58' |
| 10 | Wait + logs check + smoke test 12 curl | 5-8' | 48-66' |
| **TOTAL** | | **50-70 phút** | |

**Worst case 70 phút**, **realistic 60 phút**, **best case (cache warm, build cache từ base image có sẵn) 50 phút**.

---

## §8. Acceptance final (done = true)

### 8.1 UI render

- [ ] `/login` render V2 zinc palette (background zinc-900 hero + form card max-w-400px + button blue-500)
- [ ] `/` Dashboard render đúng: H1 xl greeting, 4 KPI card compact h-20 (font-medium 22px tabular-nums value, uppercase 12px label), Orders Readiness table row 36px no zebra, Alerts list divide-y zinc-100, SystemHealthCard header "HỆ THỐNG"
- [ ] `/items` row height 36px, no zebra, SKU sticky mono, header uppercase 11px
- [ ] `/suppliers` row height 36px, Tạo mới button primary sm, segmented filter 3-mode
- [ ] `/pwa/receive/demo` (nếu có seed PO demo) — header h-12 zinc-200, scanner card p-4, lines row 36px

### 8.2 Auth + API

- [ ] Login `admin` / `ChangeMe!234` → 200 + cookie `iot_session` set
- [ ] `/api/me` với cookie → 200 + `{"username":"admin",...}`
- [ ] `/api/items?limit=5` → 200 + array
- [ ] `/api/suppliers?limit=5` → 200 + array
- [ ] `/api/health` → 200

### 8.3 Runtime health

- [ ] `iot_app` logs không có `Error:` / `FATAL` / `unhandledRejection`
- [ ] `iot_worker` logs có `BullMQ ready` hoặc `connected to Redis`, KHÔNG có `ECONNREFUSED`
- [ ] `iot_postgres` status `healthy`, uptime KHÔNG reset từ trước deploy
- [ ] `iot_redis` status `healthy`, uptime KHÔNG reset
- [ ] `iot_caddy` status `Up`, cert valid (`curl -I https://mes.songchau.vn` trả TLS 1.3 + HTTP/2)

### 8.4 Dashboard bug (V1 → V2)

- [ ] GET `/` sau login → status 200 (V1 bị 500 do `generateMockOrders` crash RSC boundary, V2 fix bằng tách `lib/dashboard-mocks.ts`)
- [ ] Không có `"use client"` violation trong Next.js server logs

### 8.5 Certificate + domain

- [ ] `https://mes.songchau.vn` accessible (TLS valid)
- [ ] `curl -sI https://mes.songchau.vn | grep -i 'alt-svc\|http/'` → HTTP/2 + HTTP/3 offer
- [ ] Cert expiry > 30 ngày (`echo | openssl s_client -connect mes.songchau.vn:443 2>/dev/null | openssl x509 -noout -dates`)

### 8.6 Disk + resource

- [ ] `df -h /` Avail ≥ 20 GB sau deploy (build cache đã prune)
- [ ] `docker system df` Build Cache RECLAIMABLE tùy ý (không cần prune tiếp)
- [ ] `docker stats --no-stream` app < 400 MB, worker < 120 MB, postgres < 300 MB

---

## §9. Cook agent checklist — 15 bash blocks tuần tự

> Copy-paste từng block vào cook agent hoặc chạy thủ công. Block nào fail → rollback theo §5 rồi xem xét debug trước khi tiếp tục.

### Block 1 — Pre-flight local

```bash
# Local Windows (cwd C:\dev\he-thong-iot)
cd /c/dev/he-thong-iot
git branch --show-current  # expect: redesign/direction-b-v2
git log --oneline -3
ls apps/web/src/lib/dashboard-mocks.ts  # expect: file tồn tại
```

### Block 2 — Pre-flight VPS (SSH test + disk)

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 '
  echo "=== Disk ==="; df -h /
  echo "=== Docker ==="; docker ps --filter name=iot_ --format "table {{.Names}}\t{{.Status}}"
  echo "=== Images ==="; docker images | grep hethong-iot
'
```

### Block 3 — Backup Postgres (mandatory)

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 '
  mkdir -p /opt/hethong-iot/backups
  DUMP=/opt/hethong-iot/backups/pre-v2-$(date +%Y%m%d-%H%M%S).sql.gz
  docker exec iot_postgres pg_dump -U hethong_app -d hethong_iot | gzip > $DUMP
  ls -lh $DUMP && gzip -t $DUMP && echo "BACKUP OK"
'
```

### Block 4 — Tag V1 backup + Prune Docker

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 '
  TS=$(date +%Y%m%d)
  docker tag hethong-iot:local hethong-iot:v1-backup-$TS
  docker images | grep hethong-iot
  docker image prune -f
  docker builder prune -a -f
  docker container prune -f
  df -h /
'
```

### Block 5 — Tar V2 source + SCP

```bash
# Local Windows
cd /c/dev/he-thong-iot
tar --exclude='./node_modules' --exclude='./.git' \
    --exclude='./apps/web/.next' --exclude='./apps/worker/dist' \
    --exclude='./packages/*/dist' --exclude='./deploy/logs' \
    --exclude='./.vs' --exclude='./tmp' \
    -czf /tmp/iot-src-v2.tar.gz -C /c/dev/he-thong-iot .
ls -lh /tmp/iot-src-v2.tar.gz
scp -i ~/.ssh/iot_vps /tmp/iot-src-v2.tar.gz root@123.30.48.215:/tmp/iot-src-v2.tar.gz
```

### Block 6 — Extract V2 source trên VPS

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 '
  rm -rf /root/he-thong-iot
  mkdir -p /root/he-thong-iot
  tar xzf /tmp/iot-src-v2.tar.gz -C /root/he-thong-iot
  cd /root/he-thong-iot
  ls -la apps/web/src/lib/dashboard-mocks.ts Dockerfile package.json
  grep -q zinc apps/web/tailwind.config.ts && echo "V2 tokens OK"
'
```

### Block 7 — Build Docker V2 image (30-45 phút)

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 '
  cd /root/he-thong-iot
  DOCKER_BUILDKIT=1 docker build --target runtime -t hethong-iot:v2 --progress=plain . 2>&1 | tee /tmp/build-v2.log | tail -100
  echo "=== Build exit code: $? ==="
  docker images | grep hethong-iot:v2
'
```

### Block 8 — Tag V2 thành :local

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 '
  docker tag hethong-iot:v2 hethong-iot:local
  docker images | grep hethong-iot
'
```

### Block 9 — Backup compose + recreate app/worker

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 '
  cd /opt/hethong-iot
  cp docker-compose.yml docker-compose.yml.bak.$(date +%Y%m%d-%H%M%S)
  docker compose up -d --force-recreate --no-deps app worker
  sleep 5
  docker ps --filter name=iot_ --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
'
```

### Block 10 — Wait + verify container logs

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 '
  sleep 15
  echo "=== app logs ==="
  docker logs iot_app --tail=50 2>&1 | tail -30
  echo "=== worker logs ==="
  docker logs iot_worker --tail=30 2>&1 | tail -15
'
```

### Block 11 — Smoke test public endpoints (T1-T4 auth)

```bash
BASE=https://mes.songchau.vn
COOKIE=/tmp/iot-v2-cookie.txt
rm -f $COOKIE
curl -sS -o /dev/null -w 'T1 /api/health → %{http_code}\n' $BASE/api/health
curl -sS -c $COOKIE -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"ChangeMe!234"}' \
  -w 'T2 login → %{http_code}\n' -o /tmp/iot-login.json
cat /tmp/iot-login.json
grep -q 'iot_session' $COOKIE && echo "T3 cookie OK"
curl -sS -b $COOKIE -o /tmp/iot-me.json -w 'T4 /api/me → %{http_code}\n' $BASE/api/me
cat /tmp/iot-me.json
```

### Block 12 — Smoke test pages (T5-T10)

```bash
BASE=https://mes.songchau.vn
COOKIE=/tmp/iot-v2-cookie.txt
curl -sS -b $COOKIE -o /tmp/iot-dash.html -w 'T5 / → %{http_code}\n' $BASE/
grep -oE 'Xin chào|Tổng quan|Dashboard|KPI' /tmp/iot-dash.html | head -3
curl -sS -b $COOKIE -o /tmp/iot-items.html -w 'T6 /items → %{http_code}\n' $BASE/items
curl -sS -b $COOKIE -o /tmp/iot-items.json -w 'T7 /api/items → %{http_code}\n' "$BASE/api/items?limit=5"
curl -sS -b $COOKIE -o /tmp/iot-sup.html -w 'T8 /suppliers → %{http_code}\n' $BASE/suppliers
curl -sS -b $COOKIE -o /tmp/iot-sup.json -w 'T9 /api/suppliers → %{http_code}\n' "$BASE/api/suppliers?limit=5"
curl -sS -o /tmp/iot-login.html -w 'T10 /login → %{http_code}\n' $BASE/login
```

### Block 13 — Smoke test PWA + asset (T11-T12)

```bash
BASE=https://mes.songchau.vn
COOKIE=/tmp/iot-v2-cookie.txt
curl -sS -b $COOKIE -o /tmp/iot-pwa.html -w 'T11 /pwa/receive/demo → %{http_code}\n' $BASE/pwa/receive/demo
curl -sS -o /dev/null -w 'T12 /favicon.ico → %{http_code}\n' $BASE/favicon.ico
```

### Block 14 — Summary + cleanup

```bash
ssh -i ~/.ssh/iot_vps root@123.30.48.215 '
  echo "=== Final state ==="
  docker ps --filter name=iot_ --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
  docker images | grep hethong-iot
  df -h /
  docker system df
  echo "=== Backups ==="
  ls -lh /opt/hethong-iot/backups/ | tail -5
  ls -lh /opt/hethong-iot/docker-compose.yml.bak.* | tail -3
'
```

### Block 15 — Rollback Level 1 (CHỈ CHẠY NẾU SMOKE TEST FAIL)

```bash
# CHỈ CHẠY KHI CẦN ROLLBACK
ssh -i ~/.ssh/iot_vps root@123.30.48.215 '
  V1_TAG=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep hethong-iot | grep v1-backup | head -1)
  echo "Rolling back to: $V1_TAG"
  docker tag $V1_TAG hethong-iot:local
  cd /opt/hethong-iot
  docker compose up -d --force-recreate --no-deps app worker
  sleep 10
  docker ps --filter name=iot_
  curl -sS https://mes.songchau.vn/api/health
'
```

---

## §10. Post-deploy actions (không block acceptance nhưng nên làm)

1. **Update PROGRESS.md** — append Giai đoạn 5 cook checklist: "V2 deployed VPS cũ 123.30.48.215, image hethong-iot:v2, rollback tag v1-backup-YYYYMMDD sẵn sàng 7 ngày".
2. **Telegram notify** (nếu setup): "V2 LIVE tại https://mes.songchau.vn — 24 commits redesign".
3. **Đổi password admin** (đã note trong PROGRESS Giai đoạn 3 todo) — vẫn chưa làm từ V1, làm luôn khi vào check V2 thành công.
4. **Plan cleanup** sau 7 ngày stable: `docker rmi hethong-iot:v1-backup-YYYYMMDD` (tiết kiệm 270MB). KHÔNG xóa sớm hơn — giữ failsafe.
5. **Giám sát logs** 24h đầu: `docker logs -f iot_app --tail=100` mỗi 2-4h quan sát error rate.

---

## §11. Điểm không chắc chắn (brutal honesty)

1. **Build time 30-45 phút là ước lượng** dựa trên V1 đã build 13 phút. V2 có thể lâu hơn 5-15 phút vì:
   - 24 commits mới → nhiều file .tsx cần Next.js compile.
   - Cache Docker đã prune (§3 bước 3) → rebuild toàn bộ stages từ đầu.
   - Nếu thực tế 60 phút vẫn chấp nhận được. Nếu > 90 phút → có vấn đề, cần kill + debug.
2. **Smoke test T11 /pwa/receive/demo** — chưa verify có PO seed `demo` hay không. Nếu 404 không fail deploy, nhưng cần verify manual tay qua browser sau deploy.
3. **Cookie `iot_session`** — verify assumption tên cookie đúng (V1 dùng cookie name centralized trong T1 P0 fixes). Nếu khác → sửa `grep -q 'iot_session'` trong smoke test.
4. **`_CO_VE_`** — nếu VPS có ai khác SSH song song chạy deploy khác → conflict. Block 2 check `ps aux | grep docker.build` phát hiện được.
5. **Let's Encrypt cert** — assumption cert hiện tại expiry > 30 ngày. Nếu đã gần expiry → Caddy tự renew trong background, không ảnh hưởng deploy.

---

## §12. Tóm tắt 1 trang

| Field | Value |
|---|---|
| **Strategy** | Option A — Clean rebuild trên VPS hiện tại |
| **Reject** | Option B (không có Docker Desktop), Option C (2GB RAM không đủ blue-green) |
| **Target VPS** | 123.30.48.215 (unchanged) |
| **Target image tag** | `hethong-iot:local` (compose dùng) + `hethong-iot:v2` (mới) |
| **Backup image tag** | `hethong-iot:v1-backup-YYYYMMDD` |
| **Schema change** | KHÔNG (V2 chỉ FE visual) |
| **Migration new** | KHÔNG (reuse 0001 + 0002a/b/c) |
| **Caddy touch** | KHÔNG |
| **Postgres touch** | CHỈ `pg_dump` (read-only) |
| **Redis touch** | KHÔNG |
| **Containers recreate** | `iot_app`, `iot_worker` (2/5) |
| **Downtime** | ~30s khi `docker compose up -d --force-recreate` |
| **Total timing** | 50-70 phút (realistic 60 phút) |
| **Rollback Level 1** | 15s (tag swap + recreate) |
| **Rollback Level 3** | 3-5 phút (restore pg_dump) |
| **Risk high priority** | 1 (OOM build), 2 (HDD IOPS slow) — đều có mitigation hoặc chấp nhận |
| **Cook agent blocks** | 15 bash blocks tuần tự (§9) |
| **Acceptance** | 5 màn render OK + auth flow + /api/me + cert valid + dashboard bug hết |

---

*— End of deploy strategy V2 · Claude Opus 4.7 · 2026-04-17*
*Input cho `/cook` khi user approve. Cook agent chạy tuần tự §9 15 blocks, dừng ngay khi có block fail.*
