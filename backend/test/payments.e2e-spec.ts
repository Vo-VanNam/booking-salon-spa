/**
 * Test thanh toán VNPay (DOCUMENT.md §2.5 + hợp đồng harness):
 * verify chữ ký bằng một bản ký ĐỘC LẬP viết trong test (không dùng lại adapter),
 * cộng tiền cọc đúng một lần cho mỗi vnp_TxnRef, và các trường hợp từ chối.
 */
import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { seedAll } from '../prisma/seed-data';
import { bootTestApp, http, TestApp, vnDate } from './helpers/app';

const prisma = new PrismaClient();

const HASH_SECRET = 'e2e_vnpay_hash_secret';
const TMN_CODE = 'E2ETMN';

/** Bản ký độc lập theo mô tả hợp đồng: lowercase hex HMAC-SHA512, field vnp_* sắp xếp, "k=v" nối "&". */
function forgeSignedCallback(fields: Record<string, string>): Record<string, string> {
  const canonical = Object.keys(fields)
    .filter((key) => key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType')
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('&');
  const signature = createHmac('sha512', HASH_SECRET).update(canonical, 'utf8').digest('hex');
  return { ...fields, vnp_SecureHash: signature };
}

describe('Thanh toán VNPay: tạo cọc + webhook idempotent', () => {
  let server: TestApp;
  let baseUrl: string;

  const branchId = 'branch-1';
  const serviceId = 'svc-1-1'; // 180.000đ, 45 phút
  const stylistId = 'stylist-1-1';

  beforeAll(async () => {
    process.env.QUEUE_ENABLED = 'false';
    delete process.env.REDIS_URL;
    await seedAll(prisma);
    server = await bootTestApp({
      VNPAY_TMN_CODE: TMN_CODE,
      VNPAY_HASH_SECRET: HASH_SECRET,
      VNPAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      VNPAY_RETURN_URL: 'http://localhost:8101/booking',
    });
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await server?.close();
    await prisma.$disconnect();
  });

  async function createBooking(date: string, index: number, phone: string) {
    const slots = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`)).json;
    const result = await http(baseUrl, 'POST', '/bookings', {
      body: {
        branch_id: branchId,
        service_id: serviceId,
        stylist_id: stylistId,
        start_time: slots[index].start_time,
        customer_name: 'Khách Đặt Cọc',
        customer_phone: phone,
      },
    });
    expect(result.status).toBe(201);
    return result.json;
  }

  it('tạo yêu cầu cọc → 200 với payment_url và txn_ref hợp lệ', async () => {
    const booking = await createBooking(vnDate(30), 0, '0901230001');
    const deposit = await http(baseUrl, 'POST', `/bookings/${booking.id}/deposit`, { body: {} });

    expect(deposit.status).toBe(200);
    expect(deposit.json.txn_ref).toBe(booking.id);
    expect(typeof deposit.json.payment_url).toBe('string');
    expect(deposit.json.payment_url).toContain('sandbox.vnpayment.vn');
    expect(deposit.json.payment_url).toContain(`vnp_TmnCode=${TMN_CODE}`);
    expect(deposit.json.payment_url).toContain(`vnp_TxnRef=${booking.id}`);
    expect(deposit.json.payment_url).toMatch(/vnp_SecureHash=[0-9a-f]{128}/);
    expect(deposit.json.amount).toBe(booking.deposit_amount);
  });

  it('webhook hợp lệ → deposit_status=paid, deposit_amount không đổi; gọi lại → already_processed', async () => {
    const booking = await createBooking(vnDate(31), 0, '0901230002');
    await http(baseUrl, 'POST', `/bookings/${booking.id}/deposit`, { body: {} });

    const callback = forgeSignedCallback({
      vnp_Amount: String(booking.deposit_amount),
      vnp_BankCode: 'NCB',
      vnp_OrderInfo: `Thanh toan coc ${booking.id}`,
      vnp_ResponseCode: '00',
      vnp_TransactionNo: '140001',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: booking.id,
    });

    const first = await http(baseUrl, 'POST', '/webhooks/vnpay', { body: callback });
    expect(first.status).toBe(200);
    expect(first.json.status).toBe('ok');

    const afterFirst = await http(baseUrl, 'GET', `/bookings/${booking.id}`);
    expect(afterFirst.json.deposit_status).toBe('paid');
    const amountAfterFirst = afterFirst.json.deposit_amount;
    expect(amountAfterFirst).toBe(booking.deposit_amount);

    const second = await http(baseUrl, 'POST', '/webhooks/vnpay', { body: callback });
    expect(second.status).toBe(200);
    expect(second.json.status).toBe('already_processed');

    const afterSecond = await http(baseUrl, 'GET', `/bookings/${booking.id}`);
    expect(afterSecond.json.deposit_amount).toBe(amountAfterFirst);
    expect(afterSecond.json.deposit_status).toBe('paid');

    const successRows = await prisma.paymentTransaction.count({
      where: { bookingId: booking.id, provider: 'vnpay', status: 'success' },
    });
    expect(successRows).toBe(1);

    // Lưu payload gốc để đối soát
    const txn = await prisma.paymentTransaction.findFirst({ where: { bookingId: booking.id, provider: 'vnpay' } });
    expect(txn?.rawPayload).toBeTruthy();
    expect(JSON.stringify(txn?.rawPayload)).toContain('140001');
  });

  it('hai callback hợp lệ chạy song song → chỉ cộng cọc đúng một lần', async () => {
    const booking = await createBooking(vnDate(32), 0, '0901230003');
    await http(baseUrl, 'POST', `/bookings/${booking.id}/deposit`, { body: {} });
    const callback = forgeSignedCallback({
      vnp_Amount: String(booking.deposit_amount),
      vnp_ResponseCode: '00',
      vnp_TransactionNo: '140002',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: booking.id,
    });

    const [a, b] = await Promise.all([
      http(baseUrl, 'POST', '/webhooks/vnpay', { body: callback }),
      http(baseUrl, 'POST', '/webhooks/vnpay', { body: callback }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const statuses = [a.json.status, b.json.status].sort();
    expect(statuses).toEqual(['already_processed', 'ok']);

    const rows = await prisma.paymentTransaction.count({
      where: { bookingId: booking.id, provider: 'vnpay', status: 'success' },
    });
    expect(rows).toBe(1);

    const bookingAfter = await http(baseUrl, 'GET', `/bookings/${booking.id}`);
    expect(bookingAfter.json.deposit_amount).toBe(booking.deposit_amount);
  });

  it('chữ ký sai (đổi số tiền sau khi ký) → 400 và KHÔNG đánh dấu đã cọc', async () => {
    const booking = await createBooking(vnDate(33), 0, '0901230004');
    await http(baseUrl, 'POST', `/bookings/${booking.id}/deposit`, { body: {} });

    const signed = forgeSignedCallback({
      vnp_Amount: String(booking.deposit_amount),
      vnp_ResponseCode: '00',
      vnp_TxnRef: booking.id,
    });
    const tampered = { ...signed, vnp_Amount: '1000' };

    const result = await http(baseUrl, 'POST', '/webhooks/vnpay', { body: tampered });
    expect(result.status).toBe(400);
    expect(String(result.json.error ?? result.json.message)).toMatch(/chữ ký/i);

    const after = await http(baseUrl, 'GET', `/bookings/${booking.id}`);
    expect(after.json.deposit_status).toBe('unpaid');
  });

  it('chữ ký hợp lệ nhưng không khớp lịch hẹn nào → 200 ok, không tạo dữ liệu rác', async () => {
    const before = await prisma.paymentTransaction.count();
    const callback = forgeSignedCallback({
      vnp_Amount: '50000',
      vnp_ResponseCode: '00',
      vnp_TxnRef: 'khong-ton-tai',
    });
    const result = await http(baseUrl, 'POST', '/webhooks/vnpay', { body: callback });
    expect(result.status).toBe(200);
    expect(result.json.status).toBe('ok');
    expect(await prisma.paymentTransaction.count()).toBe(before);
  });

  it('giao dịch thất bại (vnp_ResponseCode != 00) → không đánh dấu đã cọc', async () => {
    const booking = await createBooking(vnDate(34), 0, '0901230005');
    await http(baseUrl, 'POST', `/bookings/${booking.id}/deposit`, { body: {} });
    const callback = forgeSignedCallback({
      vnp_Amount: String(booking.deposit_amount),
      vnp_ResponseCode: '24',
      vnp_TransactionStatus: '02',
      vnp_TxnRef: booking.id,
    });
    const result = await http(baseUrl, 'POST', '/webhooks/vnpay', { body: callback });
    expect(result.status).toBe(200);
    const after = await http(baseUrl, 'GET', `/bookings/${booking.id}`);
    expect(after.json.deposit_status).toBe('unpaid');
    const failed = await prisma.paymentTransaction.findFirst({ where: { bookingId: booking.id, provider: 'vnpay' } });
    expect(failed?.status).toBe('failed');
  });

  it('Momo chưa cấu hình → 400 tiếng Việt', async () => {
    const booking = await createBooking(vnDate(35), 0, '0901230006');
    const result = await http(baseUrl, 'POST', `/bookings/${booking.id}/deposit?provider=momo`, { body: {} });
    expect(result.status).toBe(400);
    expect(String(result.json.error ?? result.json.message)).toMatch(/momo/i);
  });
});
