// BẮT BUỘC: ép env DB test TRƯỚC khi AppModule được import (ConfigModule ưu tiên
// process.env đã có sẵn hơn .env file), đảm bảo PrismaService chỉ chạm booking_test.
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
import { PrismaClient } from '@prisma/client';
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

// Ngày mai lúc HH:mm theo giờ VN → ISO UTC.
function tomorrowVn(hour: number, minute: number): string {
  return DateTime.now()
    .setZone(VN_TIMEZONE)
    .plus({ days: 1 })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toUTC()
    .toISO()!;
}

describe('POST /api/bookings — race condition & ràng buộc slot (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: Redis;
  let branchId: string;
  let serviceId30: string;
  let serviceId120: string;
  let stylistId: string;
  let accessToken: string;

  beforeAll(async () => {
    // Mở rộng fixture: service 120 phút cho test slot sát biên (test 4).
    const p = new PrismaClient();
    const branch = await p.branch.findFirstOrThrow();
    const existing = await p.service.findFirst({
      where: { branchId: branch.id, durationMinutes: 120 },
    });
    if (!existing) {
      await p.service.create({
        data: {
          branchId: branch.id,
          name: 'Dịch vụ Test 120 phút',
          price: 300000,
          durationMinutes: 120,
        },
      });
    }
    await p.$disconnect();
    redis = new Redis('redis://localhost:6379');
  });

  // App mới mỗi test: bộ đếm throttle là in-memory theo instance, tránh test dính
  // giới hạn 20 req/min của POST /bookings khi race test bắn 10 request liên tiếp.
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
    serviceId120 = (
      await prisma.service.findFirstOrThrow({
        where: { durationMinutes: 120 },
      })
    ).id;
    stylistId = (await prisma.stylist.findFirstOrThrow()).id;
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        phoneOrEmail: FIXTURE.customerPhone,
        password: FIXTURE.customerPassword,
      })
      .expect(200);
    accessToken = (login.body as { accessToken: string }).accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await redis.quit();
  });

  const postBooking = (serviceId: string, startTime: string) =>
    request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        serviceId,
        stylistId,
        startTime,
      });

  it('Test 1 — race: 2 request đồng thời cùng slot → đúng 1×201 + 1×409 (lặp 5 lần)', async () => {
    for (let i = 0; i < 5; i++) {
      await prisma.booking.deleteMany();
      await redis.flushdb();

      const slot = tomorrowVn(10, 0);
      const [r1, r2] = await Promise.all([
        postBooking(serviceId30, slot),
        postBooking(serviceId30, slot),
      ]);

      const statuses = [r1.status, r2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);
      const conflict = r1.status === 409 ? r1 : r2;
      expect((conflict.body as { message: string }).message).toBe(
        CONFLICT_MESSAGE,
      );
      expect(await prisma.booking.count()).toBe(1);
    }
  });

  it('Test 2 — 2 request cùng lúc, 2 slot KHÔNG overlap → cả 2 đều 201', async () => {
    const [r1, r2] = await Promise.all([
      postBooking(serviceId30, tomorrowVn(10, 0)),
      postBooking(serviceId30, tomorrowVn(10, 30)),
    ]);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(await prisma.booking.count()).toBe(2);
  });

  it('Test 3 — overlap với booking đã tồn tại → 409; slot kề biên [10:30,11:00) → 201', async () => {
    const r1 = await postBooking(serviceId30, tomorrowVn(10, 0));
    expect(r1.status).toBe(201);

    // [10:15,10:45) cắt [10:00,10:30)
    const r2 = await postBooking(serviceId30, tomorrowVn(10, 15));
    expect(r2.status).toBe(409);
    expect((r2.body as { message: string }).message).toBe(CONFLICT_MESSAGE);

    // [10:30,11:00) không cắt [10:00,10:30)
    const r3 = await postBooking(serviceId30, tomorrowVn(10, 30));
    expect(r3.status).toBe(201);
    expect(await prisma.booking.count()).toBe(2);
  });

  it('Test 4 — slot sát biên giờ làm việc (duration 120): 19:00→21:00 hợp lệ; 19:15→21:15 bị chặn', async () => {
    // 19:00 + 120 = 21:00 đúng khớp hết giờ làm việc của stylist → hợp lệ
    const r1 = await postBooking(serviceId120, tomorrowVn(19, 0));
    expect(r1.status).toBe(201);

    // 19:15 + 120 = 21:15 vượt quá 21:00 (nhưng còn trong giờ mở cửa branch 22:00)
    const r2 = await postBooking(serviceId120, tomorrowVn(19, 15));
    expect(r2.status).toBe(409);
    expect((r2.body as { message: string }).message).toBe(
      'Ngoài giờ làm việc của stylist',
    );
    expect(await prisma.booking.count()).toBe(1);
  });

  it('Test 5 — time_off cắt slot → 409 "Stylist đang nghỉ trong khoảng thời gian này"', async () => {
    const offStart = DateTime.fromISO(tomorrowVn(10, 0));
    await prisma.timeOff.create({
      data: {
        stylistId,
        startTime: offStart.toJSDate(),
        endTime: offStart.plus({ hours: 1 }).toJSDate(),
        reason: 'Nghỉ test',
      },
    });

    const res = await postBooking(serviceId30, tomorrowVn(10, 0));
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toBe(
      'Stylist đang nghỉ trong khoảng thời gian này',
    );
    expect(await prisma.booking.count()).toBe(0);
  });

  it('Test 6 — startTime trong quá khứ (10 phút trước) → 400', async () => {
    const past = DateTime.now()
      .setZone(VN_TIMEZONE)
      .minus({ minutes: 10 })
      .toUTC()
      .toISO()!;
    const res = await postBooking(serviceId30, past);
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe(
      'Thời gian bắt đầu phải ở tương lai',
    );
  });

  it('Test 7 — POST /bookings không token → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/bookings')
      .send({
        branchId,
        serviceId: serviceId30,
        stylistId,
        startTime: tomorrowVn(10, 0),
      });
    expect(res.status).toBe(401);
    expect((res.body as { message: string }).message).toBe(
      'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
    );
  });

  it('Test 8 — POST /bookings kèm customerId trong body → 400 (whitelist)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        serviceId: serviceId30,
        stylistId,
        customerId: 'customer-abc',
        startTime: tomorrowVn(10, 0),
      });
    expect(res.status).toBe(400);
  });
});
