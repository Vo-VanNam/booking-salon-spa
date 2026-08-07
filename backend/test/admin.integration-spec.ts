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
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from './../src/prisma/prisma.service';
import { FIXTURE } from './setup-integration';
import { BookingStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { VN_TIMEZONE } from './../src/time/time.service';

describe('Admin (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let serviceId: string;
  let branchA: { id: string };
  let branchB: { id: string };
  let serviceA: { id: string };
  let stylistA: { id: string };
  let customer: { id: string };

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
  });

  afterAll(async () => {
    await app.close();
  });

  const tomorrowAt = (hour: number, minute = 0): string =>
    DateTime.now()
      .setZone(VN_TIMEZONE)
      .plus({ days: 1 })
      .set({ hour, minute, second: 0, millisecond: 0 })
      .toUTC()
      .toISO()!;

  const createBooking = (
    stylistId: string,
    serviceId: string,
    startISO: string,
  ) =>
    prisma.booking.create({
      data: {
        branchId: branchA.id,
        serviceId,
        stylistId,
        customerId: customer.id,
        startTime: startISO,
        endTime: DateTime.fromISO(startISO).plus({ minutes: 30 }).toISO()!,
        status: BookingStatus.confirmed,
        priceAtBooking: 150000,
      },
    });

  it('super login → POST /api/admin/branches → 201; PATCH → 200; branch_admin không phải super POST branches → 403', async () => {
    const superAdmin = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );
    const createRes = await api()
      .post('/api/admin/branches')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({
        name: 'Chi nhánh Mới',
        address: 'Địa chỉ mới',
        phone: '0899999999',
        openTime: '09:00',
        closeTime: '21:00',
      })
      .expect(201);
    const created = createRes.body as { id: string; active: boolean };
    expect(created.id).toBeDefined();
    expect(created.active).toBe(true);

    const patchRes = await api()
      .patch(`/api/admin/branches/${created.id}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ name: 'Chi nhánh Mới 2', openTime: '08:00' })
      .expect(200);
    expect((patchRes.body as { name: string }).name).toBe('Chi nhánh Mới 2');

    const branchAdminA = await login(
      FIXTURE.branchAdminPhone,
      FIXTURE.branchAdminPassword,
    );
    const forbidden = await api()
      .post('/api/admin/branches')
      .set('Authorization', `Bearer ${branchAdminA.accessToken}`)
      .send({
        name: 'Chi nhánh Mới',
        address: 'Địa chỉ mới',
        phone: '0899999999',
        openTime: '09:00',
        closeTime: '21:00',
      })
      .expect(403);
    expect((forbidden.body as { message: string }).message).toBe(
      'Bạn không có quyền thực hiện thao tác này',
    );
  });

  it('POST service → 201; branch_admin branch A tạo service branch B → 403; PATCH service → 200', async () => {
    const superAdmin = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );
    const createRes = await api()
      .post('/api/admin/services')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({
        branchId: branchA.id,
        name: 'Dịch vụ Admin Test',
        price: 250000,
        durationMinutes: 60,
      })
      .expect(201);
    const created = createRes.body as { id: string };
    serviceId = created.id;

    const branchAdminA = await login(
      FIXTURE.branchAdminPhone,
      FIXTURE.branchAdminPassword,
    );
    const forbidden = await api()
      .post('/api/admin/services')
      .set('Authorization', `Bearer ${branchAdminA.accessToken}`)
      .send({
        branchId: branchB.id,
        name: 'X',
        price: 100000,
        durationMinutes: 30,
      })
      .expect(403);
    expect((forbidden.body as { message: string }).message).toBe(
      'Bạn không có quyền truy cập chi nhánh này',
    );

    const patchRes = await api()
      .patch(`/api/admin/services/${serviceId}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ price: 260000 })
      .expect(200);
    expect((patchRes.body as { price: number }).price).toBe(260000);
  });

  it('branch_admin: GET services luôn trả về branch của mình (bỏ qua param branchId khác)', async () => {
    const branchAdminA = await login(
      FIXTURE.branchAdminPhone,
      FIXTURE.branchAdminPassword,
    );
    const crossBranch = await api()
      .get(`/api/admin/services?branchId=${branchB.id}`)
      .set('Authorization', `Bearer ${branchAdminA.accessToken}`)
      .expect(200);
    const crossBody = crossBranch.body as Array<{ branchId: string }>;
    expect(crossBody.every((s) => s.branchId === branchA.id)).toBe(true);

    const own = await api()
      .get('/api/admin/services')
      .set('Authorization', `Bearer ${branchAdminA.accessToken}`)
      .expect(200);
    const body = own.body as Array<{ branchId: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((s) => s.branchId === branchA.id)).toBe(true);
  });

  it('POST stylist + PUT working-hours → 200; time-off cắt booking có sẵn → 409 kèm affectedBookings; time-off không cắt → 201; DELETE time-off → 200', async () => {
    const superAdmin = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );
    const stylistRes = await api()
      .post('/api/admin/stylists')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({
        branchId: branchA.id,
        name: 'Stylist Mới',
        phone: '0901555777',
      })
      .expect(201);
    const stylistNewId = (stylistRes.body as { id: string }).id;

    await api()
      .put(`/api/admin/stylists/${stylistNewId}/working-hours`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({
        workingHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          dayOfWeek,
          startTime: '09:00',
          endTime: '21:00',
        })),
      })
      .expect(200);

    const booking = await createBooking(
      stylistNewId,
      serviceA.id,
      tomorrowAt(10, 0),
    );

    const conflict = await api()
      .post(`/api/admin/stylists/${stylistNewId}/time-off`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({
        startTime: tomorrowAt(9, 30),
        endTime: tomorrowAt(10, 15),
        reason: 'Test',
      })
      .expect(409);
    const conflictBody = conflict.body as {
      message: string;
      affectedBookings: Array<{ id: string; startTime: string }>;
    };
    expect(conflictBody.message).toBe(
      'Thời gian nghỉ trùng với lịch hẹn hiện có',
    );
    expect(conflictBody.affectedBookings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: booking.id,
          startTime: booking.startTime.toISOString(),
        }),
      ]),
    );

    const okRes = await api()
      .post(`/api/admin/stylists/${stylistNewId}/time-off`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({
        startTime: tomorrowAt(12, 0),
        endTime: tomorrowAt(13, 0),
        reason: 'Test',
      })
      .expect(201);
    const timeOffId = (okRes.body as { id: string }).id;

    await api()
      .delete(`/api/admin/stylists/${stylistNewId}/time-off/${timeOffId}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(200);
  });

  it('DELETE service có booking tương lai → 409; DELETE branch có booking tương lai → 409', async () => {
    await createBooking(stylistA.id, serviceA.id, tomorrowAt(10, 0));

    const superAdmin = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );
    const serviceDel = await api()
      .delete(`/api/admin/services/${serviceA.id}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(409);
    expect((serviceDel.body as { message: string }).message).toBe(
      'Không thể vô hiệu hóa dịch vụ khi còn lịch hẹn chưa hoàn thành',
    );

    const branchDel = await api()
      .delete(`/api/admin/branches/${branchA.id}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(409);
    expect((branchDel.body as { message: string }).message).toBe(
      'Không thể vô hiệu hóa chi nhánh khi còn lịch hẹn chưa hoàn thành',
    );
  });

  it('DELETE service không booking tương lai → 200 (soft active=false)', async () => {
    const superAdmin = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );
    await api()
      .delete(`/api/admin/services/${serviceId}`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(200);

    const s = await prisma.service.findUnique({ where: { id: serviceId } });
    expect(s?.active).toBe(false);
  });

  it('time-off cắt booking: branch_admin branch khác bị 403', async () => {
    const branchAdminB = await login(
      FIXTURE.branchAdminBPhone,
      FIXTURE.branchAdminBPassword,
    );
    const res = await api()
      .post(`/api/admin/stylists/${stylistA.id}/time-off`)
      .set('Authorization', `Bearer ${branchAdminB.accessToken}`)
      .send({
        startTime: tomorrowAt(12, 0),
        endTime: tomorrowAt(13, 0),
        reason: 'Test',
      })
      .expect(403);
    expect((res.body as { message: string }).message).toBe(
      'Bạn không có quyền truy cập chi nhánh này',
    );
  });
});
