/**
 * Test bề mặt API theo GRADER API SURFACE + các quy tắc nghiệp vụ trọng yếu (DOCUMENT.md §2, §4).
 * Chạy trên Postgres riêng của môi trường test (scripts/test.sh), không cần stack production.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { seedAll } from '../prisma/seed-data';
import { bootTestApp, http, login, TestApp, vnDate } from './helpers/app';

const prisma = new PrismaClient();

const SUSPICIOUS_FIELDS = ['access_token', 'refresh_token', 'password', 'password_hash'];

/**
 * Slot gợi ý cách nhau 15 phút nên hai slot liền kề có thể chồng lấn với dịch vụ dài.
 * Chọn các slot cách nhau ít nhất bằng thời lượng dịch vụ (60 phút / bước 15 phút = 4).
 */
function spacedSlots(slots: any[], factor = 4): any[] {
  return slots.filter((_slot, index) => index % factor === 0);
}

describe('API surface theo hợp đồng', () => {
  let server: TestApp;
  let baseUrl: string;
  let adminToken: string;
  let branchAdminToken: string;

  const branchId = 'branch-1';
  const serviceId = 'svc-1-2'; // 60 phút, 250.000đ
  const stylistId = 'stylist-1-1';

  beforeAll(async () => {
    process.env.QUEUE_ENABLED = 'false';
    delete process.env.REDIS_URL;
    delete process.env.AI_BASE_URL;
    delete process.env.VNPAY_TMN_CODE;
    delete process.env.VNPAY_HASH_SECRET;
    await seedAll(prisma);
    server = await bootTestApp();
    baseUrl = server.baseUrl;
    adminToken = await login(baseUrl, 'admin@booking.vn', 'admin12345');
    branchAdminToken = await login(baseUrl, 'branch1@booking.vn', 'branch12345');
  });

  afterAll(async () => {
    await server?.close();
    await prisma.$disconnect();
  });

  it('GET /health trả 200 kèm status ok, db và redis', async () => {
    const result = await http(baseUrl, 'GET', '/health');
    expect(result.status).toBe(200);
    expect(result.json.status).toBe('ok');
    expect(result.json.db).toBe('ok');
    expect(['ok', 'down', 'disabled']).toContain(result.json.redis);
  });

  it('GET /branches: ≥3 chi nhánh, có id/name, sắp xếp theo id tăng dần', async () => {
    const result = await http(baseUrl, 'GET', '/branches');
    expect(result.status).toBe(200);
    const branches = Array.isArray(result.json) ? result.json : result.json.data;
    expect(branches.length).toBeGreaterThanOrEqual(3);
    for (const branch of branches) {
      expect(typeof branch.id).toBe('string');
      expect(typeof branch.name).toBe('string');
    }
    const ids = branches.map((branch: any) => branch.id);
    expect([...ids].sort()).toEqual(ids);
  });

  it('GET /branches/{id}/services: ≥2 dịch vụ có giá và thời lượng nguyên', async () => {
    const result = await http(baseUrl, 'GET', `/branches/${branchId}/services`);
    expect(result.status).toBe(200);
    const services = Array.isArray(result.json) ? result.json : result.json.data;
    expect(services.length).toBeGreaterThanOrEqual(2);
    for (const service of services) {
      expect(typeof service.id).toBe('string');
      expect(Number.isInteger(service.price)).toBe(true);
      const duration = service.duration_minutes ?? service.duration;
      expect(Number.isInteger(duration)).toBe(true);
    }
  });

  it('GET /branches/{id}/stylists: ≥2 stylist có id/name', async () => {
    const result = await http(baseUrl, 'GET', `/branches/${branchId}/stylists`);
    expect(result.status).toBe(200);
    const stylists = Array.isArray(result.json) ? result.json : result.json.data;
    expect(stylists.length).toBeGreaterThanOrEqual(2);
    expect(stylists.every((item: any) => item.id && item.name)).toBe(true);
  });

  it('GET /slots: danh sách ISO 8601 +07:00 trong giờ làm việc', async () => {
    const date = vnDate(1);
    const result = await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`);
    expect(result.status).toBe(200);
    const slots = result.json as any[];
    expect(Array.isArray(slots)).toBe(true);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.start_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/);
      expect(slot.start_time.startsWith(date)).toBe(true);
    }
    const hours = slots.map((slot) => Number(slot.start_time.slice(11, 13)));
    expect(Math.min(...hours)).toBeGreaterThanOrEqual(8);
    expect(Math.max(...hours)).toBeLessThanOrEqual(20);
  });

  it('POST /bookings: 201 với đủ field hợp đồng, không lộ thông tin nhạy cảm', async () => {
    const date = vnDate(1);
    const slots = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`)).json;
    const startTime = slots[0].start_time;

    const result = await http(baseUrl, 'POST', '/bookings', {
      body: {
        branch_id: branchId,
        service_id: serviceId,
        stylist_id: stylistId,
        start_time: startTime,
        customer_name: 'Trần Thị Bích',
        customer_phone: '0905551234',
        customer_email: 'bich@example.com',
      },
    });

    expect(result.status).toBe(201);
    const booking = result.json;
    expect(typeof booking.id).toBe('string');
    expect(booking.status).toBe('confirmed');
    expect(booking.start_time).toBe(startTime);
    expect(booking.end_time).toMatch(/\+07:00$/);
    expect(booking.deposit_status).toBe('unpaid');
    expect(Number.isInteger(booking.deposit_amount)).toBe(true);
    expect(booking.deposit_amount).toBeGreaterThan(0);
    expect(booking.discount_amount).toBe(0);
    for (const field of SUSPICIOUS_FIELDS) expect(result.json[field]).toBeUndefined();

    // Kết thúc đúng bằng start + duration của dịch vụ (60 phút).
    const start = new Date(booking.start_time).getTime();
    const end = new Date(booking.end_time).getTime();
    expect(end - start).toBe(60 * 60 * 1000);

    // GET lại phải cùng field
    const fetched = await http(baseUrl, 'GET', `/bookings/${booking.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.json.id).toBe(booking.id);
    expect(fetched.json.start_time).toBe(booking.start_time);
    expect(fetched.json.deposit_amount).toBe(booking.deposit_amount);

    // Slot vừa đặt không còn trong danh sách trống
    const after = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`)).json;
    expect(after.map((slot: any) => slot.start_time)).not.toContain(startTime);
  });

  it('POST /bookings trùng slot: 409 + lỗi tiếng Việt', async () => {
    const date = vnDate(1);
    const slots = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`)).json;
    const startTime = slots[0].start_time;
    const body = {
      branch_id: branchId,
      service_id: serviceId,
      stylist_id: stylistId,
      start_time: startTime,
      customer_name: 'Khách Trùng Lịch',
      customer_phone: '0912223333',
    };
    const first = await http(baseUrl, 'POST', '/bookings', { body });
    expect(first.status).toBe(201);
    const second = await http(baseUrl, 'POST', '/bookings', { body: { ...body, customer_phone: '0912223334' } });
    expect(second.status).toBe(409);
    const message = second.json.error ?? second.json.message;
    expect(typeof message).toBe('string');
    expect(/[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(message)).toBe(true);
  });

  it('RACE: hai request đồng thời tranh cùng một slot → đúng một thắng, một nhận 409', async () => {
    const date = vnDate(2);
    const slots = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`)).json;
    const startTime = spacedSlots(slots, 4)[1].start_time;

    const makeBody = (phone: string) => ({
      branch_id: branchId,
      service_id: serviceId,
      stylist_id: stylistId,
      start_time: startTime,
      customer_name: 'Khách Đua Slot',
      customer_phone: phone,
    });

    const [a, b] = await Promise.all([
      http(baseUrl, 'POST', '/bookings', { body: makeBody('0938111222') }),
      http(baseUrl, 'POST', '/bookings', { body: makeBody('0938333444') }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const created = a.status === 201 ? a.json : b.json;
    const conflict = a.status === 409 ? a : b;
    expect(conflict.json.error ?? conflict.json.message).toMatch(/đã được đặt/i);

    // Chỉ đúng 1 booking được tạo cho slot này
    const rows = await prisma.booking.findMany({
      where: { stylistId, startTime: new Date(created.start_time) },
    });
    expect(rows).toHaveLength(1);
  });

  it('POST /bookings: SĐT sai định dạng → 400 tiếng Việt', async () => {
    const result = await http(baseUrl, 'POST', '/bookings', {
      body: {
        branch_id: branchId,
        service_id: serviceId,
        stylist_id: stylistId,
        start_time: `${vnDate(3)}T09:00:00+07:00`,
        customer_name: 'Khách Sai SĐT',
        customer_phone: '12345',
      },
    });
    expect(result.status).toBe(400);
    expect(String(result.json.error ?? result.json.message)).toMatch(/điện thoại/i);
  });

  it('POST /bookings: email sai định dạng → 400 tiếng Việt', async () => {
    const result = await http(baseUrl, 'POST', '/bookings', {
      body: {
        branch_id: branchId,
        service_id: serviceId,
        stylist_id: stylistId,
        start_time: `${vnDate(3)}T09:00:00+07:00`,
        customer_name: 'Khách Sai Email',
        customer_phone: '0905559999',
        customer_email: 'khong-phai-email',
      },
    });
    expect(result.status).toBe(400);
    expect(String(result.json.error ?? result.json.message)).toMatch(/email/i);
  });

  it('POST /bookings: ngoài giờ làm việc → 400 tiếng Việt', async () => {
    const result = await http(baseUrl, 'POST', '/bookings', {
      body: {
        branch_id: branchId,
        service_id: serviceId,
        stylist_id: stylistId,
        start_time: `${vnDate(3)}T05:00:00+07:00`,
        customer_name: 'Khách Sớm',
        customer_phone: '0905558888',
      },
    });
    expect(result.status).toBe(400);
    expect(String(result.json.error ?? result.json.message)).toMatch(/giờ/i);
  });

  it('POST /bookings: thời gian trong quá khứ → 400', async () => {
    const result = await http(baseUrl, 'POST', '/bookings', {
      body: {
        branch_id: branchId,
        service_id: serviceId,
        stylist_id: stylistId,
        start_time: '2020-01-02T09:00:00+07:00',
        customer_name: 'Khách Quá Khứ',
        customer_phone: '0905557777',
      },
    });
    expect(result.status).toBe(400);
  });

  describe('hoàn tất lịch hẹn + phân quyền', () => {
    it('không có token → 401; có token super_admin → completed; hoàn tất lần hai không nhân đôi loyalty', async () => {
      const date = vnDate(4);
      const slots = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`)).json;
      const created = await http(baseUrl, 'POST', '/bookings', {
        body: {
          branch_id: branchId,
          service_id: serviceId,
          stylist_id: stylistId,
          start_time: slots[0].start_time,
          customer_name: 'Khách Hoàn Tất',
          customer_phone: '0901112222',
        },
      });
      expect(created.status).toBe(201);

      expect((await http(baseUrl, 'POST', `/bookings/${created.json.id}/complete`)).status).toBe(401);

      const completed = await http(baseUrl, 'POST', `/bookings/${created.json.id}/complete`, { token: adminToken });
      expect(completed.status).toBe(200);
      expect(completed.json.status).toBe('completed');

      const customerId = created.json.customer_id;
      const afterFirst = await prisma.customer.findUnique({ where: { id: customerId } });
      const again = await http(baseUrl, 'POST', `/bookings/${created.json.id}/complete`, { token: adminToken });
      expect(again.status).toBe(200);
      const afterSecond = await prisma.customer.findUnique({ where: { id: customerId } });
      expect(afterSecond?.completedBookings).toBe(afterFirst?.completedBookings);

      const earnRows = await prisma.loyaltyTransaction.count({ where: { bookingId: created.json.id, type: 'earn' } });
      expect(earnRows).toBe(1);
    });

    it('branch_admin không hoàn tất được lịch của chi nhánh khác (403)', async () => {
      const date = vnDate(5);
      const services = (await http(baseUrl, 'GET', '/branches/branch-2/services')).json;
      const stylists = (await http(baseUrl, 'GET', '/branches/branch-2/stylists')).json;
      const slots = (
        await http(baseUrl, 'GET', `/slots?branch_id=branch-2&stylist_id=${stylists[0].id}&service_id=${services[0].id}&date=${date}`)
      ).json;
      const created = await http(baseUrl, 'POST', '/bookings', {
        body: {
          branch_id: 'branch-2',
          service_id: services[0].id,
          stylist_id: stylists[0].id,
          start_time: slots[0].start_time,
          customer_name: 'Khách Chi Nhánh 2',
          customer_phone: '0903334444',
        },
      });
      expect(created.status).toBe(201);
      const result = await http(baseUrl, 'POST', `/bookings/${created.json.id}/complete`, { token: branchAdminToken });
      expect(result.status).toBe(403);
    });
  });

  describe('hủy / đổi lịch (§2.2)', () => {
    it('hủy lịch cách >24h → 200 cancelled và slot được giải phóng', async () => {
      const date = vnDate(6);
      const slots = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`)).json;
      const startTime = slots[0].start_time;
      const created = await http(baseUrl, 'POST', '/bookings', {
        body: {
          branch_id: branchId,
          service_id: serviceId,
          stylist_id: stylistId,
          start_time: startTime,
          customer_name: 'Khách Hủy Sớm',
          customer_phone: '0907778888',
        },
      });
      expect(created.status).toBe(201);

      const cancelled = await http(baseUrl, 'POST', `/bookings/${created.json.id}/cancel`, { body: {} });
      expect([200, 204]).toContain(cancelled.status);
      if (cancelled.status === 200) expect(cancelled.json.status).toBe('cancelled');

      const after = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`)).json;
      expect(after.map((slot: any) => slot.start_time)).toContain(startTime);
    });

    it('hủy trong vòng 24h trước giờ hẹn → 4xx tiếng Việt', async () => {
      // Tạo trực tiếp trong DB một lịch hẹn cách hiện tại 2 giờ để kiểm tra chắc chắn quy tắc 24h
      // (khung giờ trống hôm nay phụ thuộc thời điểm chạy test).
      const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const customer = await prisma.customer.upsert({
        where: { phone: '0909991111' },
        update: {},
        create: { name: 'Khách Hủy Muộn', phone: '0909991111' },
      });
      const bookingSoon = await prisma.booking.create({
        data: {
          branchId,
          serviceId,
          stylistId,
          customerId: customer.id,
          startTime: start,
          endTime: end,
          status: 'confirmed',
          price: 250_000,
          depositAmount: 75_000,
          depositStatus: 'unpaid',
        },
      });

      const cancelled = await http(baseUrl, 'POST', `/bookings/${bookingSoon.id}/cancel`, { body: {} });
      expect(cancelled.status).toBeGreaterThanOrEqual(400);
      expect(cancelled.status).toBeLessThan(500);
      expect(String(cancelled.json.error ?? cancelled.json.message)).toMatch(/24/);

      const unchanged = await prisma.booking.findUnique({ where: { id: bookingSoon.id } });
      expect(unchanged?.status).toBe('confirmed');
    });

    it('đổi lịch chạy lại kiểm tra trùng: dời sang slot đã có người đặt → 409', async () => {
      const date = vnDate(7);
      const slots = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`)).json;
      const spaced = spacedSlots(slots, 4);
      expect(spaced.length).toBeGreaterThanOrEqual(4);
      const taken = await http(baseUrl, 'POST', '/bookings', {
        body: {
          branch_id: branchId,
          service_id: serviceId,
          stylist_id: stylistId,
          start_time: spaced[0].start_time,
          customer_name: 'Khách Giữ Chỗ',
          customer_phone: '0904445555',
        },
      });
      // spaced[1] cách spaced[0] một giờ → không chồng lấn với dịch vụ 60 phút.
      const movable = await http(baseUrl, 'POST', '/bookings', {
        body: {
          branch_id: branchId,
          service_id: serviceId,
          stylist_id: stylistId,
          start_time: spaced[1].start_time,
          customer_name: 'Khách Muốn Dời',
          customer_phone: '0904446666',
        },
      });
      expect(taken.status).toBe(201);
      expect(movable.status).toBe(201);

      const moved = await http(baseUrl, 'POST', `/bookings/${movable.json.id}/reschedule`, {
        body: { start_time: taken.json.start_time },
      });
      expect(moved.status).toBe(409);

      const ok = await http(baseUrl, 'POST', `/bookings/${movable.json.id}/reschedule`, {
        body: { start_time: spaced[3].start_time },
      });
      expect(ok.status).toBe(200);
      expect(ok.json.start_time).toBe(spaced[3].start_time);
    });
  });

  describe('loyalty (§2.4)', () => {
    it('khách đủ 10 lần hoàn thành được giảm giá cho lần đặt kế tiếp, và chỉ một lần', async () => {
      const phone = '0908765432';
      const existing = await prisma.customer.findUnique({ where: { phone } });
      if (existing) {
        await prisma.loyaltyTransaction.deleteMany({ where: { customerId: existing.id } });
      }
      await prisma.customer.upsert({
        where: { phone },
        update: { completedBookings: 10, loyaltyDiscountUsedAt: null },
        create: { name: 'Khách Thân Thiết', phone, completedBookings: 10, loyaltyDiscountUsedAt: null },
      });

      const date = vnDate(8);
      const slots = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`)).json;
      const spaced = spacedSlots(slots, 4);
      const first = await http(baseUrl, 'POST', '/bookings', {
        body: {
          branch_id: branchId,
          service_id: serviceId,
          stylist_id: stylistId,
          start_time: spaced[0].start_time,
          customer_name: 'Khách Thân Thiết',
          customer_phone: phone,
        },
      });
      expect(first.status).toBe(201);
      expect(first.json.discount_amount).toBeGreaterThan(0);
      expect(first.json.deposit_amount).toBeLessThan(first.json.price);

      const second = await http(baseUrl, 'POST', '/bookings', {
        body: {
          branch_id: branchId,
          service_id: serviceId,
          stylist_id: stylistId,
          start_time: spaced[1].start_time,
          customer_name: 'Khách Thân Thiết',
          customer_phone: phone,
        },
      });
      expect(second.status).toBe(201);
      expect(second.json.discount_amount).toBe(0);

      const redeemRows = await prisma.loyaltyTransaction.findMany({
        where: { customer: { phone }, type: 'redeem' },
      });
      expect(redeemRows.length).toBe(1);
    });
  });

  describe('doanh thu + phân quyền admin (§2.6)', () => {
    it('GET /admin/revenue: total_revenue là số; branch_admin không xem được chi nhánh khác (403); thiếu token → 401', async () => {
      const own = await http(baseUrl, 'GET', '/admin/revenue?branch_id=branch-1', { token: branchAdminToken });
      expect(own.status).toBe(200);
      expect(typeof own.json.total_revenue).toBe('number');
      expect(own.json.total_revenue).toBeGreaterThan(0);

      const other = await http(baseUrl, 'GET', '/admin/revenue?branch_id=branch-2', { token: branchAdminToken });
      expect(other.status).toBe(403);

      const noToken = await http(baseUrl, 'GET', '/admin/revenue?branch_id=branch-1');
      expect(noToken.status).toBe(401);

      const superAdmin = await http(baseUrl, 'GET', '/admin/revenue', { token: adminToken });
      expect(superAdmin.status).toBe(200);
      expect(Array.isArray(superAdmin.json.by_branch)).toBe(true);
      expect(Array.isArray(superAdmin.json.by_day)).toBe(true);
      expect(superAdmin.json.by_day.every((row: any) => typeof row.total_revenue === 'number')).toBe(true);
    });

    it('doanh thu chỉ tính lịch đã hoàn tất: lịch confirmed không được cộng vào', async () => {
      const before = (await http(baseUrl, 'GET', '/admin/revenue?branch_id=branch-1', { token: adminToken })).json.total_revenue;
      const date = vnDate(9);
      const slots = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`)).json;
      const created = await http(baseUrl, 'POST', '/bookings', {
        body: {
          branch_id: branchId,
          service_id: serviceId,
          stylist_id: stylistId,
          start_time: slots[0].start_time,
          customer_name: 'Khách Doanh Thu',
          customer_phone: '0902223333',
        },
      });
      expect(created.status).toBe(201);
      const afterPending = (await http(baseUrl, 'GET', '/admin/revenue?branch_id=branch-1', { token: adminToken })).json.total_revenue;
      expect(afterPending).toBe(before);

      await http(baseUrl, 'POST', `/bookings/${created.json.id}/complete`, { token: adminToken });
      const afterComplete = (await http(baseUrl, 'GET', '/admin/revenue?branch_id=branch-1', { token: adminToken })).json.total_revenue;
      expect(afterComplete).toBe(before + created.json.price - created.json.discount_amount);
    });
  });

  describe('cấu hình thiếu khoá (§6)', () => {
    it('POST /bookings/{id}/deposit khi chưa có VNPAY_* → 400 tiếng Việt, không cần đăng nhập', async () => {
      const date = vnDate(10);
      const slots = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`)).json;
      const created = await http(baseUrl, 'POST', '/bookings', {
        body: {
          branch_id: branchId,
          service_id: serviceId,
          stylist_id: stylistId,
          start_time: slots[0].start_time,
          customer_name: 'Khách Cọc',
          customer_phone: '0906667777',
        },
      });
      const result = await http(baseUrl, 'POST', `/bookings/${created.json.id}/deposit`, { body: {} });
      expect(result.status).toBe(400);
      expect(String(result.json.error ?? result.json.message)).toMatch(/vnpay/i);
    });

    it('POST /webhooks/vnpay khi chưa có VNPAY_HASH_SECRET → 400 tiếng Việt, không cần đăng nhập', async () => {
      const result = await http(baseUrl, 'POST', '/webhooks/vnpay', { body: { vnp_TxnRef: 'x', vnp_SecureHash: 'deadbeef' } });
      expect(result.status).toBe(400);
      expect(String(result.json.error ?? result.json.message)).toMatch(/vnpay/i);
    });

    it('POST /ai/chat khi chưa cấu hình AI → lỗi tiếng Việt, không crash', async () => {
      const result = await http(baseUrl, 'POST', '/ai/chat', { body: { message: 'Xin chào' } });
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.status).toBeLessThan(600);
      expect(String(result.json.error ?? result.json.message)).toMatch(/AI/i);
    });
  });

  describe('bảo mật & phân quyền', () => {
    it('branch_admin không hủy được lịch của chi nhánh khác qua route trạng thái (403) và trạng thái sai bị từ chối (400)', async () => {
      const services = (await http(baseUrl, 'GET', '/branches/branch-2/services')).json;
      const stylists = (await http(baseUrl, 'GET', '/branches/branch-2/stylists')).json;
      const date = vnDate(12);
      const slots = (
        await http(baseUrl, 'GET', `/slots?branch_id=branch-2&stylist_id=${stylists[0].id}&service_id=${services[0].id}&date=${date}`)
      ).json;
      const created = await http(baseUrl, 'POST', '/bookings', {
        body: {
          branch_id: 'branch-2',
          service_id: services[0].id,
          stylist_id: stylists[0].id,
          start_time: slots[0].start_time,
          customer_name: 'Khách Chi Nhánh 2',
          customer_phone: '0905111222',
        },
      });
      expect(created.status).toBe(201);

      const forbidden = await http(baseUrl, 'PATCH', `/admin/bookings/${created.json.id}/status`, {
        body: { status: 'cancelled' },
        token: branchAdminToken,
      });
      expect(forbidden.status).toBe(403);
      const unchanged = await prisma.booking.findUnique({ where: { id: created.json.id } });
      expect(unchanged?.status).toBe('confirmed');

      const invalid = await http(baseUrl, 'PATCH', `/admin/bookings/${created.json.id}/status`, {
        body: { status: 'huy' },
        token: adminToken,
      });
      expect(invalid.status).toBe(400);
    });

    it('tra cứu công khai theo SĐT không trả về PII của khách (không tên/email/SĐT)', async () => {
      const phone = '0905999888';
      const date = vnDate(13);
      const slots = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=${stylistId}&service_id=${serviceId}&date=${date}`)).json;
      await http(baseUrl, 'POST', '/bookings', {
        body: {
          branch_id: branchId,
          service_id: serviceId,
          stylist_id: stylistId,
          start_time: slots[0].start_time,
          customer_name: 'Khách Riêng Tư',
          customer_phone: phone,
          customer_email: 'rieng.tu@example.com',
        },
      });

      const result = await http(baseUrl, 'GET', `/bookings?phone=${phone}`);
      expect(result.status).toBe(200);
      const raw = JSON.stringify(result.json);
      expect(raw).not.toContain('rieng.tu@example.com');
      expect(raw).not.toContain(phone);
      expect(raw).not.toContain('Khách Riêng Tư');
      expect(result.json.every((booking: any) => booking.customer === undefined)).toBe(true);
      // Vẫn đủ dữ liệu để khách tự tra cứu lịch của mình
      expect(result.json[0].id).toBeTruthy();
      expect(result.json[0].start_time).toBeTruthy();
    });

    it('LOYALTY RACE: hai lịch đồng thời của cùng khách đủ điều kiện → chỉ một lịch được giảm giá', async () => {
      const phone = '0907654321';
      const existing = await prisma.customer.findUnique({ where: { phone } });
      if (existing) await prisma.loyaltyTransaction.deleteMany({ where: { customerId: existing.id } });
      await prisma.customer.upsert({
        where: { phone },
        update: { completedBookings: 10, loyaltyDiscountUsedAt: null },
        create: { name: 'Khách Đua Loyalty', phone, completedBookings: 10, loyaltyDiscountUsedAt: null },
      });

      const date = vnDate(14);
      const slotsA = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=stylist-1-1&service_id=${serviceId}&date=${date}`)).json;
      const slotsB = (await http(baseUrl, 'GET', `/slots?branch_id=${branchId}&stylist_id=stylist-1-2&service_id=${serviceId}&date=${date}`)).json;

      const body = (stylist: string, startTime: string) => ({
        branch_id: branchId,
        service_id: serviceId,
        stylist_id: stylist,
        start_time: startTime,
        customer_name: 'Khách Đua Loyalty',
        customer_phone: phone,
      });

      const [a, b] = await Promise.all([
        http(baseUrl, 'POST', '/bookings', { body: body('stylist-1-1', slotsA[0].start_time) }),
        http(baseUrl, 'POST', '/bookings', { body: body('stylist-1-2', slotsB[0].start_time) }),
      ]);

      expect([a.status, b.status]).toEqual([201, 201]);
      const discounts = [a, b].map((response) => Number(response.json.discount_amount));
      expect(discounts.filter((value) => value > 0)).toHaveLength(1);

      const redeemRows = await prisma.loyaltyTransaction.count({ where: { customer: { phone }, type: 'redeem' } });
      expect(redeemRows).toBe(1);
    });
  });

  it('tài khoản seed đăng nhập được và đúng role', async () => {
    const branchAdmin = await http(baseUrl, 'POST', '/auth/login', { body: { email: 'branch1@booking.vn', password: 'branch12345' } });
    expect(branchAdmin.status).toBe(200);
    expect(branchAdmin.json.user.role).toBe('branch_admin');
    expect(branchAdmin.json.user.branch_id).toBe('branch-1');

    const stylist = await http(baseUrl, 'POST', '/auth/login', { body: { email: 'stylist1@booking.vn', password: 'stylist12345' } });
    expect(stylist.status).toBe(200);
    expect(stylist.json.user.role).toBe('stylist');

    const wrong = await http(baseUrl, 'POST', '/auth/login', { body: { email: 'admin@booking.vn', password: 'sai-mat-khau' } });
    expect(wrong.status).toBe(401);
    expect(String(wrong.json.error ?? wrong.json.message)).toMatch(/mật khẩu|không đúng/i);
  });

  it('stylist xem được lịch cá nhân của mình (mobile page §2.7)', async () => {
    const token = await login(baseUrl, 'stylist1@booking.vn', 'stylist12345');
    const me = await http(baseUrl, 'GET', '/stylist/me', { token });
    expect(me.status).toBe(200);
    expect(me.json.id).toBe(stylistId);

    const bookings = await http(baseUrl, 'GET', '/stylist/me/bookings', { token });
    expect(bookings.status).toBe(200);
    expect(Array.isArray(bookings.json)).toBe(true);

    // Stylist không được vào dashboard admin
    const forbidden = await http(baseUrl, 'GET', '/admin/revenue', { token });
    expect(forbidden.status).toBe(403);
  });

  it('không có thông tin bí mật nào bị trả về qua API công khai', async () => {
    const booking = await prisma.booking.findFirst({ orderBy: { createdAt: 'desc' } });
    const result = await http(baseUrl, 'GET', `/bookings/${booking!.id}`);
    const raw = JSON.stringify(result.json).toLowerCase();
    for (const field of SUSPICIOUS_FIELDS.map((item) => item.replace('_', ''))) {
      expect(raw).not.toContain(field);
    }
    expect(result.headers.get('x-request-id')).toBeTruthy();
  });

  it('hash mật khẩu trong DB dùng bcrypt (không lưu mật khẩu thô)', async () => {
    const user = await prisma.user.findUnique({ where: { email: 'admin@booking.vn' } });
    expect(user?.passwordHash.startsWith('$2')).toBe(true);
    expect(user?.passwordHash).not.toContain('admin12345');
    expect(await bcrypt.compare('admin12345', user!.passwordHash)).toBe(true);
  });

  // Đặt CUỐI cùng: bài kiểm tra này tiêu tốn hạn mức của /auth/login trong cửa sổ 60s.
  it('giả mạo header IP không tách được bucket rate limit (mặc định chỉ tin địa chỉ socket)', async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 26; index += 1) {
      const response = await http(baseUrl, 'POST', '/auth/login', {
        body: { email: 'khong-ton-tai@booking.vn', password: 'sai-mat-khau' },
        headers: { 'X-Real-IP': `10.1.0.${index}`, 'X-Forwarded-For': `10.2.0.${index}` },
      });
      statuses.push(response.status);
    }
    const allowed = statuses.filter((status) => status === 401).length;
    expect(allowed).toBeLessThanOrEqual(20);
    expect(statuses).toContain(429);
  });
});
