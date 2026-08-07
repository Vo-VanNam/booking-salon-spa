#!/usr/bin/env node
// Smoke test toàn bộ luồng nghiệp vụ Booking Salon/Spa — chạy qua HTTP.
// Dùng cho stack production local (mặc định https://localhost, có -k tương đương
// qua NODE_TLS_REJECT_UNAUTHORIZED=0 do smoke.sh set). Chạy:
//   bash scripts/smoke.sh
// Yêu cầu: stack prod đang chạy (docker compose -f docker-compose.prod.yml up -d),
// .env.production có PAYMENT_ENABLED=true để test webhook VNPay tự ký.
import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'https://localhost').replace(/\/$/, '');
const VN_TZ = 'Asia/Ho_Chi_Minh';

// ---- env: đọc .env.production (nếu có) để lấy secret ký webhook + tài khoản admin ----
function loadEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return out;
}
const env = { ...loadEnvFile(join(ROOT, '.env.production')), ...process.env };
const VNP_HASH_SECRET = env.VNP_HASH_SECRET;
const ADMIN_EMAIL = env.SEED_ADMIN_EMAIL;
const ADMIN_PASSWORD = env.SEED_ADMIN_PASSWORD;
for (const [name, value] of [['SEED_ADMIN_EMAIL', ADMIN_EMAIL], ['SEED_ADMIN_PASSWORD', ADMIN_PASSWORD], ['VNP_HASH_SECRET', VNP_HASH_SECRET]]) {
  if (!value) {
    console.error(`Smoke test that bai: thieu bien ${name} trong .env.production (hoac env).`);
    process.exit(1);
  }
}

// ---- helpers ----
let failures = 0;
let stepNo = 0;
function step(name, ok, extra = '') {
  stepNo++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${String(stepNo).padStart(2, '0')}] ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}
function check(cond, name, extra) { step(name, !!cond, extra); }

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

function vnDate(offsetDays = 0) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}-${parts.find((p) => p.type === 'day').value}`;
}
function vnNowMinutes() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: VN_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const mi = Number(parts.find((p) => p.type === 'minute').value);
  return h * 60 + mi;
}
function slotToIso(date, slot) {
  const [h, m] = slot.split(':').map(Number);
  const d = new Date(`${date}T00:00:00+07:00`);
  d.setUTCHours(d.getUTCHours() + h, m, 0, 0);
  return d.toISOString();
}
function uniquePhone() {
  return `09${String(Date.now()).slice(-8)}`;
}
function vnpaySign(params) {
  const query = Object.keys(params)
    .filter((k) => k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType')
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join('&');
  return createHmac('sha512', VNP_HASH_SECRET).update(query).digest('hex');
}

const PASSWORD = 'SmokeTest@2026';

async function main() {
  console.log(`Smoke test booking salon/spa — ${BASE_URL}\n`);

  // 1. Health
  const health = await api('GET', '/api/health');
  check(health.status === 200 && health.json?.status === 'ok' && health.json?.db === 'up' && health.json?.redis === 'up',
    'GET /api/health → ok + db/redis up', JSON.stringify(health.json ?? health.text));

  // 2. Chi nhánh
  const branches = await api('GET', '/api/branches');
  check(branches.status === 200 && Array.isArray(branches.json) && branches.json.length >= 3,
    'GET /api/branches → >= 3 chi nhánh', `${branches.json?.length ?? 0} branches`);
  const branch = branches.json?.[0];

  // 3. Dịch vụ
  const services = await api('GET', `/api/branches/${branch.id}/services`);
  const service = (services.json ?? []).find((s) => s.durationMinutes >= 30) ?? services.json?.[0];
  check(services.status === 200 && services.json?.length >= 1,
    'GET /api/branches/:id/services → có dịch vụ', service ? `${service.name} (${service.price}đ/${service.durationMinutes}p)` : 'none');

  // 4. Stylist
  const stylists = await api('GET', `/api/branches/${branch.id}/stylists`);
  const stylist = stylists.json?.[0];
  check(stylists.status === 200 && stylists.json?.length >= 1, 'GET /api/branches/:id/stylists → có stylist', stylist?.name);

  // 5. Slot trống ngày kia (đảm bảo >= 24h so với mọi thời điểm chạy → test hủy được)
  const bookDate = vnDate(2);
  const slots = await api('GET', `/api/stylists/${stylist.id}/slots?branchId=${branch.id}&date=${bookDate}&durationMinutes=${service.durationMinutes}`);
  const slot = slots.json?.slots?.[0];
  check(slots.status === 200 && Array.isArray(slots.json?.slots) && slots.json.slots.length >= 1,
    'GET /api/stylists/:id/slots (ngày kia) → có slot', `${slots.json?.slots?.length ?? 0} slots, chọn ${slot} (${bookDate})`);

  // 6. Đặt lịch (khách mới)
  const c1Phone = uniquePhone();
  const reg1 = await api('POST', '/api/auth/register', { body: { name: 'Khách Smoke 1', phone: c1Phone, password: PASSWORD } });
  const t1 = reg1.json?.accessToken;
  check(reg1.status === 201 && !!t1, 'POST /api/auth/register (khách 1) → token', c1Phone);
  const startTime = slotToIso(bookDate, slot);
  const booking = await api('POST', '/api/bookings', {
    token: t1,
    body: { branchId: branch.id, serviceId: service.id, stylistId: stylist.id, startTime },
  });
  const bookingId = booking.json?.id;
  check(booking.status === 201 && !!bookingId && !!booking.json?.endTime,
    'POST /api/bookings → 201 (endTime do server tính)', `id=${bookingId} ${booking.json?.startTime} → ${booking.json?.endTime}`);

  // 7. Trùng slot → 409 tiếng Việt
  const reg2 = await api('POST', '/api/auth/register', { body: { name: 'Khách Smoke 2', phone: uniquePhone(), password: PASSWORD } });
  const dup = await api('POST', '/api/bookings', {
    token: reg2.json?.accessToken,
    body: { branchId: branch.id, serviceId: service.id, stylistId: stylist.id, startTime },
  });
  check(dup.status === 409 && String(dup.json?.message ?? '').includes('Khung giờ này đã có lịch hẹn khác'),
    'POST /api/bookings trùng slot → 409 message VN', dup.json?.message);

  // 8. Doanh thu admin
  const adminLogin = await api('POST', '/api/auth/login', { body: { phoneOrEmail: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  check(adminLogin.status === 200 && !!adminLogin.json?.accessToken, 'POST /api/auth/login super_admin → token', ADMIN_EMAIL);
  const from = vnDate(-7);
  const to = vnDate(7);
  const revenue = await api('GET', `/api/admin/revenue?branchId=${branch.id}&from=${from}&to=${to}&groupBy=day`, { token: adminLogin.json?.accessToken });
  const rows = revenue.json?.rows ?? [];
  const sane = Array.isArray(rows) && rows.length >= 1 && rows.every((r) =>
    r.depositCollected >= 0 && r.counterPaid >= 0 && r.bookingCount >= 0 && r.cancelledCount >= 0);
  check(revenue.status === 200 && sane, 'GET /api/admin/revenue → số liệu không âm', `${rows.length} ngày`);

  // 9. Đặt cọc VNPay + webhook IPN (tự ký) + idempotent
  const deposit = await api('POST', `/api/bookings/${bookingId}/deposit`, { token: t1, body: { provider: 'vnpay' } });
  const paymentUrl = deposit.json?.paymentUrl ?? '';
  const txnRef = (paymentUrl.match(/vnp_TxnRef=([^&]+)/) ?? [])[1] ?? '';
  const amount = Math.round(service.price * (Number(env.DEPOSIT_PERCENT ?? 30) / 100));
  check(deposit.status === 201 && !!paymentUrl && !!txnRef,
    'POST /api/bookings/:id/deposit → paymentUrl + txnRef', `amount=${amount}đ txnRef=${txnRef?.slice(0, 20)}…`);

  const ipnParams = {
    vnp_Amount: String(amount * 100),
    vnp_BankCode: 'NCB',
    vnp_CardType: 'ATM',
    vnp_Command: 'pay',
    vnp_CreateDate: '20260807120000',
    vnp_CurrCode: 'VND',
    vnp_IpAddr: '127.0.0.1',
    vnp_Locale: 'vn',
    vnp_OrderInfo: `Thanh toan coc lich hen ${bookingId}`,
    vnp_OrderType: 'other',
    vnp_PayDate: '20260807120000',
    vnp_ResponseCode: '00',
    vnp_ReturnUrl: 'https://your-domain.example.com/api/payments/vnpay/return',
    vnp_TmnCode: env.VNP_TMN_CODE,
    vnp_TransactionNo: '99999999',
    vnp_TransactionStatus: '00',
    vnp_TxnRef: txnRef,
    vnp_Version: '2.1.0',
  };
  const ipnQuery = Object.entries(ipnParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .sort()
    .join('&');
  const ipn = await api('GET', `/api/payments/vnpay/ipn?${ipnQuery}&vnp_SecureHash=${vnpaySign(ipnParams)}`);
  check(ipn.status === 200 && ipn.json?.RspCode === '00', 'Webhook VNPay IPN (chữ ký đúng) → RspCode 00', ipn.json?.Message);

  const cal = await api('GET', `/api/admin/calendar?branchId=${branch.id}&from=${from}&to=${to}`, { token: adminLogin.json?.accessToken });  const calBooking = (cal.json?.bookings ?? []).find((b) => b.id === bookingId);
  check(calBooking?.depositStatus === 'paid', 'Booking.depositStatus = paid (sau IPN)', calBooking?.depositStatus);

  const ipn2 = await api('GET', `/api/payments/vnpay/ipn?${ipnQuery}&vnp_SecureHash=${vnpaySign(ipnParams)}`);
  check(ipn2.status === 200 && ipn2.json?.RspCode === '04', 'Gửi lại IPN lần 2 → RspCode 04 (idempotent)', ipn2.json?.RspCode);

  const badParams = { ...ipnParams, vnp_Amount: String(amount * 100 + 10000) };
  const ipnBad = await api('GET', `/api/payments/vnpay/ipn?${Object.entries(badParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).sort().join('&')}&vnp_SecureHash=${vnpaySign(badParams)}`);
  check(ipnBad.status === 200 && ipnBad.json?.RspCode === '02', 'IPN sai số tiền → RspCode 02', ipnBad.json?.RspCode);

  // 10a. Hủy lịch >= 24h → 200
  const cancel = await api('PATCH', `/api/bookings/${bookingId}/cancel`, { token: t1, body: { reason: 'Smoke test' } });
  check(cancel.status === 200 && cancel.json?.status === 'cancelled', 'PATCH cancel (>= 24h) → 200 cancelled', cancel.json?.status);

  // 10b. Hủy lịch < 24h → 409
  const today = vnDate(0);
  const nowMin = vnNowMinutes();
  const todaySlots = await api('GET', `/api/stylists/${stylist.id}/slots?branchId=${branch.id}&date=${today}&durationMinutes=${service.durationMinutes}`);
  const soonSlot = (todaySlots.json?.slots ?? []).find((s) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m >= nowMin + 90;
  });
  if (soonSlot) {
    const reg3 = await api('POST', '/api/auth/register', { body: { name: 'Khách Smoke 3', phone: uniquePhone(), password: PASSWORD } });
    const soonBooking = await api('POST', '/api/bookings', {
      token: reg3.json?.accessToken,
      body: { branchId: branch.id, serviceId: service.id, stylistId: stylist.id, startTime: slotToIso(today, soonSlot) },
    });
    const cancelSoon = await api('PATCH', `/api/bookings/${soonBooking.json?.id}/cancel`, { token: reg3.json?.accessToken, body: { reason: 'test' } });
    check(cancelSoon.status === 409 && String(cancelSoon.json?.message ?? '').includes('Không thể hủy lịch hẹn trong vòng 24 giờ'),
      'PATCH cancel (< 24h) → 409 message VN', cancelSoon.json?.message);
  } else {
    console.log(`SKIP [10b] không có slot hôm nay >= ${nowMin + 90} phút tới (${today}) — bỏ qua test <24h`);
  }

  console.log(`\n${failures === 0 ? '✔ TẤT CẢ SMOKE TEST PASS' : `✘ ${failures} BƯỚC THẤT BẠI`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Smoke test crash:', e);
  process.exit(1);
});
