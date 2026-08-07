import { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  DepositStatus,
  PaymentProvider,
  PaymentStatus,
  UserRole,
} from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { momoIpnSignature } from './momo';
import { PaymentsService } from './payments.service';
import { vnpaySignParams } from './vnpay';

const BASE_CONFIG: Record<string, string> = {
  PAYMENT_ENABLED: 'true',
  DEPOSIT_PERCENT: '30',
  VNP_TMN_CODE: 'TESTTMN',
  VNP_HASH_SECRET: 'test-vnp-hash-secret-not-real',
  VNP_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  VNP_RETURN_URL: 'http://localhost:3001/api/payments/vnpay/return',
  MOMO_PARTNER_CODE: 'TESTMOMO',
  MOMO_ACCESS_KEY: 'test-access-key',
  MOMO_SECRET_KEY: 'test-secret-key',
  MOMO_API_URL: 'http://localhost:1/v2/gateway/api/create',
  MOMO_REDIRECT_URL: 'http://localhost:3001/api/payments/momo/return',
  MOMO_IPN_URL: 'http://localhost:3001/api/payments/momo/ipn',
};

const CONFIRMED_BOOKING = {
  id: 'bk1',
  branchId: 'b1',
  customerId: 'c1',
  status: BookingStatus.confirmed,
  depositStatus: DepositStatus.none,
  priceAtBooking: 150000,
  discountAmount: 0,
};

// Giữ fetch gốc để khôi phục sau mỗi test mock MoMo
const originalFetch = globalThis.fetch;

describe('PaymentsService', () => {
  const tx = {
    paymentTransaction: { update: jest.fn() },
    booking: { update: jest.fn() },
  };
  const prisma = {
    booking: { findUnique: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
    paymentTransaction: {
      create: jest.fn() as jest.Mock<Promise<unknown>, [unknown]>,
      findUnique: jest.fn() as jest.Mock<Promise<unknown>, [unknown]>,
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const config = { get: jest.fn((key: string) => BASE_CONFIG[key] ?? null) };
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    // Khôi phục implementation mặc định (clearAllMocks không khôi phục mockImplementation)
    config.get.mockImplementation((key: string) => BASE_CONFIG[key] ?? null);
    prisma.booking.findUnique.mockResolvedValue(CONFIRMED_BOOKING);
    prisma.user.findUnique.mockResolvedValue({ customerId: 'c1' });
  });

  const customerUser = (): AuthUser => ({
    sub: 'u1',
    role: UserRole.customer,
    branchId: null,
  });
  const superAdminUser = (): AuthUser => ({
    sub: 'u9',
    role: UserRole.super_admin,
    branchId: null,
  });
  const branchAdminUser = (branchId: string): AuthUser => ({
    sub: 'u2',
    role: UserRole.branch_admin,
    branchId,
  });

  describe('createDeposit', () => {
    it('PAYMENT_ENABLED != true → 503, không tra booking', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'PAYMENT_ENABLED' ? 'false' : (BASE_CONFIG[key] ?? null),
      );
      await expect(
        service.createDeposit(
          'bk1',
          customerUser(),
          { provider: PaymentProvider.vnpay },
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({
        status: 503,
        message: 'Chưa cấu hình thanh toán trực tuyến, vui lòng liên hệ salon',
      });
      expect(prisma.booking.findUnique).not.toHaveBeenCalled();
    });

    it('mặc định cọc 30% giá dịch vụ (45000), đánh dấu booking pending, trả paymentUrl VNPay', async () => {
      const result = await service.createDeposit(
        'bk1',
        customerUser(),
        { provider: PaymentProvider.vnpay },
        '127.0.0.1',
      );

      const createArg = prisma.paymentTransaction.create.mock.calls[0]?.[0] as
        | {
            data: {
              bookingId: string;
              provider: PaymentProvider;
              amount: number;
              status: PaymentStatus;
              providerTxnRef: string;
              rawPayload: Record<string, never>;
            };
          }
        | undefined;
      expect(createArg?.data).toMatchObject({
        bookingId: 'bk1',
        provider: PaymentProvider.vnpay,
        amount: 45000,
        status: PaymentStatus.created,
        rawPayload: {},
      });
      expect(createArg?.data.providerTxnRef).toMatch(/^vnpay_bk1_[0-9a-f]{8}$/);
      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: 'bk1' },
        data: { depositStatus: DepositStatus.pending },
      });
      expect(result.paymentUrl).toContain('vpcpay.html');
      expect(result.paymentUrl).toContain('vnp_TxnRef=');
      expect(result.paymentUrl).toContain('vnp_Amount=4500000');
    });

    it('booking đã paid → 409, không tạo giao dịch', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...CONFIRMED_BOOKING,
        depositStatus: DepositStatus.paid,
      });
      await expect(
        service.createDeposit(
          'bk1',
          customerUser(),
          { provider: PaymentProvider.vnpay },
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Lịch hẹn này đã thanh toán cọc',
      });
      expect(prisma.paymentTransaction.create).not.toHaveBeenCalled();
    });

    it('amount truyền vào > maxDeposit → 400', async () => {
      await expect(
        service.createDeposit(
          'bk1',
          customerUser(),
          { provider: PaymentProvider.vnpay, amount: 150001 },
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Số tiền cọc không hợp lệ',
      });
      expect(prisma.paymentTransaction.create).not.toHaveBeenCalled();
    });

    it('khách khác không sở hữu booking → 403', async () => {
      prisma.user.findUnique.mockResolvedValue({ customerId: 'c-other' });
      await expect(
        service.createDeposit(
          'bk1',
          customerUser(),
          { provider: PaymentProvider.vnpay },
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Bạn không có quyền thao tác lịch hẹn này',
      });
      expect(prisma.paymentTransaction.create).not.toHaveBeenCalled();
    });

    it('super_admin được phép tạo cọc cho mọi booking', async () => {
      await service.createDeposit(
        'bk1',
        superAdminUser(),
        { provider: PaymentProvider.vnpay },
        '127.0.0.1',
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.paymentTransaction.create).toHaveBeenCalled();
    });

    it('branch_admin đúng branch → ok; khác branch → 403', async () => {
      await service.createDeposit(
        'bk1',
        branchAdminUser('b1'),
        { provider: PaymentProvider.vnpay },
        '127.0.0.1',
      );
      expect(prisma.paymentTransaction.create).toHaveBeenCalled();

      await expect(
        service.createDeposit(
          'bk1',
          branchAdminUser('b-other'),
          { provider: PaymentProvider.vnpay },
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Bạn không có quyền thao tác lịch hẹn này',
      });
    });

    it('MoMo: gọi API tạo thanh toán, trả payUrl khi resultCode=0', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => ({
          resultCode: 0,
          payUrl: 'https://test-payment.momo.vn/pay/abc123',
        }),
      });
      globalThis.fetch = fetchMock;
      try {
        const result = await service.createDeposit(
          'bk1',
          customerUser(),
          { provider: PaymentProvider.momo },
          '127.0.0.1',
        );
        expect(result.paymentUrl).toBe(
          'https://test-payment.momo.vn/pay/abc123',
        );
      } finally {
        globalThis.fetch = originalFetch;
      }

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:1/v2/gateway/api/create');
      const sent = JSON.parse(init.body as string) as {
        partnerCode?: string;
        requestType?: string;
        orderInfo?: string;
        amount?: number;
        signature?: string;
      };
      expect(sent.partnerCode).toBe('TESTMOMO');
      expect(sent.requestType).toBe('captureWallet');
      expect(sent.orderInfo).toBe('Thanh toan coc lich hen bk1');
      expect(sent.amount).toBe(45000);
      expect(sent.signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it('MoMo: lỗi mạng → 502', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('network down'));
      try {
        await expect(
          service.createDeposit(
            'bk1',
            customerUser(),
            { provider: PaymentProvider.momo },
            '127.0.0.1',
          ),
        ).rejects.toMatchObject({
          status: 502,
          message:
            'Không kết nối được cổng thanh toán MoMo, vui lòng thử lại sau',
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('MoMo: HTTP != 2xx → 502', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => ({}),
      });
      try {
        await expect(
          service.createDeposit(
            'bk1',
            customerUser(),
            { provider: PaymentProvider.momo },
            '127.0.0.1',
          ),
        ).rejects.toMatchObject({
          status: 502,
          message:
            'Không kết nối được cổng thanh toán MoMo, vui lòng thử lại sau',
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('MoMo: resultCode != 0 → 502 kèm mã từ chối', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => ({ resultCode: 99 }),
      });
      try {
        await expect(
          service.createDeposit(
            'bk1',
            customerUser(),
            { provider: PaymentProvider.momo },
            '127.0.0.1',
          ),
        ).rejects.toMatchObject({
          status: 502,
          message: 'MoMo từ chối yêu cầu thanh toán (resultCode=99)',
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('handleVnpayIpn', () => {
    const ipnParams = (over: Record<string, string> = {}) => {
      const params = {
        vnp_TmnCode: 'TESTTMN',
        vnp_Amount: '4500000',
        vnp_TransactionStatus: '00',
        vnp_ResponseCode: '00',
        vnp_TxnRef: 'vnpay_bk1_abcd1234',
        ...over,
      };
      return params;
    };
    const signedIpn = (over: Record<string, string> = {}) => {
      const params = ipnParams(over);
      return {
        ...params,
        vnp_SecureHash: vnpaySignParams(params, BASE_CONFIG['VNP_HASH_SECRET']),
      };
    };
    const vnpayTxn = (over: Record<string, unknown> = {}) => ({
      id: 'pt1',
      bookingId: 'bk1',
      provider: PaymentProvider.vnpay,
      amount: 45000,
      status: PaymentStatus.created,
      providerTxnRef: 'vnpay_bk1_abcd1234',
      rawPayload: {},
      booking: {
        id: 'bk1',
        status: BookingStatus.confirmed,
        depositStatus: DepositStatus.none,
      },
      ...over,
    });

    it('sai chữ ký → 401/97, không tra cứu giao dịch', async () => {
      const params = ipnParams({ vnp_Amount: '999990000' });
      const result = await service.handleVnpayIpn({
        ...params,
        vnp_SecureHash: '0'.repeat(128),
      });
      expect(result).toEqual({
        httpStatus: 401,
        rspCode: '97',
        message: 'Invalid signature',
      });
      expect(prisma.paymentTransaction.findUnique).not.toHaveBeenCalled();
    });

    it('không tìm thấy giao dịch → 200/01', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(null);
      const result = await service.handleVnpayIpn(signedIpn());
      expect(result.rspCode).toBe('01');
      expect(result.httpStatus).toBe(200);
    });

    it('sai số tiền → 200/02, không ghi DB', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(vnpayTxn());
      const result = await service.handleVnpayIpn(
        signedIpn({ vnp_Amount: '4600000' }),
      );
      expect(result).toMatchObject({ httpStatus: 200, rspCode: '02' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.paymentTransaction.update).not.toHaveBeenCalled();
    });

    it('đã xử lý thành công → 200/04, không ghi DB lần nữa', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(
        vnpayTxn({ status: PaymentStatus.success }),
      );
      const result = await service.handleVnpayIpn(signedIpn());
      expect(result).toMatchObject({ httpStatus: 200, rspCode: '04' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.paymentTransaction.update).not.toHaveBeenCalled();
    });

    it('booking đã hủy → 200/01 (VNPay retry, admin hoàn tiền thủ công)', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(
        vnpayTxn({
          booking: {
            id: 'bk1',
            status: BookingStatus.cancelled,
            depositStatus: DepositStatus.none,
          },
        }),
      );
      const result = await service.handleVnpayIpn(signedIpn());
      expect(result).toMatchObject({ httpStatus: 200, rspCode: '01' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('giao dịch thành công → txn success + booking paid (transactional)', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(vnpayTxn());
      const params = signedIpn();
      const result = await service.handleVnpayIpn(params);

      expect(result).toEqual({
        httpStatus: 200,
        rspCode: '00',
        message: 'Confirm Success',
      });
      expect(tx.paymentTransaction.update).toHaveBeenCalledWith({
        where: { id: 'pt1' },
        data: { status: PaymentStatus.success, rawPayload: params },
      });
      expect(tx.booking.update).toHaveBeenCalledWith({
        where: { id: 'bk1' },
        data: { depositStatus: DepositStatus.paid },
      });
    });

    it('thành công nhưng booking đã paid → không ghi đè booking', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(
        vnpayTxn({
          booking: {
            id: 'bk1',
            status: BookingStatus.confirmed,
            depositStatus: DepositStatus.paid,
          },
        }),
      );
      const result = await service.handleVnpayIpn(signedIpn());
      expect(result.rspCode).toBe('00');
      expect(tx.paymentTransaction.update).toHaveBeenCalled();
      expect(tx.booking.update).not.toHaveBeenCalled();
    });

    it('giao dịch thất bại → txn failed, booking giữ nguyên, vẫn trả 00', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(vnpayTxn());
      const params = signedIpn({
        vnp_TransactionStatus: '01',
        vnp_ResponseCode: '24',
      });
      const result = await service.handleVnpayIpn(params);

      expect(result).toEqual({
        httpStatus: 200,
        rspCode: '00',
        message: 'Confirm Success',
      });
      expect(prisma.paymentTransaction.update).toHaveBeenCalledWith({
        where: { id: 'pt1' },
        data: { status: PaymentStatus.failed, rawPayload: params },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.booking.update).not.toHaveBeenCalled();
    });
  });

  describe('handleMomoIpn', () => {
    const momoBody = (over: Record<string, unknown> = {}) => {
      const data = {
        partnerCode: 'TESTMOMO',
        orderId: 'momo_bk1_abcd1234',
        requestId: 'momo_bk1_abcd1234',
        amount: 45000,
        orderInfo: 'Thanh toan coc lich hen bk1',
        orderType: 'momo_wallet',
        transId: 12345,
        resultCode: 0,
        message: 'Successful.',
        payType: 'wallet',
        responseTime: 1234567890,
        extraData: '',
        ...over,
      };
      return {
        ...data,
        signature:
          over['signature'] ??
          momoIpnSignature(
            { ...data, accessKey: BASE_CONFIG['MOMO_ACCESS_KEY'] },
            BASE_CONFIG['MOMO_SECRET_KEY'],
          ),
      };
    };
    const momoTxn = (over: Record<string, unknown> = {}) => ({
      id: 'pt2',
      bookingId: 'bk1',
      provider: PaymentProvider.momo,
      amount: 45000,
      status: PaymentStatus.created,
      providerTxnRef: 'momo_bk1_abcd1234',
      rawPayload: {},
      booking: {
        id: 'bk1',
        status: BookingStatus.confirmed,
        depositStatus: DepositStatus.none,
      },
      ...over,
    });

    it('sai chữ ký → 401, không tra cứu giao dịch', async () => {
      const result = await service.handleMomoIpn(
        momoBody({ amount: 999, signature: '0'.repeat(64) }),
      );
      expect(result).toEqual({ httpStatus: 401, body: 'Invalid signature' });
      expect(prisma.paymentTransaction.findUnique).not.toHaveBeenCalled();
    });

    it('không tìm thấy đơn hàng → 400 (MoMo retry)', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(null);
      const result = await service.handleMomoIpn(momoBody());
      expect(result).toEqual({ httpStatus: 400, body: 'Invalid request' });
    });

    it('sai số tiền → 400', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(momoTxn());
      const result = await service.handleMomoIpn(momoBody({ amount: 46000 }));
      expect(result).toEqual({ httpStatus: 400, body: 'Invalid request' });
    });

    it('đã xử lý thành công → 200 OK, không xử lý lại', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(
        momoTxn({ status: PaymentStatus.success }),
      );
      const result = await service.handleMomoIpn(momoBody());
      expect(result).toEqual({ httpStatus: 200, body: 'OK' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('booking đã hủy → 400 (MoMo retry, admin hoàn tiền thủ công)', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(
        momoTxn({
          booking: {
            id: 'bk1',
            status: BookingStatus.cancelled,
            depositStatus: DepositStatus.none,
          },
        }),
      );
      const result = await service.handleMomoIpn(momoBody());
      expect(result).toEqual({ httpStatus: 400, body: 'Invalid request' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('resultCode=0 → txn success + booking paid, trả OK', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(momoTxn());
      const body = momoBody();
      const result = await service.handleMomoIpn(body);

      expect(result).toEqual({ httpStatus: 200, body: 'OK' });
      expect(tx.paymentTransaction.update).toHaveBeenCalledWith({
        where: { id: 'pt2' },
        data: { status: PaymentStatus.success, rawPayload: body },
      });
      expect(tx.booking.update).toHaveBeenCalledWith({
        where: { id: 'bk1' },
        data: { depositStatus: DepositStatus.paid },
      });
    });

    it('resultCode != 0 → txn failed, booking giữ nguyên, vẫn trả OK', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(momoTxn());
      const body = momoBody({
        resultCode: 1006,
        message: 'Giao dịch thất bại',
      });
      const result = await service.handleMomoIpn(body);

      expect(result).toEqual({ httpStatus: 200, body: 'OK' });
      expect(prisma.paymentTransaction.update).toHaveBeenCalledWith({
        where: { id: 'pt2' },
        data: { status: PaymentStatus.failed, rawPayload: body },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
