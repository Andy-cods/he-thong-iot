# Deploy — he-thong-iot

Hướng dẫn deploy stack lên VPS `103.56.158.129` (share với Song Châu ERP).

## 0. Nguyên tắc bất di bất dịch

1. **KHÔNG** sửa Nginx, container, volume, hoặc file config của Song Châu.
2. **KHÔNG** bind lại port 80/443/3000/8000/5432/6379 trên host — Song Châu đang dùng.
3. Mọi tài nguyên IoT: prefix `iot_` (container, volume, network).
4. **Postgres + Redis TÁCH RIÊNG** trong stack IoT (không share với Song Châu). Trade-off: +600MB RAM nhưng độc lập bảo trì/upgrade.
5. Caddy bind `0.0.0.0:8443` — chưa có domain → access qua `http://<VPS_IP>:8443`. Khi có domain → đổi về `127.0.0.1:8443` + Cloudflare Tunnel.

## 1. Precheck VPS (read-only, không sửa gì)

```bash
# Kiểm Song Châu vẫn chạy ổn
docker ps
ss -tlnp | grep -E ':(80|443|3000|8000|5432|6379|8443)\b'
systemctl list-units --state=running | head -30
free -h && df -h
```

Yêu cầu trước khi deploy:
- **Port 8443 còn trống trên host** (`ss -tlnp | grep 8443` không trả kết quả).
- `docker compose version` ≥ 2.20.
- Đĩa còn ≥ 5GB (Postgres data + Redis + Caddy + logs + backup staging).
- RAM free ≥ 2GB sau khi Song Châu đã chạy (kiểm `free -h`, trừ buff/cache).

## 2. Deploy stack Docker

```bash
# Trên VPS (SSH vào root hoặc user có quyền docker)
sudo mkdir -p /opt/hethong-iot/{secrets,logs,backups}
cd /opt/hethong-iot

# Copy 3 file template + scripts
sudo cp <repo>/deploy/docker-compose.yml .
sudo cp <repo>/deploy/Caddyfile .
sudo cp <repo>/deploy/.env.example .env
sudo cp -r <repo>/deploy/scripts ./scripts
sudo chmod +x ./scripts/*.sh

# Sinh + điền secrets
openssl rand -base64 24 | sudo tee secrets/db_password.txt
openssl rand -hex 32 | sudo tee secrets/jwt_secret.txt
openssl rand -hex 32 | sudo tee secrets/session_secret.txt
echo "your-r2-access-key" | sudo tee secrets/r2_access_key.txt
echo "your-r2-secret-key" | sudo tee secrets/r2_secret_key.txt
sudo chmod 600 secrets/*.txt

# Điền .env (APP_URL, R2_*, TELEGRAM_*)
sudo nano .env

# Pull image (hoặc `docker load` từ tar)
sudo docker pull "$IOT_IMAGE"

# Up Postgres + Redis trước (chờ healthcheck pass)
sudo docker compose --env-file .env up -d postgres redis
sudo docker compose ps  # đợi cả 2 (healthy)

# Migrate schema (lần đầu)
sudo docker compose --env-file .env run --rm app pnpm db:push
sudo docker compose --env-file .env run --rm app pnpm db:seed

# Up toàn bộ
sudo docker compose --env-file .env up -d

# Verify
sudo docker compose ps
curl -fsS http://127.0.0.1:8443/api/health
curl -fsS http://127.0.0.1:8443/api/ready

# Từ máy ngoài (trong lúc chưa có domain)
curl -fsS http://103.56.158.129:8443/api/health
```

## 3. Cloudflare Tunnel (chỉ khi có domain)

```bash
# Cài cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cf.deb
sudo dpkg -i /tmp/cf.deb

# Login + tạo tunnel
cloudflared tunnel login
cloudflared tunnel create hethong-iot

# Config
sudo cp <repo>/deploy/cloudflared-config.yml.example /etc/cloudflared/config.yml
sudo nano /etc/cloudflared/config.yml   # điền tunnel-uuid + hostname

cloudflared tunnel route dns hethong-iot iot.your-domain.vn
sudo cloudflared service install
sudo systemctl enable --now cloudflared

# Đổi docker-compose.yml caddy ports về "127.0.0.1:8443:8443" để không expose trực tiếp IP
# rồi restart: sudo docker compose up -d caddy

# Test
curl -fsS https://iot.your-domain.vn/api/health
```

## 4. Cron jobs

```cron
# /etc/cron.d/hethong-iot
# Backup 3h sáng
0 3 * * * root /opt/hethong-iot/scripts/backup.sh >> /opt/hethong-iot/logs/backup.log 2>&1
# Health check mỗi 5 phút
*/5 * * * * root /opt/hethong-iot/scripts/health-check.sh >> /opt/hethong-iot/logs/health.log 2>&1
```

## 5. Rollback

```bash
cd /opt/hethong-iot
sudo docker compose down
sudo IOT_IMAGE=registry.local/hethong-iot:v0.0.9 docker compose --env-file .env up -d
```

## 6. Backup Postgres (standalone IoT instance)

Script `scripts/backup.sh` cần điều chỉnh: dump từ container `iot_postgres` thay vì `host.docker.internal`:
```bash
docker exec iot_postgres pg_dump -U hethong_app -Fc hethong_iot | gpg -c > backup.dump.gpg
```

## 7. Monitoring V1

- UptimeRobot free ping `http://103.56.158.129:8443/api/health` mỗi 5 phút.
- Telegram bot alert qua `scripts/health-check.sh`.
- `pg_stat_statements` trong Postgres container (thêm vào `shared_preload_libraries` nếu cần).

## 7.1 Monitoring V1.4 — Grafana Cloud Free + OpenTelemetry

Stack mới dùng OTLP push (không cần Prometheus scrape local). Free tier
Grafana Cloud cho 10k metrics + 50GB log/tháng — dư cho MES 1 xưởng.

**Setup step-by-step:**

1. **Đăng ký Grafana Cloud Free** → https://grafana.com/auth/sign-up
   - Chọn region gần nhất (EU Frankfurt hoặc SG nếu có).
   - Tạo stack tên `iot-mes-songchau`.

2. **Lấy OTLP credential**
   - Dashboard → Connections → OTLP (HTTP).
   - Copy:
     - `OTEL_EXPORTER_OTLP_ENDPOINT` (ví dụ `https://otlp-gateway-prod-eu-west-2.grafana.net/otlp`)
     - `Instance ID` (số)
     - Tạo API token loại "metrics:write + traces:write".
   - Compose base64: `echo -n "${InstanceID}:${ApiKey}" | base64 -w0` → đây là giá trị cho `GRAFANA_CLOUD_TOKEN`.

3. **Set ENV trên VPS**
   ```bash
   cd /opt/hethong-iot
   cat >> .env <<'EOF'
   OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-eu-west-2.grafana.net/otlp
   OTEL_SERVICE_NAME=iot-web
   EOF
   echo -n "${InstanceID}:${ApiKey}" | base64 -w0 | sudo tee secrets/grafana_cloud_token.txt
   sudo chmod 600 secrets/grafana_cloud_token.txt
   ```

4. **Restart app + worker**
   ```bash
   sudo docker compose --env-file .env up -d --force-recreate web worker
   sudo docker compose logs web | grep telemetry
   # Kỳ vọng: [telemetry] OTLP SDK started → https://otlp-gateway-...
   ```

5. **Import dashboard**
   - Grafana UI → Dashboards → New → Import.
   - Upload `deploy/grafana-dashboards/iot-web.json`.
   - Chọn Prometheus datasource `grafanacloud-prom` (auto-provision).
   - 7 panel: request rate, p95 latency, error rate, DB p95, login failures, queue depth, BOM explode p95.

6. **Cài alert rules**
   - Grafana UI → Alerting → Alert rules → Import.
   - Upload `deploy/grafana-alerts.yml` (3 rule: p95>1s 5m, error>5% 5m, queue>100 10m).
   - Contact point: tạo Telegram bot (reuse `TELEGRAM_BOT_TOKEN`) → route mọi severity tới cùng chat.

7. **Verify data flow**
   - Sau 1-2 phút → Explore → query `http_server_request_duration_seconds_count{service_name="iot-web"}` → thấy series.
   - Force 401: `curl -X POST http://127.0.0.1:8443/api/auth/login -d '{"username":"x","password":"x"}' -H 'content-type: application/json'` → panel "Login failures" tăng.

**Disable telemetry:** remove `OTEL_EXPORTER_OTLP_ENDPOINT` trong `.env` → SDK skip init (log warn), không crash app.

## 8. Cảnh báo bảo mật chưa có domain

Khi `APP_URL=http://103.56.158.129:8443`:
- Traffic **KHÔNG mã hoá** → không gửi password/token thật qua internet công khai.
- Chỉ dùng cho **LAN xưởng / SSH tunnel / staging**, không production pilot.
- Giải pháp rẻ: mua domain ~50k VND/năm (Namecheap, Porkbun, inet.vn) → trỏ DNS về VPS → Caddy tự cấp Let's Encrypt (cần `auto_https on` + port 80/443, hoặc vẫn giữ Cloudflare Tunnel).
