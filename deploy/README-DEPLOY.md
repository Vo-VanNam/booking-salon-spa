# Hướng dẫn triển khai production (VPS Ubuntu)

Hướng dẫn deploy stack production **Salon Glow** lên VPS Ubuntu 22.04 / 24.04 bằng
Docker Compose + Nginx reverse proxy + Let's Encrypt.

---

## 1. Kiến trúc tổng quan

```
Browser
   │ (https://domain — 80/443)
   ▼
[Nginx container]  ←── reverse proxy, TLS, gzip, security headers
   │  /api/*  →  backend:3001 (NestJS + Prisma)
   │  /*      →  frontend:3000 (Next.js standalone)
   ▼
[backend] ──► [postgres:16]  (volume pgdata)
   └───────► [redis:7]       (volume redisdata, AOF)
```

- Chỉ **nginx** mở port ra host (80/443). DB/Redis/backend/frontend **không**
  publish port — truy cập từ host qua `docker compose exec`.
- Một network duy nhất (đơn giản, đủ cho proxy). Nếu muốn cứng hơn, tách
  network `internal` riêng cho postgres/redis/backend.
- Backend chạy `npx prisma migrate deploy` **mỗi lần khởi động** (idempotent,
  an toàn — không bao giờ dùng `prisma db push` ở production).
- Frontend build dạng `output: 'standalone'`; mọi request `/api/*` được Nginx
  proxy thẳng sang backend nên rewrite dev trong `next.config.ts` không bao giờ
  kích hoạt ở production.

---

## 2. Chuẩn bị VPS

Yêu cầu tối thiểu: **2 CPU / 2 GB RAM / 20 GB SSD** (Ubuntu 22.04 hoặc 24.04).

### 2.1. Cài Docker + Compose plugin

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài Docker (script chính thức)
curl -fsSL https://get.docker.com | sh

# Compose plugin thường đi kèm; kiểm tra:
docker compose version        # phải ra "Docker Compose version v2.x"
```

### 2.2. Trỏ DNS

Tạo bản ghi **A record** trên DNS provider trỏ về IP public của VPS:

```
salon-glow.example.com   A    <IP_VPS>
```

(Thay `salon-glow.example.com` bằng domain thật của bạn ở mọi nơi bên dưới.)

### 2.3. Firewall — chỉ mở 22/80/443

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

---

## 3. Copy mã nguồn + cấu hình

```bash
cd /opt
sudo git clone <repo-url> booking-salon-spa
cd booking-salon-spa

# Tạo .env.production từ mẫu
cp .env.production.example .env.production
nano .env.production
```

### Bắt buộc sửa trong `.env.production`

| Biến | Việc cần làm |
|---|---|
| `POSTGRES_PASSWORD` | mật khẩu DB mạnh, khớp với password trong `DATABASE_URL` |
| `DATABASE_URL` | đổi password; host giữ nguyên `postgres` |
| `JWT_ACCESS_SECRET` | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | `openssl rand -hex 32` (khác access secret) |
| `CORS_ORIGIN` | `https://salon-glow.example.com` |
| `SEED_ADMIN_EMAIL` | email admin thật |
| `SEED_ADMIN_PASSWORD` | **ĐỔI NGAY** — mật khẩu admin mạnh |
| `PAYMENT_ENABLED` | `true` khi có key VNPay/MoMo thật (kèm `VNP_*`/`MOMO_*`) |
| `SMTP_*` / `SMS_*` | host/port/user/pass của SMTP, URL + key của SMS provider |

> Không commit file `.env.production` (đã có trong `.gitignore`).

---

## 4. Build + chạy stack

Lần đầu (hoặc sau mỗi lần sửa code), nạp biến môi trường vào shell rồi build:

```bash
cd /opt/booking-salon-spa
set -a && source .env.production && set +a

docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Kiểm tra trạng thái — tất cả phải "healthy"
docker compose -f docker-compose.prod.yml ps
```

**Ghi chú `--env-file`:** nếu không muốn `source`, dùng cờ `--env-file` cho mọi
lệnh compose (bắt buộc vì `POSTGRES_PASSWORD` được đọc qua substitution):

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

> Nếu nginx báo `cannot load certificate` ở bước này là bình thường khi chưa có
> cert — xem bước 5. Có thể sinh cert self-signed tạm để khởi động:
> ```bash
> mkdir -p deploy/certs/live/salon-glow.example.com
> openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
>   -keyout deploy/certs/live/salon-glow.example.com/privkey.pem \
>   -out deploy/certs/live/salon-glow.example.com/fullchain.pem \
>   -subj "/CN=salon-glow.example.com"
> docker compose -f docker-compose.prod.yml restart nginx
> ```

### Smoke test nhanh

```bash
curl -sk https://localhost/api/health
# → {"status":"ok","db":"up","redis":"up"}
curl -sk https://localhost/ | grep -i "đặt lịch"
```

---

## 5. Cấp chứng chỉ Let's Encrypt (certbot)

Stack dùng layout chuẩn Let's Encrypt:
`/etc/letsencrypt/live/<domain>/{fullchain,privkey}.pem` (volume
`./deploy/certs:/etc/letsencrypt`).

**Phương án khuyến nghị — certbot với webroot** (không sửa file nginx của
container, phù hợp nginx chạy trong Docker; `deploy/nginx-http.conf` đã phục vụ
`/.well-known/acme-challenge/` từ `./deploy/certbot-webroot`):

```bash
# Cài certbot trên host (không cần cài nginx trên host)
sudo apt install -y certbot

cd /opt/booking-salon-spa
sudo certbot certonly --webroot -w /opt/booking-salon-spa/deploy/certbot-webroot \
  --config-dir /opt/booking-salon-spa/deploy/certs \
  --work-dir /tmp/certbot-work --logs-dir /tmp/certbot-logs \
  -d salon-glow.example.com

# Nạp lại cấu hình nginx để đọc cert mới
docker compose --env-file .env.production -f docker-compose.prod.yml exec nginx nginx -s reload
```

> Lưu ý: mọi lệnh compose ở dưới cần `--env-file .env.production` (hoặc đã
> `source` biến trong shell) vì `POSTGRES_PASSWORD` được đọc qua substitution.
> Stack production dùng project name riêng `booking-salon-spa-prod` nên không
> xung đột container/volume với dev stack cùng thư mục.

> `--config-dir` trỏ thẳng vào `deploy/certs` để cert sinh ra nằm đúng chỗ nginx
> container đọc (mount `./deploy/certs:/etc/letsencrypt`).

**Gia hạn tự động** — thêm vào crontab root (`sudo crontab -e`):

```cron
17 3 * * * certbot renew --config-dir /opt/booking-salon-spa/deploy/certs --work-dir /tmp/certbot-work --logs-dir /tmp/certbot-logs --quiet --deploy-hook "docker compose -f /opt/booking-salon-spa/docker-compose.prod.yml exec nginx nginx -s reload"
```

> **Nếu chạy nginx native trên host** (không dùng container): cài
> `sudo apt install -y certbot python3-certbot-nginx` rồi
> `sudo certbot --nginx -d salon-glow.example.com` — certbot tự sửa cấu hình
> nginx và reload. Với stack Docker ở trên thì không dùng lệnh này vì certbot
> không chỉnh được config bên trong container (file mount read-only).

---

## 6. Seed dữ liệu lần đầu (thủ công, 1 lần)

Migrations chạy tự động khi backend khởi động (`prisma migrate deploy`). Dữ
liệu mẫu (3 chi nhánh, dịch vụ, stylist, tài khoản admin) **chỉ seed thủ công**:

```bash
# Bản seed đã được compile vào image (dist/prisma/seed.js) nên chạy thẳng
# bằng node — không cần tsx (devDependency không có trong image production).
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend node dist/prisma/seed.js
```

- Tạo 3 chi nhánh, 8 dịch vụ, stylist, booking mẫu và tài khoản admin
  (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` trong `.env.production`).
- Chạy lại là **idempotent** (upsert theo tên/email).

Kiểm tra:

```bash
curl -s https://salon-glow.example.com/api/branches
# → mảng 3 chi nhánh
```

---

## 7. Sao lưu (backup)

### 7.1. PostgreSQL — cron hàng tuần, giữ 7 bản

Tạo script `/opt/booking-salon-spa/deploy/backup.sh` (chmod +x):

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/backups
mkdir -p "$BACKUP_DIR"

cd /opt/booking-salon-spa
set -a && source .env.production && set +a

docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U salon -d salon_spa --format=custom \
  > "$BACKUP_DIR/salon_spa_$STAMP.dump"

# Giữ 7 bản mới nhất
ls -1t "$BACKUP_DIR"/salon_spa_*.dump | tail -n +8 | xargs -r rm -f

# Log Redis (AOF đã bật --appendonly yes nên dữ liệu bền vững; bản sao lưu thêm:
docker compose -f docker-compose.prod.yml exec -T redis redis-cli BGSAVE >/dev/null
```

Cron (root, `sudo crontab -e`):

```cron
0 3 * * 0 /opt/booking-salon-spa/deploy/backup.sh >> /var/log/backup-salon.log 2>&1
```

> Redis dùng **AOF** (`--appendonly yes`) nên tự bền vững qua restart; `BGSAVE`
> chỉ tạo thêm snapshot phòng khi volume hỏng.

### 7.2. Khôi phục

```bash
# Khôi phục PostgreSQL từ bản dump gần nhất
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U salon -d salon_spa --clean --if-exists \
  < /opt/backups/salon_spa_20260101_030000.dump

# Khôi phục Redis (nếu dùng snapshot .rdb): dừng redis, copy file vào
# volume redisdata (thư mục /data trong container), khởi động lại.
```

---

## 8. Logrotate cho log container

Tạo `/etc/logrotate.d/salon-glow`:

```
/var/log/nginx/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

> Log nginx nằm trong container; muốn logrotate host xử lý thì mount
> `./deploy/logs:/var/log/nginx` vào service nginx trong
> `docker-compose.prod.yml` và thêm volume này vào nginx. Log backend in ra
> stdout (JSON) — thu thập bằng `docker compose logs -f backend` hoặc tích hợp
> với Docker logging driver (json-file / gelf / loki...).

---

## 9. Cập nhật phiên bản mới (update deploy)

```bash
cd /opt/booking-salon-spa
git pull                          # kéo code mới
set -a && source .env.production && set +a
docker compose -f docker-compose.prod.yml build   # build lại image
docker compose -f docker-compose.prod.yml up -d   # recreate service thay đổi
docker compose -f docker-compose.prod.yml ps
```

- Migration mới trong `backend/prisma/migrations` **tự chạy** khi backend khởi
  động lại (không cần thao tác tay).
- Không bao giờ chạy `prisma db push` trên DB production.

---

## 10. Bảng biến môi trường (.env.production)

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `POSTGRES_PASSWORD` | ✅ | Mật khẩu DB (service postgres) |
| `DATABASE_URL` | ✅ | `postgresql://salon:<pass>@postgres:5432/salon_spa?schema=public` |
| `REDIS_URL` | ✅ | `redis://redis:6379` |
| `NODE_ENV` | ✅ | `production` |
| `PORT` | ✅ | `3001` |
| `CORS_ORIGIN` | ✅ | Origin frontend, VD `https://salon-glow.example.com` |
| `JWT_ACCESS_SECRET` | ✅ | ≥32 ký tự, `openssl rand -hex 32` |
| `JWT_ACCESS_TTL` | | 900 (giây) |
| `JWT_REFRESH_SECRET` | ✅ | ≥32 ký tự, khác access secret |
| `THROTTLE_TTL` | | 60000 (ms) |
| `THROTTLE_LIMIT` | | 100 (request/cửa sổ) |
| `SEED_ADMIN_EMAIL` | ✅ | Email super_admin khi seed |
| `SEED_ADMIN_PASSWORD` | ✅ | **Đổi ngay khi deploy** |
| `PAYMENT_ENABLED` | | `false` mặc định; `true` khi có key |
| `DEPOSIT_PERCENT` | | 30 (phần trăm tiền cọc) |
| `VNP_TMN_CODE`, `VNP_HASH_SECRET`, `VNP_URL`, `VNP_RETURN_URL`, `VNP_IPN_URL` | khi PAYMENT_ENABLED=true | Key VNPay |
| `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, `MOMO_API_URL`, `MOMO_REDIRECT_URL`, `MOMO_IPN_URL` | khi PAYMENT_ENABLED=true | Key MoMo |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | | SMTP nhắc lịch (trống → chỉ log) |
| `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER` | | SMS provider (trống → LogSmsProvider) |

---

## 11. Checklist bảo mật

- [ ] Đổi `SEED_ADMIN_PASSWORD` (và email admin) — không dùng giá trị mẫu.
- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` sinh bằng `openssl rand -hex 32`, khác nhau.
- [ ] `POSTGRES_PASSWORD` mạnh, khác mật khẩu mọi nơi khác.
- [ ] Firewall `ufw` chỉ mở 22/80/443; DB/Redis không publish port ra host.
- [ ] `PAYMENT_ENABLED=false` nếu chưa có key VNPay/MoMo thật.
- [ ] Rate limit: global 100 req/min đã bật; login 10/min; đặt lịch 20/min (backend tự cấu hình qua `THROTTLE_*`).
- [ ] HTTPS bắt buộc: port 80 redirect sang 443 (trừ `/.well-known`).
- [ ] `.env.production` không bao giờ commit; backup `pgdata` + `redisdata`.
- [ ] Cập nhật OS thường xuyên (`sudo apt update && sudo apt upgrade`).

---

## 12. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| `nginx` restart loop, log `cannot load certificate` | Chưa có cert tại `deploy/certs/live/<domain>/` — tạo self-signed tạm hoặc chạy certbot (mục 5) |
| `502 Bad Gateway` khi gọi `/api/health` | Backend chưa healthy — xem `docker compose logs backend` (thường do `DATABASE_URL`/`REDIS_URL` sai hoặc backend đang migrate) |
| Backend fail khi boot | Chạy `docker compose logs backend`; kiểm tra biến bắt buộc trong `.env.production` (Joi sẽ báo thiếu) |
| `prisma migrate deploy` lỗi | Không dùng `db push`; nếu migration lỗi giữa chừng, sửa thủ công qua `psql` rồi chạy lại migrate |
| `curl -sk https://localhost/...` không lên | DNS chưa trỏ / chưa mở 443 trên firewall / cert chưa đúng domain |
