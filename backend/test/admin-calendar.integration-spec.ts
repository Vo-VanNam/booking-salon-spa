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
import { BookingStatus, DepositStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from './../src/prisma/prisma.service';
import { VN_TIMEZONE } from './../src/time/time.service';
import { FIXTURE } from './setup-integration';

const RANGE_TOO_LONG_MESSAGE = 'Khoảng thời gian quá dài, tối đa 62 ngày';
const INVALID_DATE_MESSAGE = 'Ngày không hợp lệ';
const INVALID_GROUPBY_MESSAGE = 'Tham số groupBy không hợp lệ';
const STYLIST_NOT_IN_BRANCH_MESSAGE = 'Stylist không thuộc chi nhánh này';

describe('GET /api/admin/calendar + /api/admin/revenue (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let branchA: { id: string };
  let branchB: { id: string };
  let serviceA: { id: string };
  let stylistA: { id: string };
  let customer: { id: string };

  const api = () => request(app.getHttpServer());

  const login = async (
    phoneOrEmail: string,
    password: string,
  ): Promise<string> => {
    const res = await api()
      .post('/api/auth/login')
      .send({ phoneOrEmail, password })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  };

  const vnDate = (d: DateTime): string =>
    d.setZone(VN_TIMEZONE).toFormat('yyyy-MM-dd');
  const vnDateStr = (dayOffset: number): string =>
    vnDate(DateTime.now().setZone(VN_TIMEZONE).plus({ days: dayOffset }));

  // Slot cách giờ hiện tại (VN) >= 24h, trong giờ làm việc 09:00-20:00.
  function safeFutureSlotVn(): string {
    let dt = DateTime.now()
      .setZone(VN_TIMEZONE)
      .plus({ hours: 30 })
      .set({ minute: 0, second: 0, millisecond: 0 });
    if (dt.hour < 9) dt = dt.set({ hour: 10 });
    if (dt.hour >= 20) dt = dt.set({ hour: 10 }).plus({ days: 1 });
    return dt.toUTC().toISO()!;
  }

  const bookSlot = (token: string, startTime: string) =>
    api()
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId: branchA.id,
        serviceId: serviceA.id,
        stylistId: stylistA.id,
        startTime,
      })
      .expect(201)
      .then(
        (res) => res.body as { id: string; startTime: string; status: string },
      );

  const createDirectBooking = (data: {
    branchId: string;
    serviceId: string;
    stylistId: string;
    startTime: string;
    status: BookingStatus;
    priceAtBooking: number;
    depositAmount?: number;
    depositStatus?: DepositStatus;
  }) =>
    prisma.booking.create({
      data: {
        branchId: data.branchId,
        serviceId: data.serviceId,
        stylistId: data.stylistId,
        customerId: customer.id,
        startTime: data.startTime,
        endTime: DateTime.fromISO(data.startTime)
          .plus({ minutes: 30 })
          .toISO()!,
        status: data.status,
        priceAtBooking: data.priceAtBooking,
        depositAmount: data.depositAmount ?? 0,
        depositStatus: data.depositStatus ?? DepositStatus.none,
      },
    });

  const vnDateTime = (dayOffset: number, hour: number): string =>
    DateTime.now()
      .setZone(VN_TIMEZONE)
      .plus({ days: dayOffset })
      .set({ hour, minute: 0, second: 0, millisecond: 0 })
      .toUTC()
      .toISO()!;

  let serviceB: { id: string };
  let stylistB: { id: string };

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

    branchA = await prisma.branch.findFirstOrThrow({
      where: { name: 'Chi nhánh Test' },
    });
    branchB = await prisma.branch.findFirstOrThrow({
      where: { name: 'Chi nhánh Test 2' },
    });
    serviceA = await prisma.service.findFirstOrThrow({
      where: { branchId: branchA.id },
    });
    stylistA = await prisma.stylist.findFirstOrThrow({
      where: { name: 'Stylist Test' },
    });
    customer = await prisma.customer.findFirstOrThrow();

    // Branch B chưa có service/stylist trong fixture — tạo để test scoping.
    serviceB = await prisma.service.create({
      data: {
        branchId: branchB.id,
        name: 'Dịch vụ Test Branch B',
        price: 100000,
        durationMinutes: 30,
      },
    });
    stylistB = await prisma.stylist.create({
      data: {
        branchId: branchB.id,
        name: 'Stylist Test B',
        phone: '0901234777',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('calendar: trả booking trong khoảng (kể cả cancelled), sắp theo startTime, đủ thông tin stylist/service/customer', async () => {
    const customerToken = await login(
      FIXTURE.customerPhone,
      FIXTURE.customerPassword,
    );
    const superToken = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );

    const slotA = safeFutureSlotVn();
    const slotB = DateTime.fromISO(slotA)
      .plus({ minutes: 30 })
      .toUTC()
      .toISO()!;
    const slotC = DateTime.fromISO(slotA)
      .plus({ minutes: 60 })
      .toUTC()
      .toISO()!;
    const a = await bookSlot(customerToken, slotA);
    const b = await bookSlot(customerToken, slotB);
    const c = await bookSlot(customerToken, slotC);
    // Hủy booking c qua API → calendar vẫn phải hiển thị (status cancelled).
    await api()
      .patch(`/api/bookings/${c.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({})
      .expect(200);

    const from = vnDate(DateTime.fromISO(slotA));
    const to = from;
    const res = await api()
      .get('/api/admin/calendar')
      .set('Authorization', `Bearer ${superToken}`)
      .query({ branchId: branchA.id, from, to })
      .expect(200);
    const { bookings } = res.body as {
      bookings: {
        id: string;
        startTime: string;
        status: string;
        branchId: string;
        stylist: { id: string; name: string };
        service: {
          id: string;
          name: string;
          durationMinutes: number;
          price: number;
        };
        customer: { id: string; name: string; phone: string };
      }[];
    };
    const ids = bookings.map((bk) => bk.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids).toContain(c.id);
    const cancelled = bookings.find((bk) => bk.id === c.id);
    expect(cancelled?.status).toBe('cancelled');
    // Sắp xếp tăng dần theo startTime.
    const times = bookings.map((bk) => new Date(bk.startTime).getTime());
    expect([...times].sort((x, y) => x - y)).toEqual(times);
    for (const bk of bookings) {
      expect(bk.stylist.name).toBeDefined();
      expect(bk.service.name).toBeDefined();
      expect(bk.customer.phone).toBeDefined();
      expect(bk.branchId).toBe(branchA.id);
    }
  });

  it('calendar: branch_admin A gửi branchId của branch B → vẫn chỉ thấy branch A; super_admin thấy được branch B', async () => {
    const branchAdminAToken = await login(
      FIXTURE.branchAdminPhone,
      FIXTURE.branchAdminPassword,
    );
    const superToken = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );
    const customerToken = await login(
      FIXTURE.customerPhone,
      FIXTURE.customerPassword,
    );

    const slotA = safeFutureSlotVn();
    const a = await bookSlot(customerToken, slotA);
    const bookingB = await createDirectBooking({
      branchId: branchB.id,
      serviceId: serviceB.id,
      stylistId: stylistB.id,
      startTime: vnDateTime(1, 10),
      status: BookingStatus.confirmed,
      priceAtBooking: 100000,
    });

    const from = vnDateStr(0);
    const to = vnDate(DateTime.fromISO(slotA));
    const res = await api()
      .get('/api/admin/calendar')
      .set('Authorization', `Bearer ${branchAdminAToken}`)
      .query({ branchId: branchB.id, from, to })
      .expect(200);
    const idsA = (res.body as { bookings: { id: string; branchId: string }[] })
      .bookings;
    expect(idsA.map((bk) => bk.id)).toContain(a.id);
    expect(idsA.map((bk) => bk.id)).not.toContain(bookingB.id);
    expect(idsA.every((bk) => bk.branchId === branchA.id)).toBe(true);

    const resSuper = await api()
      .get('/api/admin/calendar')
      .set('Authorization', `Bearer ${superToken}`)
      .query({ branchId: branchB.id, from, to })
      .expect(200);
    const idsB = (resSuper.body as { bookings: { id: string }[] }).bookings;
    expect(idsB.map((bk) => bk.id)).toContain(bookingB.id);
  });

  it('calendar: validate ngày (format, from > to, > 62 ngày), stylist khác branch, customer → 403', async () => {
    const superToken = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );
    const customerToken = await login(
      FIXTURE.customerPhone,
      FIXTURE.customerPassword,
    );
    const today = vnDateStr(0);
    const tomorrow = vnDateStr(1);

    const badFormat = await api()
      .get('/api/admin/calendar')
      .set('Authorization', `Bearer ${superToken}`)
      .query({ branchId: branchA.id, from: '07-08-2026', to: today });
    expect(badFormat.status).toBe(400);
    expect((badFormat.body as { message: string }).message).toBe(
      INVALID_DATE_MESSAGE,
    );

    const inverted = await api()
      .get('/api/admin/calendar')
      .set('Authorization', `Bearer ${superToken}`)
      .query({ branchId: branchA.id, from: tomorrow, to: today });
    expect(inverted.status).toBe(400);
    expect((inverted.body as { message: string }).message).toBe(
      'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
    );

    const tooLong = await api()
      .get('/api/admin/calendar')
      .set('Authorization', `Bearer ${superToken}`)
      .query({ branchId: branchA.id, from: vnDateStr(-90), to: tomorrow });
    expect(tooLong.status).toBe(400);
    expect((tooLong.body as { message: string }).message).toBe(
      RANGE_TOO_LONG_MESSAGE,
    );

    const stylistOtherBranch = await api()
      .get('/api/admin/calendar')
      .set('Authorization', `Bearer ${superToken}`)
      .query({
        branchId: branchA.id,
        from: today,
        to: tomorrow,
        stylistId: stylistB.id,
      });
    expect(stylistOtherBranch.status).toBe(400);
    expect((stylistOtherBranch.body as { message: string }).message).toBe(
      STYLIST_NOT_IN_BRANCH_MESSAGE,
    );

    await api()
      .get('/api/admin/calendar')
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ branchId: branchA.id, from: today, to: tomorrow })
      .expect(403);
  });

  it('revenue: completed có cọc đã thu + cancelled → rows/summary đúng số', async () => {
    const superToken = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );
    const today = vnDateStr(0);

    await createDirectBooking({
      branchId: branchA.id,
      serviceId: serviceA.id,
      stylistId: stylistA.id,
      startTime: vnDateTime(0, 10),
      status: BookingStatus.completed,
      priceAtBooking: 150000,
      depositAmount: 50000,
      depositStatus: DepositStatus.paid,
    });
    await createDirectBooking({
      branchId: branchA.id,
      serviceId: serviceA.id,
      stylistId: stylistA.id,
      startTime: vnDateTime(0, 11),
      status: BookingStatus.cancelled,
      priceAtBooking: 150000,
    });

    const res = await api()
      .get('/api/admin/revenue')
      .set('Authorization', `Bearer ${superToken}`)
      .query({ branchId: branchA.id, from: today, to: today, groupBy: 'day' })
      .expect(200);
    const body = res.body as {
      rows: {
        period: string;
        depositCollected: number;
        counterPaid: number;
        total: number;
        bookingCount: number;
        completedCount: number;
        cancelledCount: number;
      }[];
      summary: {
        depositCollected: number;
        counterPaid: number;
        total: number;
        bookingCount: number;
        completedCount: number;
        cancelledCount: number;
      };
    };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].period).toBe(today);
    expect(body.rows[0]).toMatchObject({
      depositCollected: 50000,
      counterPaid: 100000,
      total: 150000,
      bookingCount: 1,
      completedCount: 1,
      cancelledCount: 1,
    });
    expect(body.summary).toMatchObject({
      depositCollected: 50000,
      counterPaid: 100000,
      total: 150000,
      bookingCount: 1,
      completedCount: 1,
      cancelledCount: 1,
    });
  });

  it('revenue: groupBy month gộp đúng kỳ yyyy-MM, summary giống groupBy day', async () => {
    const superToken = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );

    await createDirectBooking({
      branchId: branchA.id,
      serviceId: serviceA.id,
      stylistId: stylistA.id,
      startTime: vnDateTime(0, 10),
      status: BookingStatus.completed,
      priceAtBooking: 150000,
    });
    // 45 ngày trước chắc chắn khác tháng hiện tại.
    await createDirectBooking({
      branchId: branchA.id,
      serviceId: serviceA.id,
      stylistId: stylistA.id,
      startTime: vnDateTime(-45, 10),
      status: BookingStatus.completed,
      priceAtBooking: 200000,
    });

    const from = vnDateStr(-60);
    const to = vnDateStr(1);
    const byMonth = await api()
      .get('/api/admin/revenue')
      .set('Authorization', `Bearer ${superToken}`)
      .query({ branchId: branchA.id, from, to, groupBy: 'month' })
      .expect(200);
    const monthBody = byMonth.body as {
      rows: { period: string; total: number }[];
      summary: { total: number };
    };
    expect(monthBody.rows.length).toBeGreaterThanOrEqual(2);
    expect(monthBody.rows.every((r) => /^\d{4}-\d{2}$/.test(r.period))).toBe(
      true,
    );
    expect(monthBody.summary.total).toBe(350000);

    const byDay = await api()
      .get('/api/admin/revenue')
      .set('Authorization', `Bearer ${superToken}`)
      .query({ branchId: branchA.id, from, to, groupBy: 'day' })
      .expect(200);
    const dayBody = byDay.body as {
      rows: { period: string }[];
      summary: { total: number };
    };
    expect(dayBody.rows.length).toBeGreaterThanOrEqual(2);
    expect(
      dayBody.rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.period)),
    ).toBe(true);
    expect(dayBody.summary.total).toBe(monthBody.summary.total);
  });

  it('revenue: groupBy không hợp lệ → 400; mặc định groupBy = day', async () => {
    const superToken = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );
    const today = vnDateStr(0);

    const badGroupBy = await api()
      .get('/api/admin/revenue')
      .set('Authorization', `Bearer ${superToken}`)
      .query({ branchId: branchA.id, from: today, to: today, groupBy: 'week' });
    expect(badGroupBy.status).toBe(400);
    expect((badGroupBy.body as { message: string }).message).toBe(
      INVALID_GROUPBY_MESSAGE,
    );

    const noGroupBy = await api()
      .get('/api/admin/revenue')
      .set('Authorization', `Bearer ${superToken}`)
      .query({ branchId: branchA.id, from: today, to: today })
      .expect(200);
    expect(
      (noGroupBy.body as { rows: { period: string }[] }).rows.every((r) =>
        /^\d{4}-\d{2}-\d{2}$/.test(r.period),
      ),
    ).toBe(true);
  });
});
