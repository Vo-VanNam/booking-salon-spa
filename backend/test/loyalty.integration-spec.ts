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
import { BookingStatus, LoyaltyType } from '@prisma/client';
import { DateTime } from 'luxon';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { LoyaltyService } from './../src/loyalty/loyalty.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { VN_TIMEZONE } from './../src/time/time.service';
import { FIXTURE } from './setup-integration';

// Slot cách giờ hiện tại (VN) >= 24h, trong giờ làm việc 09:00-19:00 để còn
// chỗ đặt booking thứ 2 (+30 phút) — tránh flaky theo giờ chạy test.
function safeFutureSlotVn(): string {
  let dt = DateTime.now()
    .setZone(VN_TIMEZONE)
    .plus({ hours: 30 })
    .set({ minute: 0, second: 0, millisecond: 0 });
  if (dt.hour < 9) dt = dt.set({ hour: 10 });
  if (dt.hour >= 20) dt = dt.set({ hour: 10 }).plus({ days: 1 });
  return dt.toUTC().toISO()!;
}

describe('Loyalty (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let loyalty: LoyaltyService;
  let branchId: string;
  let serviceId30: string;
  let stylistId: string;
  let customerId: string;
  let customerToken: string;
  let superAdminToken: string;
  let branchAdminToken: string;

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
    loyalty = app.get(LoyaltyService);
    branchId = (await prisma.branch.findFirstOrThrow()).id;
    serviceId30 = (
      await prisma.service.findFirstOrThrow({ where: { durationMinutes: 30 } })
    ).id;
    stylistId = (await prisma.stylist.findFirstOrThrow()).id;
    customerId = (
      await prisma.customer.findFirstOrThrow({
        where: { phone: FIXTURE.customerPhone },
      })
    ).id;

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
    superAdminToken = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );
    branchAdminToken = await login(
      FIXTURE.branchAdminPhone,
      FIXTURE.branchAdminPassword,
    );
  });

  // Mỗi test bắt đầu với điểm loyalty sạch + không còn giao dịch loyalty.
  beforeEach(async () => {
    await prisma.loyaltyTransaction.deleteMany();
    await prisma.customer.updateMany({
      data: { loyaltyPoints: 0, completedCount: 0 },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const bookSlot = (startTime: string, token = customerToken) =>
    request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId, serviceId: serviceId30, stylistId, startTime })
      .expect(201)
      .then(
        (res) =>
          res.body as {
            id: string;
            discountAmount: number;
            status: string;
            startTime: string;
          },
      );

  const changeStatus = (id: string, status: string, token = superAdminToken) =>
    request(app.getHttpServer())
      .patch(`/api/admin/bookings/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status });

  // Booking confirmed đã kết thúc (hôm qua) — điều kiện để chuyển completed.
  const createPastBooking = () => {
    const past = DateTime.now()
      .setZone(VN_TIMEZONE)
      .minus({ days: 1 })
      .set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
    return prisma.booking.create({
      data: {
        branchId,
        serviceId: serviceId30,
        stylistId,
        customerId,
        startTime: past.toUTC().toJSDate(),
        endTime: past.plus({ minutes: 30 }).toUTC().toJSDate(),
        status: BookingStatus.confirmed,
        priceAtBooking: 150000,
      },
    });
  };

  it('Test 1 — khách đủ 100 điểm → booking mới discountAmount = 10%, trừ 100 điểm + 1 tx spend', async () => {
    const slot1 = DateTime.fromISO(safeFutureSlotVn());
    const first = await bookSlot(slot1.toISO()!);
    expect(first.discountAmount).toBe(0);

    await prisma.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: 100 },
    });

    const second = await bookSlot(slot1.plus({ minutes: 30 }).toISO()!);
    expect(second.discountAmount).toBe(15000); // 10% của 150000

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(customer.loyaltyPoints).toBe(0);

    const spends = await prisma.loyaltyTransaction.findMany({
      where: { customerId, type: LoyaltyType.spend },
    });
    expect(spends).toHaveLength(1);
    expect(spends[0]).toMatchObject({
      points: -100,
      bookingId: null,
      reason: 'Áp dụng giảm giá 10% cho lịch hẹn kế tiếp',
      actorType: 'system',
    });
  });

  it('Test 2 — PATCH completed (booking đã kết thúc) → completedCount +1, +10 điểm, tx earn gắn bookingId', async () => {
    const booking = await createPastBooking();

    const res = await changeStatus(booking.id, 'completed').expect(200);
    expect((res.body as { status: string }).status).toBe('completed');

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(customer.completedCount).toBe(1);
    expect(customer.loyaltyPoints).toBe(10);

    const earns = await prisma.loyaltyTransaction.findMany({
      where: { customerId, bookingId: booking.id, type: LoyaltyType.earn },
    });
    expect(earns).toHaveLength(1);
    expect(earns[0]).toMatchObject({
      points: 10,
      reason: 'Hoàn thành lịch hẹn',
      actorType: 'system',
    });
  });

  it('Test 3 — PATCH completed lần 2 → 409, không cộng điểm kép', async () => {
    const booking = await createPastBooking();
    await changeStatus(booking.id, 'completed').expect(200);

    await changeStatus(booking.id, 'completed').expect(409);

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(customer.completedCount).toBe(1);
    expect(customer.loyaltyPoints).toBe(10);
  });

  it('Test 4 — completeOverdueBookings: booking confirmed quá hạn → completed + earn; chạy lại → 0', async () => {
    const overdue = await createPastBooking();

    const first = await loyalty.completeOverdueBookings();
    expect(first).toEqual({ processed: 1, rewarded: 1 });

    const db = await prisma.booking.findUniqueOrThrow({
      where: { id: overdue.id },
    });
    expect(db.status).toBe(BookingStatus.completed);
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(customer.loyaltyPoints).toBe(10);
    expect(customer.completedCount).toBe(1);
    const earns = await prisma.loyaltyTransaction.findMany({
      where: { bookingId: overdue.id, type: LoyaltyType.earn },
    });
    expect(earns).toHaveLength(1);

    const second = await loyalty.completeOverdueBookings();
    expect(second).toEqual({ processed: 0, rewarded: 0 });
  });

  it('Test 5 — PATCH no_show từ confirmed → 200, không có tx earn', async () => {
    const booking = await bookSlot(safeFutureSlotVn());

    const res = await changeStatus(
      booking.id,
      'no_show',
      branchAdminToken,
    ).expect(200);
    expect((res.body as { status: string }).status).toBe('no_show');

    const earns = await prisma.loyaltyTransaction.findMany({
      where: { bookingId: booking.id, type: LoyaltyType.earn },
    });
    expect(earns).toHaveLength(0);
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(customer.loyaltyPoints).toBe(0);
  });
});
