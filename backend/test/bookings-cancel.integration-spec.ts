// BẮT BUỘC: ép env DB test TRƯỚC khi AppModule được import — giống race spec.
process.env.DATABASE_URL =
  'postgresql://salon:salon_dev_password@localhost:5432/booking_test?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET =
  'integration-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET =
  'integration-refresh-secret-at-least-32-characters-long';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import Redis from 'ioredis';
import { DateTime } from 'luxon';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from './../src/prisma/prisma.service';
import { VN_TIMEZONE } from './../src/time/time.service';
import { FIXTURE } from './setup-integration';

const CONFLICT_MESSAGE =
  'Khung giờ này đã có lịch hẹn khác, vui lòng chọn khung giờ khác';
const CANCEL_24H_MESSAGE =
  'Không thể hủy lịch hẹn trong vòng 24 giờ trước giờ hẹn. Vui lòng liên hệ salon để được hỗ trợ.';
const NO_PERMISSION_MESSAGE = 'Bạn không có quyền thao tác lịch hẹn này';
const OTHER_CUSTOMER_PHONE = '0903334444';

// Slot cách giờ hiện tại (VN) >= 24h, nằm trong giờ làm việc 09:00-19:00 để
// còn chỗ dời +60 phút — tránh flaky theo giờ chạy test.
function safeFutureSlotVn(): string {
  let dt = DateTime.now()
    .setZone(VN_TIMEZONE)
    .plus({ hours: 30 })
    .set({ minute: 0, second: 0, millisecond: 0 });
  if (dt.hour < 9) dt = dt.set({ hour: 10 });
  if (dt.hour >= 20) dt = dt.set({ hour: 10 }).plus({ days: 1 });
  return dt.toUTC().toISO()!;
}

// Slot cách giờ hiện tại < 24h nhưng luôn trong giờ làm việc 09:00-20:00.
function nearSlotVn(): string {
  for (let h = 23; h >= 1; h--) {
    const dt = DateTime.now()
      .setZone(VN_TIMEZONE)
      .plus({ hours: h })
      .set({ minute: 0, second: 0, millisecond: 0 });
    if (dt.hour >= 9 && dt.hour <= 20) return dt.toUTC().toISO()!;
  }
  throw new Error('Không tìm được slot gần');
}

describe('PATCH /api/bookings/:id/cancel + /reschedule (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: Redis;
  let branchId: string;
  let serviceId30: string;
  let stylistId: string;
  let customerToken: string;
  let branchAdminToken: string;

  beforeAll(async () => {
    const p = new PrismaClient();
    const existing = await p.customer.findUnique({
      where: { phone: OTHER_CUSTOMER_PHONE },
    });
    if (!existing) {
      const other = await p.customer.create({
        data: { name: 'Khách Khác', phone: OTHER_CUSTOMER_PHONE },
      });
      await p.user.create({
        data: {
          phone: OTHER_CUSTOMER_PHONE,
          passwordHash: await argon2.hash('Other@123'),
          role: UserRole.customer,
          customerId: other.id,
        },
      });
    }
    await p.$disconnect();
    redis = new Redis('redis://localhost:6379');
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    branchId = (await prisma.branch.findFirstOrThrow()).id;
    serviceId30 = (
      await prisma.service.findFirstOrThrow({ where: { durationMinutes: 30 } })
    ).id;
    stylistId = (await prisma.stylist.findFirstOrThrow()).id;

    const login = async (phoneOrEmail: string, password: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ phoneOrEmail, password })
        .expect(200);
      return (res.body as { accessToken: string }).accessToken;
    };
    customerToken = await login(
      FIXTURE.customerPhone,
      FIXTURE.customerPassword,
    );
    branchAdminToken = await login(
      FIXTURE.branchAdminPhone,
      FIXTURE.branchAdminPassword,
    );
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await redis.quit();
  });

  const bookSlot = (startTime: string, token = customerToken) =>
    request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId, serviceId: serviceId30, stylistId, startTime })
      .expect(201)
      .then(
        (res) => res.body as { id: string; startTime: string; status: string },
      );

  const cancelBooking = (id: string, token = customerToken, reason?: string) =>
    request(app.getHttpServer())
      .patch(`/api/bookings/${id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send(reason !== undefined ? { reason } : {});

  const rescheduleBooking = (
    id: string,
    startTime: string,
    token = customerToken,
  ) =>
    request(app.getHttpServer())
      .patch(`/api/bookings/${id}/reschedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startTime });

  const vnDate = (iso: string) =>
    DateTime.fromISO(iso).setZone(VN_TIMEZONE).toFormat('yyyy-MM-dd');

  // ioredis: SCAN qua scanStream (match pattern), không dùng native scan(cursor)
  const scanSlotKeys = async (stylistId: string, dateStr: string) => {
    const keys: string[] = [];
    const stream = redis.scanStream({
      match: `slots:*:${stylistId}:${dateStr}`,
      count: 100,
    }) as AsyncIterable<string[]>;
    for await (const batch of stream) keys.push(...batch);
    return keys;
  };

  it('Test 1 — đặt booking >= 24h → cancel 200 + status cancelled + cancelledAt + cache slot bị invalidate', async () => {
    const booking = await bookSlot(safeFutureSlotVn());
    const dateStr = vnDate(booking.startTime);

    await request(app.getHttpServer())
      .get(`/api/stylists/${stylistId}/slots`)
      .query({ branchId, date: dateStr, durationMinutes: 30 })
      .expect(200);
    expect(await scanSlotKeys(stylistId, dateStr)).toHaveLength(1);

    const res = await cancelBooking(booking.id).expect(200);
    expect((res.body as { status: string }).status).toBe('cancelled');
    expect(
      (res.body as { cancelledAt: string | null }).cancelledAt,
    ).not.toBeNull();

    const db = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(db.status).toBe('cancelled');
    expect(db.cancelledAt).not.toBeNull();
    expect(await scanSlotKeys(stylistId, dateStr)).toHaveLength(0);
  });

  it('Test 2 — cancel lần 2 → 409 "Lịch hẹn đã bị hủy"', async () => {
    const booking = await bookSlot(safeFutureSlotVn());
    await cancelBooking(booking.id).expect(200);
    const res = await cancelBooking(booking.id);
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toBe(
      'Lịch hẹn đã bị hủy',
    );
  });

  it('Test 3 — booking < 24h: khách cancel → 409 đúng message; branch_admin cancel → 200', async () => {
    const booking = await bookSlot(nearSlotVn());
    const res = await cancelBooking(booking.id);
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toBe(CANCEL_24H_MESSAGE);

    const adminRes = await cancelBooking(
      booking.id,
      branchAdminToken,
      'Hỗ trợ khách',
    );
    expect(adminRes.status).toBe(200);
    expect((adminRes.body as { status: string }).status).toBe('cancelled');
  });

  it('Test 4 — reschedule sang slot trùng (booking khác đã tồn tại) → 409', async () => {
    const slotA = safeFutureSlotVn();
    const slotB = DateTime.fromISO(slotA)
      .plus({ minutes: 30 })
      .toUTC()
      .toISO()!;
    const a = await bookSlot(slotA);
    await bookSlot(slotB);

    const res = await rescheduleBooking(a.id, slotB);
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toBe(CONFLICT_MESSAGE);

    const db = await prisma.booking.findUniqueOrThrow({ where: { id: a.id } });
    expect(new Date(db.startTime).getTime()).toBe(new Date(slotA).getTime());
  });

  it('Test 5 — reschedule sang slot trống → 200 + startTime mới + cache cả 2 ngày bị invalidate', async () => {
    const slotA = safeFutureSlotVn();
    const newSlot = DateTime.fromISO(slotA)
      .plus({ minutes: 60 })
      .toUTC()
      .toISO()!;
    const booking = await bookSlot(slotA);
    const dateA = vnDate(booking.startTime);
    const dateNew = vnDate(newSlot);

    await request(app.getHttpServer())
      .get(`/api/stylists/${stylistId}/slots`)
      .query({ branchId, date: dateA, durationMinutes: 30 })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/stylists/${stylistId}/slots`)
      .query({ branchId, date: dateNew, durationMinutes: 30 })
      .expect(200);

    const res = await rescheduleBooking(booking.id, newSlot).expect(200);
    const body = res.body as { startTime: string; endTime: string };
    expect(new Date(body.startTime).getTime()).toBe(
      new Date(newSlot).getTime(),
    );
    expect(new Date(body.endTime).getTime()).toBe(
      new Date(newSlot).getTime() + 30 * 60 * 1000,
    );

    const db = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(new Date(db.startTime).getTime()).toBe(new Date(newSlot).getTime());
    expect(await scanSlotKeys(stylistId, dateA)).toHaveLength(0);
    expect(await scanSlotKeys(stylistId, dateNew)).toHaveLength(0);
  });

  it('Test 6 — cancel booking của khách khác bằng token khách → 403', async () => {
    const booking = await bookSlot(safeFutureSlotVn());
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ phoneOrEmail: OTHER_CUSTOMER_PHONE, password: 'Other@123' })
      .expect(200);
    const otherToken = (loginRes.body as { accessToken: string }).accessToken;

    const res = await cancelBooking(booking.id, otherToken);
    expect(res.status).toBe(403);
    expect((res.body as { message: string }).message).toBe(
      NO_PERMISSION_MESSAGE,
    );

    const db = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(db.status).toBe('confirmed');
  });

  it('Test 7 — PATCH /api/admin/bookings/:id/move booking < 24h bằng branch_admin → 200 (adminOverride)', async () => {
    const booking = await bookSlot(nearSlotVn());
    const newSlot = safeFutureSlotVn();
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/bookings/${booking.id}/move`)
      .set('Authorization', `Bearer ${branchAdminToken}`)
      .send({ startTime: newSlot })
      .expect(200);
    expect(
      new Date((res.body as { startTime: string }).startTime).getTime(),
    ).toBe(new Date(newSlot).getTime());
  });
});
