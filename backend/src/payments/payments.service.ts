import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  DepositStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';
import { PrismaService } from '../prisma/prisma.service';
import { VN_TIMEZONE } from '../time/time.service';
import { DepositDto } from './dto/deposit.dto';
import { momoCreateSignature, momoVerifyIpn } from './momo';
import { vnpayBuildUrl, vnpayVerify } from './vnpay';

const PAYMENT_DISABLED_MESSAGE =
  'Chưa cấu hình thanh toán trực tuyến, vui lòng liên hệ salon';
const NOT_FOUND_MESSAGE = 'Không tìm thấy lịch hẹn';
const NO_PERMISSION_MESSAGE = 'Bạn không có quyền thao tác lịch hẹn này';
const NOT_PAYABLE_MESSAGE = 'Lịch hẹn này không thể thanh toán cọc';
const ALREADY_PAID_MESSAGE = 'Lịch hẹn này đã thanh toán cọc';
const INVALID_AMOUNT_MESSAGE = 'Số tiền cọc không hợp lệ';
const MOMO_UNAVAILABLE_MESSAGE =
  'Không kết nối được cổng thanh toán MoMo, vui lòng thử lại sau';

// VNPay giới hạn vnp_OrderInfo 255 ký tự, ASCII-only (không dấu tiếng Việt)
const ORDER_INFO = (bookingId: string) =>
  `Thanh toan coc lich hen ${bookingId}`;

export interface VnpayIpnResult {
  httpStatus: number;
  rspCode: string;
  message: string;
}

export interface MomoIpnResult {
  httpStatus: number;
  body: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createDeposit(
    bookingId: string,
    authUser: AuthUser,
    dto: DepositDto,
    ipAddr: string,
  ): Promise<{ paymentUrl: string }> {
    if (this.config.get<string>('PAYMENT_ENABLED') !== 'true') {
      throw new BusinessRuleException(PAYMENT_DISABLED_MESSAGE, 503);
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new BusinessRuleException(NOT_FOUND_MESSAGE, 404);
    }
    await this.assertCanManageBooking(booking, authUser);

    if (
      booking.status !== BookingStatus.confirmed &&
      booking.status !== BookingStatus.pending
    ) {
      throw new BusinessRuleException(NOT_PAYABLE_MESSAGE, 409);
    }
    if (booking.depositStatus === DepositStatus.paid) {
      throw new BusinessRuleException(ALREADY_PAID_MESSAGE, 409);
    }

    const maxDeposit = booking.priceAtBooking - booking.discountAmount;
    const depositPercent = this.config.get<number>('DEPOSIT_PERCENT') ?? 30;
    const amount =
      dto.amount ??
      Math.min(
        Math.round((booking.priceAtBooking * depositPercent) / 100),
        maxDeposit,
      );
    if (amount <= 0 || amount > maxDeposit) {
      throw new BusinessRuleException(INVALID_AMOUNT_MESSAGE, 400);
    }

    const providerTxnRef = `${dto.provider}_${bookingId}_${randomUUID()
      .replace(/-/g, '')
      .slice(0, 8)}`;

    await this.prisma.paymentTransaction.create({
      data: {
        bookingId,
        provider: dto.provider,
        amount,
        status: PaymentStatus.created,
        providerTxnRef,
        rawPayload: {},
      },
    });
    // Đánh dấu pending để UI/khách biết đang chờ thanh toán; chưa paid nên
    // vẫn cho phép tạo phiên cọc mới khi phiên cũ hết hạn/khách bỏ dở.
    if (booking.depositStatus === DepositStatus.none) {
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { depositStatus: DepositStatus.pending },
      });
    }

    const paymentUrl =
      dto.provider === PaymentProvider.vnpay
        ? this.buildVnpayUrl(bookingId, amount, providerTxnRef, ipAddr)
        : await this.buildMomoUrl(bookingId, amount, providerTxnRef);
    return { paymentUrl };
  }

  // AuthUser (JWT) không chứa customerId → tra DB theo user.sub, giống
  // assertCanManageBooking bên BookingsService.
  private async assertCanManageBooking(
    booking: { customerId: string; branchId: string },
    authUser: AuthUser,
  ): Promise<void> {
    if (authUser.role === UserRole.super_admin) return;
    if (authUser.role === UserRole.branch_admin) {
      if (authUser.branchId === booking.branchId) return;
      throw new BusinessRuleException(NO_PERMISSION_MESSAGE, 403);
    }
    if (authUser.role === UserRole.customer) {
      const user = await this.prisma.user.findUnique({
        where: { id: authUser.sub },
        select: { customerId: true },
      });
      if (user?.customerId === booking.customerId) return;
    }
    throw new BusinessRuleException(NO_PERMISSION_MESSAGE, 403);
  }

  private buildVnpayUrl(
    bookingId: string,
    amount: number,
    providerTxnRef: string,
    ipAddr: string,
  ): string {
    const now = DateTime.now().setZone(VN_TIMEZONE);
    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.config.get<string>('VNP_TMN_CODE') ?? '',
      vnp_Amount: String(amount * 100),
      vnp_CreateDate: now.toFormat('yyyyMMddHHmmss'),
      vnp_CurrCode: 'VND',
      vnp_IpAddr: ipAddr,
      vnp_Locale: 'vn',
      vnp_OrderInfo: ORDER_INFO(bookingId),
      vnp_OrderType: 'other',
      vnp_ReturnUrl: this.config.get<string>('VNP_RETURN_URL') ?? '',
      vnp_TxnRef: providerTxnRef,
      vnp_ExpireDate: now.plus({ minutes: 15 }).toFormat('yyyyMMddHHmmss'),
    };
    return vnpayBuildUrl(
      this.config.get<string>('VNP_URL') ?? '',
      params,
      this.config.get<string>('VNP_HASH_SECRET') ?? '',
    );
  }

  private async buildMomoUrl(
    bookingId: string,
    amount: number,
    providerTxnRef: string,
  ): Promise<string> {
    const partnerCode = this.config.get<string>('MOMO_PARTNER_CODE') ?? '';
    const accessKey = this.config.get<string>('MOMO_ACCESS_KEY') ?? '';
    const secretKey = this.config.get<string>('MOMO_SECRET_KEY') ?? '';
    const apiUrl = this.config.get<string>('MOMO_API_URL') ?? '';
    const redirectUrl = this.config.get<string>('MOMO_REDIRECT_URL') ?? '';
    const ipnUrl = this.config.get<string>('MOMO_IPN_URL') ?? '';
    const orderInfo = ORDER_INFO(bookingId);

    const body = {
      partnerCode,
      requestId: providerTxnRef,
      amount,
      orderId: providerTxnRef,
      orderInfo,
      redirectUrl,
      ipnUrl,
      requestType: 'captureWallet',
      extraData: '',
      lang: 'vi',
      signature: momoCreateSignature(
        {
          accessKey,
          amount,
          extraData: '',
          ipnUrl,
          orderId: providerTxnRef,
          orderInfo,
          partnerCode,
          redirectUrl,
          requestId: providerTxnRef,
          requestType: 'captureWallet',
        },
        secretKey,
      ),
    };

    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new BusinessRuleException(MOMO_UNAVAILABLE_MESSAGE, 502);
    }
    if (!response.ok) {
      throw new BusinessRuleException(MOMO_UNAVAILABLE_MESSAGE, 502);
    }
    let json: { resultCode?: number; payUrl?: string };
    try {
      json = (await response.json()) as {
        resultCode?: number;
        payUrl?: string;
      };
    } catch {
      throw new BusinessRuleException(MOMO_UNAVAILABLE_MESSAGE, 502);
    }
    if (json.resultCode !== 0) {
      throw new BusinessRuleException(
        `MoMo từ chối yêu cầu thanh toán (resultCode=${json.resultCode})`,
        502,
      );
    }
    return json.payUrl ?? '';
  }

  async handleVnpayIpn(
    params: Record<string, string>,
  ): Promise<VnpayIpnResult> {
    // Verify chữ ký ĐẦU TIÊN — sai/mất chữ ký → 401, không đổi trạng thái
    if (
      !vnpayVerify(params, this.config.get<string>('VNP_HASH_SECRET') ?? '')
    ) {
      return { httpStatus: 401, rspCode: '97', message: 'Invalid signature' };
    }

    const txn = await this.prisma.paymentTransaction.findUnique({
      where: {
        provider_providerTxnRef: {
          provider: PaymentProvider.vnpay,
          providerTxnRef: params['vnp_TxnRef'] ?? '',
        },
      },
      include: { booking: true },
    });
    if (!txn) {
      return { httpStatus: 200, rspCode: '01', message: 'Order not found' };
    }
    if (Number(params['vnp_Amount']) / 100 !== txn.amount) {
      return { httpStatus: 200, rspCode: '02', message: 'Amount invalid' };
    }
    if (txn.status === PaymentStatus.success) {
      return { httpStatus: 200, rspCode: '04', message: 'Already processed' };
    }
    // Booking đã hủy → coi như không xử lý được, VNPay sẽ retry; admin tự hoàn
    // tiền thủ công (lựa chọn đã ghi nhận trong kế hoạch dự án).
    if (txn.booking.status === BookingStatus.cancelled) {
      return { httpStatus: 200, rspCode: '01', message: 'Order not found' };
    }

    // Ghi chú: VNPay tự có sample page hiển thị mã lỗi khác (vd "10"),
    // nhưng kế hoạch dự án quy định 01/02/04 cho not found/mismatch/duplicate.
    if (
      params['vnp_ResponseCode'] === '00' &&
      params['vnp_TransactionStatus'] === '00'
    ) {
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentTransaction.update({
          where: { id: txn.id },
          data: { status: PaymentStatus.success, rawPayload: params },
        });
        // Chỉ cập nhật paid nếu chưa paid — tránh ghi đè refunded/failed
        if (txn.booking.depositStatus !== DepositStatus.paid) {
          await tx.booking.update({
            where: { id: txn.bookingId },
            data: { depositStatus: DepositStatus.paid },
          });
        }
      });
      return { httpStatus: 200, rspCode: '00', message: 'Confirm Success' };
    }

    // Thanh toán thất bại/bị hủy: xác nhận đã nhận, ghi nhận failed, booking giữ nguyên
    await this.prisma.paymentTransaction.update({
      where: { id: txn.id },
      data: { status: PaymentStatus.failed, rawPayload: params },
    });
    return { httpStatus: 200, rspCode: '00', message: 'Confirm Success' };
  }

  async handleMomoIpn(body: Record<string, unknown>): Promise<MomoIpnResult> {
    const secretKey = this.config.get<string>('MOMO_SECRET_KEY') ?? '';
    const accessKey = this.config.get<string>('MOMO_ACCESS_KEY') ?? '';
    if (
      !momoVerifyIpn(
        body as Record<string, string | number>,
        secretKey,
        accessKey,
      )
    ) {
      return { httpStatus: 401, body: 'Invalid signature' };
    }

    const orderId = typeof body['orderId'] === 'string' ? body['orderId'] : '';
    const txn = await this.prisma.paymentTransaction.findUnique({
      where: {
        provider_providerTxnRef: {
          provider: PaymentProvider.momo,
          providerTxnRef: orderId,
        },
      },
      include: { booking: true },
    });
    if (!txn) {
      // Trả 400 để MoMo retry; không đổi trạng thái
      return { httpStatus: 400, body: 'Invalid request' };
    }
    if (Number(body['amount']) !== txn.amount) {
      return { httpStatus: 400, body: 'Invalid request' };
    }
    if (txn.status === PaymentStatus.success) {
      // Idempotent: đã xử lý thành công, trả OK mà không xử lý lại
      return { httpStatus: 200, body: 'OK' };
    }
    // Booking đã hủy → 400 để MoMo retry; admin tự hoàn tiền thủ công
    // (lựa chọn đã ghi nhận trong kế hoạch dự án).
    if (txn.booking.status === BookingStatus.cancelled) {
      return { httpStatus: 400, body: 'Invalid request' };
    }

    if (body['resultCode'] === 0 || body['resultCode'] === '0') {
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentTransaction.update({
          where: { id: txn.id },
          data: {
            status: PaymentStatus.success,
            rawPayload: body as Prisma.InputJsonObject,
          },
        });
        // Chỉ cập nhật paid nếu chưa paid — tránh ghi đè refunded/failed
        if (txn.booking.depositStatus !== DepositStatus.paid) {
          await tx.booking.update({
            where: { id: txn.bookingId },
            data: { depositStatus: DepositStatus.paid },
          });
        }
      });
      return { httpStatus: 200, body: 'OK' };
    }

    // resultCode != 0 → thanh toán thất bại: ghi nhận failed, vẫn trả OK
    // để MoMo biết merchant đã nhận IPN.
    await this.prisma.paymentTransaction.update({
      where: { id: txn.id },
      data: {
        status: PaymentStatus.failed,
        rawPayload: body as Prisma.InputJsonObject,
      },
    });
    return { httpStatus: 200, body: 'OK' };
  }
}
