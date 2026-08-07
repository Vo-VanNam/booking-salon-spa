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
process.env.PAYMENT_ENABLED = 'true';
process.env.DEPOSIT_PERCENT = '30';
process.env.VNP_TMN_CODE = 'TESTTMN';
process.env.VNP_HASH_SECRET = 'test-vnp-hash-secret-not-real';
process.env.VNP_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
process.env.VNP_RETURN_URL = 'http://localhost:3001/api/payments/vnpay/return';
process.env.VNP_IPN_URL = 'http://localhost:3001/api/payments/vnpay/ipn';
process.env.MOMO_PARTNER_CODE = 'TESTMOMO';
process.env.MOMO_ACCESS_KEY = 'test-access-key';
process.env.MOMO_SECRET_KEY = 'test-secret-key';
process.env.MOMO_API_URL = 'http://localhost:1/v2/gateway/api/create';
process.env.MOMO_REDIRECT_URL =
  'http://localhost:3001/api/payments/momo/return';
process.env.MOMO_IPN_URL = 'http://localhost:3001/api/payments/momo/ipn';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, DepositStatus, PaymentStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { vnpaySignParams } from './../src/payments/vnpay';
import { PrismaService } from './../src/prisma/prisma.service';
import { VN_TIMEZONE } from './../src/time/time.service';
import { FIXTURE } from './setup-integration';

const VNP_SECRET = 'test-vnp-hash-secret-not-real';

// Ngày mai lúc HH:mm theo giờ VN → ISO UTC.
function tomorrowVn(hour: number, minute: number): string {
  return DateTime.now()
    .setZone(VN_TIMEZONE)
    .plus({ days: 1 })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toUTC()
    .toISO()!;
}

describe('Thanh toán cọc — VNPay deposit + IPN (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;

  // App mới mỗi test: bộ đếm throttle là in-memory theo instance (như race spec)
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

  // setup-integration beforeEach đã xóa sạch booking — mỗi test tự tạo booking riêng
  async function createBooking(): Promise<string> {
    const branch = await prisma.branch.findFirstOrThrow();
    const service = await prisma.service.findFirstOrThrow();
    const stylist = await prisma.stylist.findFirstOrThrow();
    const res = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId: branch.id,
        serviceId: service.id,
        stylistId: stylist.id,
        startTime: tomorrowVn(10, 0),
      })
      .expect(201);
    return (res.body as { id: string }).id;
  }

  async function createDeposit(bookingId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/api/bookings/${bookingId}/deposit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ provider: 'vnpay', amount: 150000 })
      .expect(201);
    const paymentUrl = (res.body as { paymentUrl: string }).paymentUrl;
    const query = new URLSearchParams(paymentUrl.split('?')[1]);
    const txnRef = query.get('vnp_TxnRef');
    expect(txnRef).toBeTruthy();
    return txnRef!;
  }

  it('1. Tạo phiên cọc VNPay: URL hợp lệ, vnp_Amount = giá dịch vụ × 100, có vnp_SecureHash', async () => {
    const bookingId = await createBooking();
    const res = await request(app.getHttpServer())
      .post(`/api/bookings/${bookingId}/deposit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ provider: 'vnpay', amount: 150000 })
      .expect(201);

    const paymentUrl = (res.body as { paymentUrl: string }).paymentUrl;
    expect(paymentUrl).toContain('vpcpay.html');
    expect(paymentUrl).toContain('vnp_TxnRef=');
    const query = new URLSearchParams(paymentUrl.split('?')[1]);
    expect(query.get('vnp_Amount')).toBe('15000000');
    expect(query.get('vnp_SecureHash')).toBeTruthy();

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    expect(booking.depositStatus).toBe(DepositStatus.pending);
    const txns = await prisma.paymentTransaction.findMany({
      where: { bookingId },
    });
    expect(txns).toHaveLength(1);
    expect(txns[0].status).toBe(PaymentStatus.created);
  });

  it('2. IPN hợp lệ (tự ký) → RspCode 00, booking paid, đúng 1 txn success', async () => {
    const bookingId = await createBooking();
    const txnRef = await createDeposit(bookingId);

    const ipnParams: Record<string, string> = {
      vnp_TmnCode: 'TESTTMN',
      vnp_Amount: '15000000',
      vnp_TransactionStatus: '00',
      vnp_ResponseCode: '00',
      vnp_TxnRef: txnRef,
    };
    const res = await request(app.getHttpServer())
      .get('/api/payments/vnpay/ipn')
      .query({
        ...ipnParams,
        vnp_SecureHash: vnpaySignParams(ipnParams, VNP_SECRET),
      })
      .expect(200);

    expect(res.body).toEqual({ RspCode: '00', Message: 'Confirm Success' });
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    expect(booking.depositStatus).toBe(DepositStatus.paid);
    const txns = await prisma.paymentTransaction.findMany({
      where: { bookingId },
    });
    expect(txns).toHaveLength(1);
    expect(txns[0].status).toBe(PaymentStatus.success);
  });

  it('3. IPN lặp lại → RspCode 04, không xử lý lại, vẫn đúng 1 txn success', async () => {
    const bookingId = await createBooking();
    const txnRef = await createDeposit(bookingId);

    const ipnParams: Record<string, string> = {
      vnp_TmnCode: 'TESTTMN',
      vnp_Amount: '15000000',
      vnp_TransactionStatus: '00',
      vnp_ResponseCode: '00',
      vnp_TxnRef: txnRef,
    };
    const signed = {
      ...ipnParams,
      vnp_SecureHash: vnpaySignParams(ipnParams, VNP_SECRET),
    };
    await request(app.getHttpServer())
      .get('/api/payments/vnpay/ipn')
      .query(signed)
      .expect(200)
      .expect((r) =>
        expect(r.body).toEqual({ RspCode: '00', Message: 'Confirm Success' }),
      );

    const repeat = await request(app.getHttpServer())
      .get('/api/payments/vnpay/ipn')
      .query(signed)
      .expect(200);
    expect(repeat.body).toEqual({
      RspCode: '04',
      Message: 'Already processed',
    });

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    expect(booking.depositStatus).toBe(DepositStatus.paid);
    const txns = await prisma.paymentTransaction.findMany({
      where: { bookingId },
    });
    expect(txns).toHaveLength(1);
    expect(txns[0].status).toBe(PaymentStatus.success);
  });

  it('4. IPN giả mạo (sai chữ ký) → 401, không đổi trạng thái nào', async () => {
    const bookingId = await createBooking();
    const txnRef = await createDeposit(bookingId);

    const tampered: Record<string, string> = {
      vnp_TmnCode: 'TESTTMN',
      vnp_Amount: '999990000',
      vnp_TransactionStatus: '00',
      vnp_ResponseCode: '00',
      vnp_TxnRef: txnRef,
    };
    const res = await request(app.getHttpServer())
      .get('/api/payments/vnpay/ipn')
      .query({ ...tampered, vnp_SecureHash: 'deadbeef' })
      .expect(401);

    expect(res.body).toEqual({ RspCode: '97', Message: 'Invalid signature' });
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    expect(booking.depositStatus).toBe(DepositStatus.pending);
    const txns = await prisma.paymentTransaction.findMany({
      where: { bookingId },
    });
    expect(txns).toHaveLength(1);
    expect(txns[0].status).toBe(PaymentStatus.created);
  });

  it('5. Khách khác không tạo cọc được cho booking của người khác → 403', async () => {
    // Tạo customer + booking riêng trực tiếp qua DB (fixture chỉ có 1 khách)
    await prisma.customer.deleteMany({ where: { phone: '0909990001' } });
    const branch = await prisma.branch.findFirstOrThrow();
    const service = await prisma.service.findFirstOrThrow();
    const stylist = await prisma.stylist.findFirstOrThrow();
    const other = await prisma.customer.create({
      data: { name: 'Khách Khác', phone: '0909990001' },
    });
    const start = DateTime.fromISO(tomorrowVn(11, 0)).toJSDate();
    const otherBooking = await prisma.booking.create({
      data: {
        branchId: branch.id,
        serviceId: service.id,
        stylistId: stylist.id,
        customerId: other.id,
        startTime: start,
        endTime: new Date(start.getTime() + 30 * 60 * 1000),
        status: BookingStatus.confirmed,
        priceAtBooking: 150000,
        discountAmount: 0,
        depositStatus: DepositStatus.none,
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/bookings/${otherBooking.id}/deposit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ provider: 'vnpay' })
      .expect(403);
    expect((res.body as { message: string }).message).toBe(
      'Bạn không có quyền thao tác lịch hẹn này',
    );
    expect(
      await prisma.paymentTransaction.count({
        where: { bookingId: otherBooking.id },
      }),
    ).toBe(0);
  });
});
