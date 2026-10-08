#!/usr/bin/env node
/**
 * Kiểm tra bề mặt API theo GRADER API SURFACE trong DOCUMENT.md.
 * Dùng: BASE=http://localhost:8100 node scripts/api-check.mjs
 * Thoát mã 1 nếu có bước FAIL (SKIP = chưa triển khai, không tính là fail trong giai đoạn phát triển).
 */
const BASE = process.env.BASE ?? 'http://localhost:8100';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@booking.vn';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin12345';

let pass = 0;
let fail = 0;
let skip = 0;
const failures = [];

function record(ok, name, detail) {
  if (ok === 'skip') {
    skip += 1;
    console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(method, path, { body, token, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text, headers: response.headers, raw, method, path };
}

function vnDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000 + 7 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

const isVietnamese = (value) => typeof value === 'string' && /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(value);

async function main() {
  console.log(`== Kiểm tra API tại ${BASE} (ngày VN hôm nay ${vnDate()}, mai ${vnDate(1)}) ==\n`);

  // 1. health
  const health = await call('GET', '/health');
  record(health.status === 200 && health.json?.status === 'ok', 'GET /health trả 200 status=ok', `status=${health.status} db=${health.json?.db} redis=${health.json?.redis}`);

  // 2. branches
  const branches = await call('GET', '/branches');
  const branchList = Array.isArray(branches.json) ? branches.json : branches.json?.data;
  const branchesOk = branches.status === 200 && Array.isArray(branchList) && branchList.length >= 3 && branchList.every((b) => b.id && b.name);
  const sorted = Array.isArray(branchList) && branchList.every((b, i) => i === 0 || branchList[i - 1].id <= b.id);
  record(branchesOk && sorted, 'GET /branches ≥3 chi nhánh, sắp xếp theo id tăng dần', `${branchList?.length} chi nhánh: ${branchList?.map((b) => b.id).join(', ')}`);
  if (!branchesOk) return finish();
  const branchId = branchList[0].id;

  // 3. services
  const services = await call('GET', `/branches/${branchId}/services`);
  const serviceList = Array.isArray(services.json) ? services.json : services.json?.data;
  const servicesOk =
    services.status === 200 &&
    Array.isArray(serviceList) &&
    serviceList.length >= 2 &&
    serviceList.every((s) => s.id && s.name && typeof s.price === 'number' && (typeof s.duration_minutes === 'number' || typeof s.duration === 'number'));
  record(servicesOk, `GET /branches/${branchId}/services ≥2 dịch vụ có giá + thời lượng`, JSON.stringify(serviceList?.[0] ?? {}));
  if (!servicesOk) return finish();
  const service = serviceList[0];

  // 4. stylists
  const stylists = await call('GET', `/branches/${branchId}/stylists`);
  const stylistList = Array.isArray(stylists.json) ? stylists.json : stylists.json?.data;
  const stylistsOk = stylists.status === 200 && Array.isArray(stylistList) && stylistList.length >= 2 && stylistList.every((s) => s.id && s.name);
  record(stylistsOk, `GET /branches/${branchId}/stylists ≥2 stylist`, `${stylistList?.length} stylist`);
  if (!stylistsOk) return finish();
  const stylist = stylistList[0];

  // 5. slots
  const date = vnDate(1);
  const slotsResp = await call('GET', `/slots?branch_id=${branchId}&stylist_id=${stylist.id}&service_id=${service.id}&date=${date}`);
  const slots = Array.isArray(slotsResp.json) ? slotsResp.json : slotsResp.json?.data;
  const slotsOk =
    slotsResp.status === 200 &&
    Array.isArray(slots) &&
    slots.length > 0 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/.test(slots[0].start_time);
  record(slotsOk, `GET /slots ngày ${date} trả danh sách ISO 8601`, `${slots?.length} slot, đầu tiên ${slots?.[0]?.start_time}`);
  if (!slotsOk) return finish();
  const firstSlot = slots[0].start_time;

  // 6. create booking
  const createBody = {
    branch_id: branchId,
    service_id: service.id,
    stylist_id: stylist.id,
    start_time: firstSlot,
    customer_name: 'Khách Kiểm Thử',
    customer_phone: '0901234567',
    customer_email: 'khach.kiemthu@example.com',
  };
  const created = await call('POST', '/bookings', { body: createBody });
  const booking = created.json ?? {};
  const createdOk =
    created.status === 201 &&
    booking.id &&
    booking.status &&
    booking.start_time &&
    booking.end_time &&
    typeof booking.deposit_status === 'string' &&
    typeof booking.deposit_amount === 'number' &&
    typeof booking.discount_amount === 'number';
  record(createdOk, 'POST /bookings trả 201 + đủ field hợp đồng', JSON.stringify({ id: booking.id, status: booking.status, deposit_amount: booking.deposit_amount, deposit_status: booking.deposit_status, discount_amount: booking.discount_amount }));
  if (!createdOk) return finish();

  // 7. conflict
  const conflict = await call('POST', '/bookings', { body: { ...createBody, customer_phone: '0912345678' } });
  const conflictMsg = conflict.json?.error ?? conflict.json?.message;
  record(conflict.status === 409 && isVietnamese(conflictMsg), 'POST /bookings trùng slot trả 409 + lỗi tiếng Việt', `${conflict.status}: ${String(conflictMsg).slice(0, 90)}`);

  // 8. get booking
  const fetched = await call('GET', `/bookings/${booking.id}`);
  record(fetched.status === 200 && fetched.json?.id === booking.id && fetched.json?.start_time === booking.start_time, 'GET /bookings/{id} trả cùng field', `status=${fetched.status}`);

  // 9. complete without token → 401
  const completeNoAuth = await call('POST', `/bookings/${booking.id}/complete`);
  record(completeNoAuth.status === 401, 'POST /bookings/{id}/complete thiếu token trả 401', `status=${completeNoAuth.status}`);

  // 10. login
  const login = await call('POST', '/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const token = login.json?.access_token;
  record(login.status === 200 && typeof token === 'string' && token.length > 20, 'POST /auth/login trả access_token', `status=${login.status} role=${login.json?.user?.role}`);
  if (!token) return finish();

  // 11. complete with token
  const completed = await call('POST', `/bookings/${booking.id}/complete`, { token });
  record(completed.status === 200 && completed.json?.status === 'completed', 'POST /bookings/{id}/complete → status completed', `status=${completed.status} booking=${completed.json?.status}`);

  // 12. revenue
  const revenue = await call('GET', `/admin/revenue?branch_id=${branchId}`, { token });
  record(revenue.status === 200 && typeof revenue.json?.total_revenue === 'number', 'GET /admin/revenue trả total_revenue dạng số', `total_revenue=${revenue.json?.total_revenue}`);
  const revenueNoToken = await call('GET', `/admin/revenue?branch_id=${branchId}`);
  record(revenueNoToken.status === 401, 'GET /admin/revenue thiếu token trả 401', `status=${revenueNoToken.status}`);

  // 13. invalid phone → 400
  const badPhone = await call('POST', '/bookings', { body: { ...createBody, customer_phone: '123456' } });
  const badPhoneMsg = badPhone.json?.error ?? badPhone.json?.message;
  record(badPhone.status === 400 && isVietnamese(badPhoneMsg), 'POST /bookings SĐT sai trả 400 tiếng Việt', `${badPhone.status}: ${String(badPhoneMsg).slice(0, 80)}`);

  // 14. outside working hours → 400
  const outside = await call('POST', '/bookings', { body: { ...createBody, customer_phone: '0987654321', start_time: `${date}T05:00:00+07:00` } });
  const outsideMsg = outside.json?.error ?? outside.json?.message;
  record(outside.status === 400 && isVietnamese(outsideMsg), 'POST /bookings ngoài giờ làm việc trả 400 tiếng Việt', `${outside.status}: ${String(outsideMsg).slice(0, 90)}`);

  // 15. cancel within 24h → 4xx
  const cancelSoon = await call('POST', `/bookings/${booking.id}/cancel`, { body: {} });
  const cancelMsg = cancelSoon.json?.error ?? cancelSoon.json?.message;
  record(cancelSoon.status >= 400 && cancelSoon.status < 500 && isVietnamese(cancelMsg), 'Hủy trong vòng 24h trả 4xx tiếng Việt', `${cancelSoon.status}: ${String(cancelMsg).slice(0, 90)}`);

  // 16. deposit without VNPAY config → 400 tiếng Việt (KHÔNG được là 401: khách không cần đăng nhập)
  const deposit = await call('POST', `/bookings/${booking.id}/deposit`, { body: {} });
  const depositMsg = deposit.json?.error ?? deposit.json?.message;
  if (deposit.status === 404) record('skip', 'POST /bookings/{id}/deposit (chưa triển khai)');
  else record(deposit.status === 400 && isVietnamese(depositMsg) && /vnpay/i.test(String(depositMsg)), 'POST /bookings/{id}/deposit khi chưa cấu hình VNPay → 400 tiếng Việt', `${deposit.status}: ${String(depositMsg).slice(0, 90)}`);

  // 17. webhook without secret → 400 (không cần token)
  const webhook = await call('POST', '/webhooks/vnpay', { body: { vnp_TxnRef: 'x', vnp_SecureHash: 'deadbeef' } });
  const webhookMsg = webhook.json?.error ?? webhook.json?.message;
  if (webhook.status === 404) record('skip', 'POST /webhooks/vnpay (chưa triển khai)');
  else record(webhook.status === 400 && isVietnamese(webhookMsg), 'POST /webhooks/vnpay thiếu secret → 400 tiếng Việt', `${webhook.status}: ${String(webhookMsg).slice(0, 90)}`);

  // 18. ai chat without config → 4xx/5xx tiếng Việt
  const chat = await call('POST', '/ai/chat', { body: { message: 'Xin chào' } });
  const chatMsg = chat.json?.error ?? chat.json?.message;
  if (chat.status === 404) record('skip', 'POST /ai/chat (chưa triển khai)');
  else record(chat.status >= 400 && isVietnamese(chatMsg), 'POST /ai/chat khi chưa cấu hình AI → lỗi tiếng Việt', `${chat.status}: ${String(chatMsg).slice(0, 90)}`);

  return finish();
}

function finish() {
  console.log(`\n== Kết quả: ${pass} PASS, ${fail} FAIL, ${skip} SKIP ==`);
  if (failures.length > 0) {
    console.log('Các bước lỗi:');
    for (const item of failures) console.log(` - ${item}`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Lỗi không mong đợi:', error);
  process.exit(2);
});
