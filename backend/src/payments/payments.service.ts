import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { momoConfig, momoConfigured, vnpayConfig, vnpayConfigured } from '../common/config';
import { AppLogger } from '../common/logger';
import { PrismaService } from '../prisma/prisma.module';
import { BookingsService } from '../bookings/bookings.service';
import { createMomoPayment, verifyMomoSignature } from './momo.adapter';
import { buildVnpayPaymentUrl, verifyVnpaySignature } from './vnpay.adapter';

export interface DepositResult {
  payment_url: string;
  txn_ref: string;
  amount: number;
  provider: 'vnpay' | 'momo';
  booking_id: string;
}

export interface WebhookResult {
  status: 'ok' | 'already_processed';
  booking_id?: string;
  deposit_status?: string;
  deposit_amount?: number;
  message?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new AppLogger('payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
  ) {}

  // ─────────────────────────── Tạo thanh toán ───────────────────────────

  async createDeposit(bookingId: string, provider: 'vnpay' | 'momo', ipAddr: string): Promise<DepositResult> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Không tìm thấy lịch hẹn.');
    if (booking.status === 'cancelled' || booking.status === 'no_show') {
      throw new BadRequestException('Không thể đặt cọc cho lịch hẹn đã hủy hoặc không đến.');
    }
    if (booking.depositStatus === 'paid') {
      throw new BadRequestException('Lịch hẹn này đã được thanh toán tiền cọc.');
    }

    const amount = booking.depositAmount > 0 ? booking.depositAmount : booking.price - booking.discountAmount;
    if (amount <= 0) throw new BadRequestException('Lịch hẹn không có khoản cọc cần thanh toán.');

    const orderInfo = `Dat coc lich hen ${booking.id.slice(0, 12)}`;

    if (provider === 'momo') {
      if (!momoConfigured()) {
        throw new BadRequestException(
          'Cổng thanh toán Momo chưa được cấu hình. Vui lòng liên hệ quản trị viên hoặc thanh toán tại quầy.',
        );
      }
      const config = momoConfig();
      let created;
      try {
        created = await createMomoPayment(config, {
          orderId: booking.id,
          requestId: randomUUID(),
          amountVnd: amount,
          orderInfo,
        });
      } catch (error) {
        this.logger.error('Tạo giao dịch Momo thất bại', undefined, {
          booking_id: booking.id,
          message: error instanceof Error ? error.message : String(error),
        });
        throw new BadGatewayException('Không tạo được giao dịch Momo. Vui lòng thử lại sau.');
      }
      await this.upsertTransaction('momo', booking.id, amount, { payment_url: created.payUrl }, 'pending');
      return { payment_url: created.payUrl, txn_ref: booking.id, amount, provider: 'momo', booking_id: booking.id };
    }

    if (!vnpayConfigured()) {
      throw new BadRequestException(
        'Cổng thanh toán VNPay chưa được cấu hình. Vui lòng thanh toán tại quầy hoặc liên hệ quản trị viên.',
      );
    }
    const config = vnpayConfig();
    const paymentUrl = buildVnpayPaymentUrl(config, {
      amountVnd: amount,
      txnRef: booking.id,
      orderInfo,
      ipAddr,
    });
    await this.upsertTransaction('vnpay', booking.id, amount, { payment_url: paymentUrl }, 'pending');
    this.logger.log('Đã tạo yêu cầu thanh toán VNPay', { booking_id: booking.id, amount });

    return { payment_url: paymentUrl, txn_ref: booking.id, amount, provider: 'vnpay', booking_id: booking.id };
  }

  private async upsertTransaction(
    provider: 'vnpay' | 'momo',
    bookingId: string,
    amount: number,
    payload: Record<string, unknown>,
    status: 'pending' | 'success' | 'failed',
  ): Promise<void> {
    await this.prisma.paymentTransaction.upsert({
      where: { provider_txnRef: { provider, txnRef: bookingId } },
      update: { amount, status, rawPayload: payload as object },
      create: { bookingId, provider, txnRef: bookingId, amount, status, rawPayload: payload as object },
    });
  }

  // ─────────────────────────── Webhook ───────────────────────────

  /**
   * Webhook VNPay: verify chữ ký trước khi tin payload; ghi nhận cọc đúng một lần cho mỗi vnp_TxnRef
   * (khoá row booking + ràng buộc unique (provider, txn_ref)).
   */
  async handleVnpayWebhook(body: Record<string, unknown>): Promise<WebhookResult> {
    const config = vnpayConfig();
    if (!config.hashSecret) {
      throw new BadRequestException('Chưa cấu hình VNPAY_HASH_SECRET để xác thực chữ ký webhook.');
    }

    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(body ?? {})) {
      if (value === undefined || value === null) continue;
      params[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
    }

    if (!verifyVnpaySignature(params, config.hashSecret)) {
      this.logger.warn('Webhook VNPay có chữ ký không hợp lệ', { txn_ref: params.vnp_TxnRef });
      throw new BadRequestException('Chữ ký webhook VNPay không hợp lệ.');
    }

    const txnRef = params.vnp_TxnRef ?? '';
    const amount = Number.parseInt(params.vnp_Amount ?? '0', 10) || 0;
    const responseCode = params.vnp_ResponseCode;
    const succeeded = responseCode === undefined || responseCode === '' || responseCode === '00';

    const booking = await this.bookingsService.getByRef(txnRef);
    if (!booking) {
      this.logger.warn('Webhook VNPay không khớp lịch hẹn nào', { txn_ref: txnRef });
      return { status: 'ok', message: 'Không tìm thấy lịch hẹn tương ứng giao dịch.' };
    }

    if (!succeeded) {
      await this.upsertTransaction('vnpay', booking.id, amount || booking.depositAmount, params, 'failed');
      this.logger.warn('Giao dịch VNPay không thành công', { booking_id: booking.id, response_code: responseCode });
      return { status: 'ok', booking_id: booking.id, deposit_status: booking.depositStatus, message: 'Giao dịch không thành công.' };
    }

    const alreadyProcessed = await this.creditDeposit('vnpay', booking.id, txnRef, amount, params);
    const fresh = await this.prisma.booking.findUnique({ where: { id: booking.id } });
    return {
      status: alreadyProcessed ? 'already_processed' : 'ok',
      booking_id: booking.id,
      deposit_status: fresh?.depositStatus ?? 'paid',
      deposit_amount: fresh?.depositAmount ?? amount,
    };
  }

  /** Webhook Momo (IPN): cùng cơ chế idempotent. */
  async handleMomoWebhook(body: Record<string, unknown>): Promise<WebhookResult> {
    if (!momoConfigured()) {
      throw new BadRequestException('Chưa cấu hình Momo để xác thực chữ ký webhook.');
    }
    const config = momoConfig();
    if (!verifyMomoSignature(body ?? {}, config)) {
      this.logger.warn('Webhook Momo có chữ ký không hợp lệ', { order_id: body?.orderId });
      throw new BadRequestException('Chữ ký webhook Momo không hợp lệ.');
    }

    const txnRef = String(body.orderId ?? '');
    const amount = Number(body.amount ?? 0) || 0;
    const succeeded = Number(body.resultCode ?? 0) === 0;

    const booking = await this.bookingsService.getByRef(txnRef);
    if (!booking) {
      return { status: 'ok', message: 'Không tìm thấy lịch hẹn tương ứng giao dịch.' };
    }
    if (!succeeded) {
      await this.upsertTransaction('momo', booking.id, amount || booking.depositAmount, body, 'failed');
      return { status: 'ok', booking_id: booking.id, deposit_status: booking.depositStatus, message: 'Giao dịch không thành công.' };
    }

    const alreadyProcessed = await this.creditDeposit('momo', booking.id, txnRef, amount, body);
    const fresh = await this.prisma.booking.findUnique({ where: { id: booking.id } });
    return {
      status: alreadyProcessed ? 'already_processed' : 'ok',
      booking_id: booking.id,
      deposit_status: fresh?.depositStatus ?? 'paid',
      deposit_amount: fresh?.depositAmount ?? amount,
    };
  }

  /**
   * Ghi nhận tiền cọc đúng một lần. Trả về true nếu giao dịch đã được xử lý trước đó.
   */
  private async creditDeposit(
    provider: 'vnpay' | 'momo',
    bookingId: string,
    txnRef: string,
    amount: number,
    rawPayload: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Khoá row booking: hai callback song song cho cùng booking sẽ chạy tuần tự.
        await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;

        const existing = await tx.paymentTransaction.findUnique({
          where: { provider_txnRef: { provider, txnRef } },
        });
        if (existing?.status === 'success') return true;

        if (existing) {
          await tx.paymentTransaction.update({
            where: { id: existing.id },
            data: {
              status: 'success',
              amount: amount > 0 ? amount : existing.amount,
              rawPayload: rawPayload as object,
              signatureValid: true,
              processedAt: new Date(),
              message: 'Đã xác thực chữ ký và ghi nhận tiền cọc',
            },
          });
        } else {
          await tx.paymentTransaction.create({
            data: {
              bookingId,
              provider,
              txnRef,
              amount,
              status: 'success',
              rawPayload: rawPayload as object,
              signatureValid: true,
              processedAt: new Date(),
              message: 'Đã xác thực chữ ký và ghi nhận tiền cọc',
            },
          });
        }

        const booking = await tx.booking.findUnique({ where: { id: bookingId } });
        if (booking && booking.depositStatus !== 'paid') {
          await tx.booking.update({
            where: { id: bookingId },
            data: {
              depositStatus: 'paid',
              // Chỉ điền khi chưa có số tiền cọc; các callback sau không làm thay đổi giá trị này.
              depositAmount: booking.depositAmount > 0 ? booking.depositAmount : amount,
            },
          });
        }
        this.logger.log('Đã ghi nhận tiền cọc', { booking_id: bookingId, provider, txn_ref: txnRef, amount });
        return false;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Callback trùng được gửi song song → đã có bản ghi thành công.
        return true;
      }
      throw error;
    }
  }

  async listTransactions(bookingId: string) {
    const items = await this.prisma.paymentTransaction.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((item) => ({
      id: item.id,
      provider: item.provider,
      txn_ref: item.txnRef,
      amount: item.amount,
      status: item.status,
      signature_valid: item.signatureValid,
      message: item.message,
      processed_at: item.processedAt?.toISOString() ?? null,
      created_at: item.createdAt.toISOString(),
    }));
  }
}
