# Plan fix 3 P0 bugs — trước sprint UI/UX redesign Direction B

- **Ngày audit:** 2026-04-17
- **Auditor:** Claude Opus 4.7 (1M context)
- **Scope:** audit-only, KHÔNG sửa code. File này là blueprint để sprint tới thi công.
- **Repo:** `c:\dev\he-thong-iot`, target VPS `root@123.30.48.215`.

---

## Bug 1 — `apps/web/src/lib/env.ts` regex inject password sai

### 1.1 Code hiện tại (exact)

File: `apps/web/src/lib/env.ts` (lines 38–46)

```ts
DATABASE_URL: (() => {
  const raw = must("DATABASE_URL");
  // Thay `hethong_app@` bằng `hethong_app:<password>@` nếu DB_PASSWORD_FILE set
  const dbPwd = readSecret("DB_PASSWORD", false);
  if (dbPwd && !raw.includes(":")) {
    return raw.replace(/\/\/([^@]+)@/, `//$1:${encodeURIComponent(dbPwd)}@`);
  }
  return raw;
})(),
```

Và trong `deploy/docker-compose.yml` line 84 DSN gốc là:
```
DATABASE_URL: postgres://hethong_app@iot_postgres:5432/hethong_iot
```

Worker **không dùng** `env.ts` (đã grep `apps/worker` — không có `readSecret`/`DB_PASSWORD`), `apps/worker/src/db.ts` đọc thẳng `process.env.DATABASE_URL`. **Fix Bug 1 chỉ cần sửa web**; worker sẽ cần patch riêng nếu muốn dùng secret file (ghi nhận là follow-up).

### 1.2 Root cause

Có 3 lỗi logic xếp chồng:

1. **Guard `!raw.includes(":")` sai bản chất** — DSN gốc `postgres://hethong_app@iot_postgres:5432/...` **đã chứa `:`** (port `:5432` và scheme `postgres:`). Điều kiện này **luôn false** ⇒ regex không bao giờ chạy ⇒ password không bao giờ được inject. Đây là lý do workaround hard-code `DATABASE_URL` đầy đủ vào `.env` VPS mới chạy được.
2. **Regex `/\/\/([^@]+)@/` fragile khi username có ký tự đặc biệt** — nếu ai đó đặt user `ad@min` (có `@`) regex sẽ bắt sai nhóm. Với DSN chuẩn Postgres, username không nên có `@`, nhưng logic `new URL()` vẫn an toàn hơn.
3. **`encodeURIComponent` chỉ encode mỗi password**, không validate toàn bộ URL result. Nếu password chứa `\n` trailing (file không `.trim()` đúng với CRLF trên Windows) — `encodeURIComponent` encode `%0A` nhưng DSN vẫn hợp lệ cú pháp mà connect Postgres fail silent.

**Test edge cases password phải cover:** `p@ss!`, `p:w/d$`, `p ass` (space), `p#ss`, `P@ssw0rd!Strong`.

### 1.3 Fix đề xuất (exact code)

Thay toàn bộ block DATABASE_URL bằng helper `buildDsn` dùng `URL` class:

```ts
/**
 * Ghép password vào DSN một cách an toàn.
 * - Nếu DSN gốc đã có `user:pwd@` → giữ nguyên (dev local).
 * - Nếu DSN gốc chỉ có `user@` và có DB_PASSWORD → inject bằng URL.password
 *   (tự động URL-encode mọi ký tự đặc biệt, kể cả `:` `/` `@` `!` `$` space).
 */
function buildDsn(raw: string, password: string | undefined): string {
  if (!password) return raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch (err) {
    throw new Error(`DATABASE_URL không phải URL hợp lệ: ${(err as Error).message}`);
  }
  // Nếu đã có password trong DSN (dev), không ghi đè.
  if (u.password) return raw;
  u.password = password; // URL setter tự encode
  return u.toString();
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  APP_URL: process.env.APP_URL ?? "http://localhost:3001",
  DATABASE_URL: buildDsn(must("DATABASE_URL"), readSecret("DB_PASSWORD", false)),
  // ... phần còn lại giữ nguyên
};
```

### 1.4 Unit test (Vitest — file mới `apps/web/src/lib/env.test.ts`)

```ts
import { describe, it, expect } from "vitest";

// Lưu ý: export buildDsn khỏi env.ts (thêm `export` trước function).
import { buildDsn } from "./env";

describe("buildDsn — password có ký tự đặc biệt", () => {
  const base = "postgres://hethong_app@iot_postgres:5432/hethong_iot";

  it.each([
    ["p@ss!",             "p%40ss!"],
    ["p:w/d$",            "p%3Aw%2Fd$"],
    ["p ass",             "p%20ass"],
    ["p#ss",              "p%23ss"],
    ["P@ssw0rd!Strong",   "P%40ssw0rd!Strong"],
  ])("encode password %s đúng → %s", (pwd, encoded) => {
    const dsn = buildDsn(base, pwd);
    expect(dsn).toBe(`postgres://hethong_app:${encoded}@iot_postgres:5432/hethong_iot`);
    // parse lại phải ra password gốc
    expect(decodeURIComponent(new URL(dsn).password)).toBe(pwd);
  });

  it("không ghi đè nếu DSN đã có password", () => {
    const dsn = buildDsn("postgres://u:existing@h:5432/d", "newpwd");
    expect(dsn).toBe("postgres://u:existing@h:5432/d");
  });

  it("return raw nếu không có password", () => {
    expect(buildDsn(base, undefined)).toBe(base);
  });

  it("throw nếu DSN không hợp lệ", () => {
    expect(() => buildDsn("not-a-url", "x")).toThrow(/không phải URL hợp lệ/);
  });
});
```

### 1.5 Apply trên VPS (step-by-step)

```bash
# Local (Windows, thư mục repo)
cd c:/dev/he-thong-iot
pnpm --filter @iot/web test env.test      # phải PASS 5 case
pnpm --filter @iot/web build              # standalone build OK

# Build image mới
docker build -t registry.local/hethong-iot:latest .

# Load image lên VPS (save/load, vì chưa có registry private)
docker save registry.local/hethong-iot:latest | gzip > /tmp/iot.tar.gz
scp -i ~/.ssh/iot_vps /tmp/iot.tar.gz root@123.30.48.215:/tmp/

# Trên VPS
ssh -i ~/.ssh/iot_vps root@123.30.48.215
gunzip -c /tmp/iot.tar.gz | docker load

cd /opt/he-thong-iot/deploy
# Bỏ hard-code DATABASE_URL trong .env (để compose dùng DSN + DB_PASSWORD_FILE)
sed -i 's|^DATABASE_URL=.*|# DATABASE_URL handled by env.ts + DB_PASSWORD_FILE|' .env
docker compose up -d app
docker compose logs -f app --tail=50        # kỳ vọng: không có ECONNREFUSED / password authentication failed

# Verify login flow thực tế
curl -i -c /tmp/cookie.txt -X POST https://mes.songchau.vn/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"ChangeMe!234"}'
curl -b /tmp/cookie.txt https://mes.songchau.vn/api/items | head
```

**Rollback:** nếu login fail, `git revert <sha>` + restore dòng `DATABASE_URL=postgres://hethong_app:<pwd>@iot_postgres:5432/hethong_iot` trong `.env` cũ.

---

## Bug 2 — Migration `0002_week2_item_master.sql` chưa apply

### 2.1 File hiện tại

`packages/db/migrations/0002_week2_item_master.sql` (131 dòng) — đã đọc toàn bộ. Chứa:

- Dòng 9–10: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` + `unaccent;`
- Dòng 13–14: `ALTER TYPE app.item_type ADD VALUE ...` (KHÔNG chạy được trong transaction block — comment NOTE 1 đã cảnh báo)
- Dòng 68–69: index `item_name_unaccent_trgm_idx USING GIN (unaccent(name) gin_trgm_ops)` — **đây là chìa khóa cho search không dấu**

### 2.2 Root cause

1. **Script `deploy/scripts/migrate.sh` dùng `drizzle-kit push`** — nó diff schema Drizzle ORM vs DB, **không đọc file `.sql` trong `migrations/`**. Nghĩa là file 0002 chưa từng được chạy. Đó là lý do search `banh rang` không match `bánh răng`: index `item_name_unaccent_trgm_idx` chưa tồn tại.
2. **`CREATE EXTENSION pg_trgm/unaccent`** cần quyền superuser. User `hethong_app` trong compose **KHÔNG phải superuser**. Postgres image `postgres:16-alpine` khởi tạo DB với user `hethong_app` là OWNER của DB `hethong_iot` — owner có quyền `CREATE` schema nhưng **không có** quyền tạo extension shared objects. Phải chạy `CREATE EXTENSION` bằng user `postgres` (superuser mặc định trong container).
3. **`ALTER TYPE ... ADD VALUE`** của Postgres 12+ đã chạy được trong transaction (NOTE 1 của file là defensive comment từ Postgres 11 era) — Postgres 16 OK, không phải issue.

### 2.3 Fix đề xuất — flow apply 3 bước

**Tách migration thành 2 phần:**
- Phần A (superuser): 2 dòng `CREATE EXTENSION`.
- Phần B (owner): phần còn lại — chạy bằng user `hethong_app`.

Tạo 2 file (NEW) trong `packages/db/migrations/`:

**`0002a_extensions_superuser.sql`**
```sql
-- Chạy bằng user `postgres` (superuser) — chỉ 1 lần per DB.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
```

**`0002b_week2_item_master.sql`** — copy nguyên 0002 hiện tại, XÓA 2 dòng `CREATE EXTENSION` (dòng 9–10).

### 2.4 Unit test (smoke SQL)

File: `packages/db/migrations/0002_verify.sql` (chạy sau apply để verify):

```sql
-- Verify extension
SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm','unaccent');
-- Expect: 2 rows

-- Verify index
SELECT indexname FROM pg_indexes
WHERE schemaname = 'app' AND indexname IN (
  'item_name_unaccent_trgm_idx','item_sku_trgm_idx','item_category_trgm_idx'
);
-- Expect: 3 rows

-- Smoke search không dấu
INSERT INTO app.item (sku, name, item_type, uom_base)
VALUES ('TEST-BR-01', 'Bánh răng thử', 'PART', 'pcs')
ON CONFLICT DO NOTHING;

SELECT sku, name FROM app.item
WHERE unaccent(name) ILIKE '%' || unaccent('banh rang') || '%';
-- Expect: 1+ row chứa 'Bánh răng thử'

DELETE FROM app.item WHERE sku = 'TEST-BR-01';
```

### 2.5 Apply trên VPS (step-by-step)

```bash
# SSH vào VPS
ssh -i ~/.ssh/iot_vps root@123.30.48.215

# Backup DB trước (BẮT BUỘC)
cd /opt/he-thong-iot/deploy
bash scripts/backup.sh    # kiểm tra backup file tại ./backups/

# Copy migrations vào container
docker cp /opt/he-thong-iot/packages/db/migrations/0002a_extensions_superuser.sql \
  iot_postgres:/tmp/0002a.sql
docker cp /opt/he-thong-iot/packages/db/migrations/0002b_week2_item_master.sql \
  iot_postgres:/tmp/0002b.sql
docker cp /opt/he-thong-iot/packages/db/migrations/0002_verify.sql \
  iot_postgres:/tmp/0002_verify.sql

# Step 1: superuser tạo extension (user `postgres` mặc định image postgres:16-alpine)
docker exec -i iot_postgres psql -U postgres -d hethong_iot -f /tmp/0002a.sql

# Step 2: owner chạy phần còn lại
docker exec -i iot_postgres psql -U hethong_app -d hethong_iot \
  -v ON_ERROR_STOP=1 -f /tmp/0002b.sql

# Step 3: verify
docker exec -i iot_postgres psql -U hethong_app -d hethong_iot -f /tmp/0002_verify.sql

# Restart app để clear query cache (nếu có)
docker compose restart app worker
```

**Rollback:** `docker exec iot_postgres pg_restore -U postgres -d hethong_iot --clean /backups/<timestamp>.dump`. Indexes và enums mới không có migration down tự động — nếu rollback chỉ phần B, drop từng index/type bằng SQL tay (chi phí thấp vì data chưa dùng).

---

## Bug 3 — Worker container disabled, `@iot/shared` không resolve

### 3.1 Code hiện tại

`Dockerfile` stage `runtime` (lines 36–65):

```dockerfile
FROM node:20-bookworm-slim AS runtime
# ...
COPY --from=builder /repo/apps/worker/src ./apps/worker/src
COPY --from=builder /repo/apps/worker/tsconfig.json ./apps/worker/tsconfig.json
COPY --from=builder /repo/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/pnpm-workspace.yaml /repo/package.json ./
```

`deploy/docker-compose.yml` lines 113–145 — worker service command:
```yaml
command: ["./node_modules/.bin/tsx", "apps/worker/src/index.ts"]
```

Import trong worker: `apps/worker/src/index.ts` line 4:
```ts
import { QUEUE_NAMES } from "@iot/shared";
```

### 3.2 Root cause

pnpm workspace link `@iot/shared` bằng **symlink** `apps/worker/node_modules/@iot/shared` → `../../../packages/shared`. Khi Docker `COPY --from=builder /repo/node_modules ./node_modules` **chỉ copy root `node_modules`** — không copy `apps/worker/node_modules/` nơi chứa symlink workspace. Kết quả runtime không tìm thấy `@iot/shared`.

Thêm nữa: `@iot/shared/package.json` có `"main": "./src/index.ts"` (TypeScript source), mà runtime chạy `tsx` từ root `./node_modules/.bin/tsx` — `tsx` có thể resolve `.ts` nhưng chỉ khi Node resolution trả về đúng đường dẫn. Symlink thiếu ⇒ `MODULE_NOT_FOUND`.

### 3.3 Hai option

#### Option A — `pnpm deploy --filter=@iot/worker`

**Ưu:** official pnpm way, giữ nguyên tsx runtime, flatten tất cả dependencies (bao gồm `@iot/shared`, `@iot/db` inline) vào một node_modules phẳng.

**Nhược:** `pnpm deploy` yêu cầu có `lockfile` (có — `pnpm-lock.yaml` ở root). Cần stage build riêng. Image size tăng ~30MB.

#### Option B — Bundle bằng `tsup` thành single-file

**Ưu:** image runtime siêu nhỏ (~5MB worker + node_modules runtime deps như `bullmq`, `ioredis`, `postgres`), bypass workspace hoàn toàn, no tsx dependency tại runtime.

**Nhược:** thêm build step `tsup`, config noExternal cho `@iot/shared` + `@iot/db`, phải bundle native deps cẩn thận (`argon2` native addon sẽ không bundle được — nhưng worker không dùng argon2, OK). `drizzle-orm` có thể conflict với ESM bundle (cần test).

#### Khuyến nghị: **Option A**

Lý do:
- Worker còn nhẹ, ít code — overhead pnpm deploy không đáng kể.
- Giữ `tsx` runtime = debug easier khi có lỗi production (stack trace về `.ts`).
- Ít risk hơn cho sprint redesign sắp tới — không muốn rủi ro bundler build bug cùng lúc với UI migration.
- Option B giữ lại cho V2 khi tối ưu Docker image.

### 3.4 Fix exact — Dockerfile patch cho Option A

Thêm stage mới `worker-deploy` giữa `builder` và `runtime`, và sửa COPY trong runtime:

```dockerfile
# ---------- Stage 2b: pnpm deploy worker ----------
FROM builder AS worker-deploy
WORKDIR /repo
# pnpm deploy flatten toàn bộ workspace deps vào ./out
# --legacy cần thiết vì pnpm 9 vẫn chưa fully support deploy mới
RUN pnpm deploy --filter=@iot/worker --prod --legacy /worker-out

# ---------- Stage 3: runtime ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PORT=3001 \
    HOSTNAME=0.0.0.0
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate \
 && apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Next.js standalone output (web)
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

# Worker — deploy flattened (có tsx trong devDeps nên cần --prod=false HOẶC install tsx globally)
# Đổi từ --prod sang giữ devDeps (tsx runtime) — size không tăng nhiều vì tsx nhỏ.
COPY --from=worker-deploy /worker-out ./apps/worker-deploy

# Meta cho pnpm seed/migrate
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/pnpm-workspace.yaml /repo/package.json ./

EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","apps/web/server.js"]
```

**Lưu ý quan trọng:** `pnpm deploy --prod` sẽ bỏ devDeps = bỏ `tsx`. Có 2 cách fix:

- **Cách 1 (khuyến nghị):** bỏ flag `--prod`, thêm `tsx` vào `dependencies` của `apps/worker/package.json` (move từ devDependencies). Tsx ~2MB, production runtime cần nó thật.
- **Cách 2:** install `tsx` global trong runtime stage: `RUN npm i -g tsx@4.19.0`.

Đổi `apps/worker/package.json`:
```json
{
  "dependencies": {
    "@iot/db": "workspace:*",
    "@iot/shared": "workspace:*",
    "bullmq": "^5.12.0",
    "drizzle-orm": "^0.33.0",
    "exceljs": "^4.4.0",
    "ioredis": "^5.4.1",
    "pino": "^9.3.2",
    "postgres": "^3.4.4",
    "tsx": "^4.19.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.7",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

Sửa `docker-compose.yml` line 117–118 cho worker:

```yaml
working_dir: /app/apps/worker-deploy
command: ["./node_modules/.bin/tsx", "src/index.ts"]
```

### 3.5 Smoke test

```bash
# Local (Windows)
cd c:/dev/he-thong-iot
docker build -t registry.local/hethong-iot:latest .

# Test worker standalone (dry run)
docker run --rm --entrypoint sh registry.local/hethong-iot:latest \
  -c "cd /app/apps/worker-deploy && ls node_modules/@iot/shared && ls node_modules/@iot/db"
# Expect: thấy cả 2 directory với file .ts

docker run --rm --entrypoint sh registry.local/hethong-iot:latest \
  -c "cd /app/apps/worker-deploy && ./node_modules/.bin/tsx -e \"import('./src/index.js').catch(e=>{console.error(e);process.exit(1)})\""
# Expect: fail vì Redis không có, NHƯNG không phải MODULE_NOT_FOUND
```

### 3.6 Apply trên VPS

```bash
# Local build + export
cd c:/dev/he-thong-iot
docker build -t registry.local/hethong-iot:latest .
docker save registry.local/hethong-iot:latest | gzip > /tmp/iot.tar.gz
scp -i ~/.ssh/iot_vps /tmp/iot.tar.gz root@123.30.48.215:/tmp/

# VPS
ssh -i ~/.ssh/iot_vps root@123.30.48.215
gunzip -c /tmp/iot.tar.gz | docker load
cd /opt/he-thong-iot/deploy
# Update docker-compose.yml (working_dir + command worker)
docker compose up -d worker
docker compose logs -f worker --tail=100
# Expect log: "iot-worker started" + "redis ready" + "worker ready"
```

**Rollback:** comment out `worker` service trong compose, `docker compose up -d app` để giữ web live.

---

## Thứ tự fix tối ưu + ước tính thời gian

| # | Bug | Lý do ưu tiên | Ước tính | Blocker cho sprint UI? |
|---|-----|---------------|----------|------------------------|
| 1 | **Bug 2 — Migration 0002** | Độc lập, không cần rebuild image, fix sớm = tận dụng ngay trong UI search bar Direction B | 30–45 phút (backup 10' + apply 10' + verify 10' + buffer 15') | Có — search items page dùng `unaccent` |
| 2 | **Bug 1 — env.ts regex** | Cần rebuild + redeploy, nhưng fix code nhỏ gọn, có test | 1.5–2 giờ (code 20' + test 30' + build 15' + deploy 20' + verify 15') | Không blocker trực tiếp nhưng để workaround trong `.env` là tech-debt xấu |
| 3 | **Bug 3 — Worker container** | Phải đổi Dockerfile + compose + worker package.json, nhiều moving parts | 3–4 giờ (refactor 1h + build 30' x 2-3 iter + deploy 30' + smoke 30') | Không blocker UI nhưng import Excel (job queue) sẽ fail nếu scope Week 4 cần | 

**Tổng:** ~5–7 giờ, có thể làm trong 1 ngày. Khuyến nghị làm Bug 2 trước (quick win), sau đó Bug 1 (test đầy đủ trước rebuild), Bug 3 cuối (risk cao nhất, cần buffer).

**Nguyên tắc xuyên suốt:** theo CLAUDE.md điều 3 — build local trước, không dùng VPS làm môi trường thử lỗi. Mỗi vòng build trên 2 vCPU ~13 phút, đắt.
