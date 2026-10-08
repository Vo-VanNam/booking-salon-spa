#!/usr/bin/env node
/**
 * Kiểm tra thanh toán VNPay trên hệ thống ĐANG CHẠY (run.sh) khi đã cấu hình VNPAY_*:
 * tạo cọc → ký callback bằng implementation độc lập → xác nhận đã cọc → gọi lại idempotent → chữ ký sai bị từ chối.
 * Dùng: BASE=http://localhost:8100 VNPAY_HASH_SECRET=... node scripts/live-payments-check.mjs
 */
import { createHmac } from 'node:crypto';

const BASE = process.env.BASE ?? 'http://localhost:8100';
const SECRET = process.env.VNPAY_HASH_SECRET ?? '';
const TMN = process.env.VNPAY_TMN_CODE ?? '';
const BRANCH = process.env.BRANCH_ID ?? 'branch-1';
const SERVICE = process.env.SERVICE_ID ?? 'svc-1-2';
const STYLIST = process.env.STYLIST_ID ?? 'stylist-1-1';

let pass = 0;
let fail = 0;
const failures = [];

function record(ok, name, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(method, path, { body, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

/** Bản ký độc lập theo mô tả hợp đồng harness. */
function forge(fields) {
  const canonical = Object.keys(fields)
    .filter((key) => key !== 'vnp_SecureHash')
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('&');
  return { ...fields, vnp_SecureHash: createHmac('sha512', SECRET).update(canonical, 'utf8').digest('hex') };
}

function vnDate(offsetDays) {
  return new Date(Date.now() + offsetDays * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
}

async function main() {
  if (!SECRET || !TMN) {
    console.error('Thiếu VNPAY_HASH_SECRET / VNPAY_TMN_CODE — chạy run.sh với các biến này trước.');
    process.exit(2);
  }
  console.log(`== Kiểm tra VNPay trên ${BASE} ==\n`);

  const date = vnDate(90);
  const slots = (await call('GET', `/slots?branch_id=${BRANCH}&stylist_id=${STYLIST}&service_id=${SERVICE}&date=${date}`)).json ?? [];
  const created = await call('POST', '/bookings', {
    body: {
      branch_id: BRANCH,
      service_id: SERVICE,
      stylist_id: STYLIST,
      start_time: slots[0].start_time,
      customer_name: 'Khách Live Payments',
      customer_phone: '0913000111',
    },
  });
  record(created.status === 201, 'tạo booking để đặt cọc', `status=${created.status}`);
  if (created.status !== 201) return finish();

  const booking = created.json;
  const deposit = await call('POST', `/bookings/${booking.id}/deposit`, { body: {} });
  record(
    deposit.status === 200 && typeof deposit.json?.payment_url === 'string' && deposit.json.txn_ref === booking.id,
    'POST /bookings/{id}/deposit → 200 + payment_url + txn_ref',
    `amount=${deposit.json?.amount}`,
  );

  const callback = forge({
    vnp_Amount: String(booking.deposit_amount),
    vnp_ResponseCode: '00',
    vnp_TransactionStatus: '00',
    vnp_TxnRef: booking.id,
    vnp_OrderInfo: `Thanh toan coc ${booking.id}`,
  });
  const first = await call('POST', '/webhooks/vnpay', { body: callback });
  const afterFirst = await call('GET', `/bookings/${booking.id}`);
  record(
    first.status === 200 && first.json?.status === 'ok' && afterFirst.json?.deposit_status === 'paid',
    'webhook hợp lệ → 200 ok, booking chuyển "paid"',
    `deposit_amount=${afterFirst.json?.deposit_amount}`,
  );

  const second = await call('POST', '/webhooks/vnpay', { body: callback });
  const afterSecond = await call('GET', `/bookings/${booking.id}`);
  record(
    second.status === 200 &&
      second.json?.status === 'already_processed' &&
      afterSecond.json?.deposit_amount === afterFirst.json?.deposit_amount,
    'gọi lại cùng vnp_TxnRef → already_processed, deposit_amount không đổi',
    `status=${second.json?.status}`,
  );

  const tampered = (await call('POST', '/webhooks/vnpay', { body: { ...callback, vnp_Amount: '1' } })).status;
  record(tampered === 400, 'chữ ký sai (sửa số tiền) → 400', `status=${tampered}`);

  return finish();
}

function finish() {
  console.log(`\n== Payments live check: ${pass} PASS, ${fail} FAIL ==`);
  if (failures.length > 0) console.log(`Lỗi: ${failures.join(' | ')}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Lỗi không mong đợi:', error);
  process.exit(2);
});
