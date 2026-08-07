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

// Số điện thoại dùng riêng cho test register (không đụng fixture).
const NEW_PHONE = '0933334444';
const NEW_PASSWORD = 'MatKhau@123';

describe('Auth (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const api = () => request(app.getHttpServer());

  const login = async (
    phoneOrEmail: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> => {
    const res = await api()
      .post('/api/auth/login')
      .send({ phoneOrEmail, password })
      .expect(200);
    return res.body as { accessToken: string; refreshToken: string };
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('register thành công → 201 kèm accessToken + refreshToken; /me trả đúng user', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({
        name: 'Khách Mới',
        phone: NEW_PHONE,
        email: 'khachmoi@test.vn',
        password: NEW_PASSWORD,
      })
      .expect(201);
    const body = res.body as {
      accessToken: string;
      refreshToken: string;
      user: { id: string; name: string; phone: string; role: string };
    };
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toHaveLength(64);
    expect(body.user).toMatchObject({
      name: 'Khách Mới',
      phone: NEW_PHONE,
      email: 'khachmoi@test.vn',
      role: 'customer',
    });

    const me = await api()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({
      id: body.user.id,
      phone: NEW_PHONE,
      role: 'customer',
      customerId: expect.stringMatching(/.+/) as string,
      name: 'Khách Mới',
    });
  });

  it('register trùng phone → 409 "Số điện thoại đã được đăng ký"', async () => {
    await api()
      .post('/api/auth/register')
      .send({ name: 'Khách Mới', phone: NEW_PHONE, password: NEW_PASSWORD })
      .expect(409)
      .expect((res) =>
        expect((res.body as { message: string }).message).toBe(
          'Số điện thoại đã được đăng ký',
        ),
      );
  });

  it('register trùng email fixture → 409 "Email đã được đăng ký"', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({
        name: 'Khách Email',
        phone: '0933555666',
        email: FIXTURE.superAdminEmail,
        password: NEW_PASSWORD,
      })
      .expect(409);
    expect((res.body as { message: string }).message).toBe(
      'Email đã được đăng ký',
    );
  });

  it('register phone không hợp lệ → 400 message chuẩn', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Khách X', phone: '12345', password: NEW_PASSWORD })
      .expect(400);
    expect((res.body as { message: string }).message).toBe(
      'Số điện thoại không hợp lệ (yêu cầu 10 số, đầu 03/05/07/08/09)',
    );
  });

  it('login sai mật khẩu → 401', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ phoneOrEmail: FIXTURE.customerPhone, password: 'sai-mat-khau' })
      .expect(401);
    expect((res.body as { message: string }).message).toBe(
      'Số điện thoại/email hoặc mật khẩu không đúng',
    );
  });

  it('login bằng email (super_admin) → 200', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({
        phoneOrEmail: FIXTURE.superAdminEmail,
        password: FIXTURE.superAdminPassword,
      })
      .expect(200);
    expect((res.body as { user: { role: string } }).user.role).toBe(
      'super_admin',
    );
  });

  it('GET /api/auth/me không token → 401', async () => {
    const res = await api().get('/api/auth/me').expect(401);
    expect((res.body as { message: string }).message).toBe(
      'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
    );
  });

  it('refresh: token đúng → 200 rotation; dùng lại token cũ → 401', async () => {
    const { refreshToken: tokenA } = await login(
      FIXTURE.customerPhone,
      FIXTURE.customerPassword,
    );

    const r1 = await api()
      .post('/api/auth/refresh')
      .send({ refreshToken: tokenA })
      .expect(200);
    const tokenB = (r1.body as { refreshToken: string }).refreshToken;
    expect(tokenB).not.toBe(tokenA);

    // Token cũ sau rotation bị từ chối
    const r2 = await api()
      .post('/api/auth/refresh')
      .send({ refreshToken: tokenA })
      .expect(401);
    expect((r2.body as { message: string }).message).toBe(
      'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại',
    );

    // Token hiện tại vẫn hoạt động
    await api()
      .post('/api/auth/refresh')
      .send({ refreshToken: tokenB })
      .expect(200);
  });

  it('logout → refresh token bị vô hiệu hóa (refresh tiếp → 401)', async () => {
    const { refreshToken } = await login(
      FIXTURE.customerPhone,
      FIXTURE.customerPassword,
    );
    await api().post('/api/auth/logout').send({ refreshToken }).expect(200);
    const res = await api()
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(401);
    expect((res.body as { message: string }).message).toBe(
      'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại',
    );
  });

  it('logout với token sai → vẫn 200 (idempotent)', async () => {
    await api()
      .post('/api/auth/logout')
      .send({ refreshToken: 'token-sai' })
      .expect(200);
  });

  it('POST /api/admin/users: super_admin tạo branch_admin → 201 (không kèm hash)', async () => {
    const { accessToken } = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );
    const branchId = (await prisma.branch.findFirstOrThrow()).id;
    const res = await api()
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        phone: '0944555666',
        email: 'branchmoi@test.vn',
        password: 'BranchNew@123',
        role: 'branch_admin',
        branchId,
      })
      .expect(201);
    const body = res.body as {
      phone: string;
      role: string;
      branchId: string;
      passwordHash?: string;
      refreshTokenHash?: string;
    };
    expect(body.phone).toBe('0944555666');
    expect(body.role).toBe('branch_admin');
    expect(body.branchId).toBe(branchId);
    expect(body.passwordHash).toBeUndefined();
    expect(body.refreshTokenHash).toBeUndefined();

    // Login thử tài khoản mới → 200
    await login('0944555666', 'BranchNew@123');
  });

  it('POST /api/admin/users: token khách → 403 "Bạn không có quyền thực hiện thao tác này"', async () => {
    const { accessToken } = await login(
      FIXTURE.customerPhone,
      FIXTURE.customerPassword,
    );
    const branchId = (await prisma.branch.findFirstOrThrow()).id;
    const res = await api()
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        phone: '0944666777',
        password: 'BranchNew@123',
        role: 'branch_admin',
        branchId,
      })
      .expect(403);
    expect((res.body as { message: string }).message).toBe(
      'Bạn không có quyền thực hiện thao tác này',
    );
  });

  it('POST /api/admin/users: stylist đã có tài khoản → 409', async () => {
    const { accessToken } = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );
    const stylistId = (await prisma.stylist.findFirstOrThrow()).id;
    const res = await api()
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        phone: '0944777888',
        password: 'StylistNew@123',
        role: 'stylist',
        stylistId,
      })
      .expect(409);
    expect((res.body as { message: string }).message).toBe(
      'Stylist này đã có tài khoản',
    );
  });

  it('POST /api/admin/users: role stylist thiếu stylistId → 400', async () => {
    const { accessToken } = await login(
      FIXTURE.superAdminEmail,
      FIXTURE.superAdminPassword,
    );
    await api()
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        phone: '0944888999',
        password: 'StylistNew@123',
        role: 'stylist',
      })
      .expect(400);
  });

  it('POST /bookings không token → 401 (guard chặn)', async () => {
    await api()
      .post('/api/bookings')
      .send({
        branchId: 'b-x',
        serviceId: 's-x',
        stylistId: 'st-x',
        startTime: new Date().toISOString(),
      })
      .expect(401);
  });
});
