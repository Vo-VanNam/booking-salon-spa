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
import { BookingStatus, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import { DateTime } from 'luxon';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from './../src/prisma/prisma.service';
import { VN_TIMEZONE } from './../src/time/time.service';
import { FIXTURE } from './setup-integration';

// Stylist thứ 2 để kiểm tra cô lập dữ liệu giữa các stylist.
const STYLIST2_PHONE = '0955111222';
const STYLIST2_PASSWORD = 'Stylist2@123';

interface MeResponse {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  branch: {
    id: string;
    name: string;
    address: string;
    openTime: string;
    closeTime: string;
  };
  workingHours: { dayOfWeek: number; startTime: string; endTime: string }[];
  timeOffs: {
    id: string;
    startTime: string;
    endTime: string;
    reason: string | null;
  }[];
}

interface BookingItem {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  branchId: string;
  note: string | null;
  service: { name: string; durationMinutes: number; price: number };
  customer: { name: string; phone: string };
}

describe('Stylist (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let stylistAId: string;
  let stylistBId: string;

  const api = () => request(app.getHttpServer());

  const login = async (
    phoneOrEmail: string,
    password: string,
  ): Promise<{ accessToken: string }> => {
    const res = await api()
      .post('/api/auth/login')
      .send({ phoneOrEmail, password })
      .expect(200);
    return res.body as { accessToken: string };
  };

  const todayStr = () =>
    DateTime.now().setZone(VN_TIMEZONE).toFormat('yyyy-MM-dd');
  const plusDaysStr = (n: number) =>
    DateTime.now()
      .setZone(VN_TIMEZONE)
      .plus({ days: n })
      .toFormat('yyyy-MM-dd');

  // Giờ VN của ngày hôm nay + offset ngày, quy về UTC cho DB.
  const vnTime = (dayOffset: number, hour: number, minute = 0): Date =>
    DateTime.now()
      .setZone(VN_TIMEZONE)
      .plus({ days: dayOffset })
      .set({ hour, minute, second: 0, millisecond: 0 })
      .toUTC()
      .toJSDate();

  async function createBooking(stylistId: string, start: Date, end: Date) {
    return prisma.booking.create({
      data: {
        branchId: (await prisma.branch.findFirstOrThrow()).id,
        serviceId: (await prisma.service.findFirstOrThrow()).id,
        stylistId,
        customerId: (await prisma.customer.findFirstOrThrow()).id,
        startTime: start,
        endTime: end,
        status: BookingStatus.confirmed,
        priceAtBooking: 150000,
      },
    });
  }

  beforeAll(async () => {
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

    // Stylist A = stylist fixture có sẵn (đã có user trong setup-integration).
    const stylistA = await prisma.stylist.findFirstOrThrow();
    stylistAId = stylistA.id;

    // Stylist B: tạo stylist + user để test cô lập dữ liệu.
    const stylistB = await prisma.stylist.create({
      data: {
        branchId: stylistA.branchId,
        name: 'Stylist B',
        phone: '0901234888',
      },
    });
    stylistBId = stylistB.id;
    await prisma.user.create({
      data: {
        phone: STYLIST2_PHONE,
        passwordHash: await argon2.hash(STYLIST2_PASSWORD),
        role: UserRole.stylist,
        stylistId: stylistB.id,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /me với token stylist → 200 kèm branch, workingHours (7 ngày), timeOffs', async () => {
    const { accessToken } = await login(
      FIXTURE.stylistPhone,
      FIXTURE.stylistPassword,
    );
    const res = await api()
      .get('/api/stylist/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const body = res.body as MeResponse;
    expect(body).toMatchObject({
      id: stylistAId,
      name: 'Stylist Test',
      phone: '0901234999',
      branch: {
        name: 'Chi nhánh Test',
        openTime: '09:00',
        closeTime: '22:00',
      },
    });
    expect(body.workingHours).toHaveLength(7);
    expect(body.workingHours[0]).toEqual({
      dayOfWeek: 0,
      startTime: '09:00',
      endTime: '21:00',
    });
    expect(body.timeOffs).toEqual([]);
  });

  it('GET /me với token khách → 403', async () => {
    const { accessToken } = await login(
      FIXTURE.customerPhone,
      FIXTURE.customerPassword,
    );
    await api()
      .get('/api/stylist/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('GET /me không token → 401 (guard chặn)', async () => {
    await api().get('/api/stylist/me').expect(401);
  });

  it('bookings: stylist chỉ thấy booking của mình, có phone khách, sắp theo startTime', async () => {
    const bookingA = await createBooking(
      stylistAId,
      vnTime(1, 10, 0),
      vnTime(1, 10, 30),
    );
    await createBooking(stylistBId, vnTime(1, 11, 0), vnTime(1, 11, 30));
    // Booking của stylist A ngoài khoảng [hôm nay, +2 ngày]
    await createBooking(stylistAId, vnTime(7, 9, 0), vnTime(7, 9, 30));

    const { accessToken } = await login(
      FIXTURE.stylistPhone,
      FIXTURE.stylistPassword,
    );
    const res = await api()
      .get(`/api/stylist/me/bookings?from=${todayStr()}&to=${plusDaysStr(2)}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const body = res.body as BookingItem[];
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: bookingA.id,
      status: 'confirmed',
      service: {
        name: 'Dịch vụ Test 30 phút',
        durationMinutes: 30,
        price: 150000,
      },
      customer: { name: 'Khách Test', phone: FIXTURE.customerPhone },
    });
    expect(body[0].branchId).toMatch(/.+/);
    expect(body[0].note).toBeNull();
  });

  it('bookings: stylist khác chỉ thấy booking của chính mình', async () => {
    await createBooking(stylistAId, vnTime(1, 10, 0), vnTime(1, 10, 30));
    const bookingB = await createBooking(
      stylistBId,
      vnTime(1, 11, 0),
      vnTime(1, 11, 30),
    );

    const { accessToken } = await login(STYLIST2_PHONE, STYLIST2_PASSWORD);
    const res = await api()
      .get(`/api/stylist/me/bookings?from=${todayStr()}&to=${plusDaysStr(2)}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const body = res.body as BookingItem[];
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(bookingB.id);
  });

  it('bookings: thiếu from/to hoặc sai định dạng → 400 "Ngày không hợp lệ"', async () => {
    const { accessToken } = await login(
      FIXTURE.stylistPhone,
      FIXTURE.stylistPassword,
    );
    const auth = { Authorization: `Bearer ${accessToken}` };
    const missing = await api()
      .get('/api/stylist/me/bookings')
      .set(auth)
      .expect(400);
    // Thiếu cả 2 tham số → ValidationPipe báo lỗi từng field, filter join bằng '; '
    expect((missing.body as { message: string }).message).toContain(
      'Ngày không hợp lệ',
    );
    const missingTo = await api()
      .get(`/api/stylist/me/bookings?from=${todayStr()}`)
      .set(auth)
      .expect(400);
    expect((missingTo.body as { message: string }).message).toBe(
      'Ngày không hợp lệ',
    );
    const badFormat = await api()
      .get('/api/stylist/me/bookings?from=07/08/2026&to=2026-08-09')
      .set(auth)
      .expect(400);
    expect((badFormat.body as { message: string }).message).toBe(
      'Ngày không hợp lệ',
    );
    const badDate = await api()
      .get('/api/stylist/me/bookings?from=2026-13-45&to=2026-08-09')
      .set(auth)
      .expect(400);
    expect((badDate.body as { message: string }).message).toBe(
      'Ngày không hợp lệ',
    );
  });

  it('GET /today → chỉ booking hôm nay của stylist (VN)', async () => {
    await createBooking(stylistAId, vnTime(0, 10, 0), vnTime(0, 10, 30));
    await createBooking(stylistAId, vnTime(1, 10, 0), vnTime(1, 10, 30));

    const { accessToken } = await login(
      FIXTURE.stylistPhone,
      FIXTURE.stylistPassword,
    );
    const res = await api()
      .get('/api/stylist/me/today')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const body = res.body as BookingItem[];
    expect(body).toHaveLength(1);
    expect(body[0].customer.phone).toBe(FIXTURE.customerPhone);
  });

  it('GET /me: timeOffs chỉ từ hôm nay trở đi, kèm reason', async () => {
    const futureStart = vnTime(3, 14, 0);
    const futureEnd = vnTime(3, 16, 0);
    const pastStart = vnTime(-5, 14, 0);
    const pastEnd = vnTime(-5, 16, 0);
    await prisma.timeOff.create({
      data: {
        stylistId: stylistAId,
        startTime: futureStart,
        endTime: futureEnd,
        reason: 'Khám bệnh',
      },
    });
    await prisma.timeOff.create({
      data: {
        stylistId: stylistAId,
        startTime: pastStart,
        endTime: pastEnd,
        reason: 'Nghỉ phép cũ',
      },
    });

    const { accessToken } = await login(
      FIXTURE.stylistPhone,
      FIXTURE.stylistPassword,
    );
    const res = await api()
      .get('/api/stylist/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const body = res.body as MeResponse;
    expect(body.timeOffs).toHaveLength(1);
    expect(body.timeOffs[0]).toMatchObject({
      reason: 'Khám bệnh',
      startTime: futureStart.toISOString(),
      endTime: futureEnd.toISOString(),
    });
  });
});
