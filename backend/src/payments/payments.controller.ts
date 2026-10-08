import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public, Roles } from '../auth/auth.decorators';
import { clientIp, RateLimit } from '../common/rate-limit.guard';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Đặt cọc online. Chưa cấu hình cổng thanh toán → 4xx kèm thông báo tiếng Việt (hợp đồng §6). */
  @Public()
  @Post('bookings/:id/deposit')
  @HttpCode(200)
  @RateLimit({ key: 'deposit-create', limit: 60, windowSeconds: 60 })
  deposit(
    @Param('id') id: string,
    @Query('provider') provider: string | undefined,
    @Req() request: Request,
  ) {
    const normalized = provider === 'momo' ? 'momo' : 'vnpay';
    return this.paymentsService.createDeposit(id, normalized, clientIp(request));
  }

  /**
   * Webhook VNPay (IPN). Xác thực chữ ký trước khi tin payload; idempotent theo (provider, vnp_TxnRef).
   * Không chặn bằng rate limit chặt vì cổng thanh toán có thể gọi lại nhiều lần.
   */
  @Public()
  @Post('webhooks/vnpay')
  @HttpCode(200)
  @RateLimit({ key: 'webhook-vnpay', limit: 600, windowSeconds: 60 })
  vnpayWebhook(@Body() body: Record<string, unknown>) {
    return this.paymentsService.handleVnpayWebhook(body);
  }

  @Public()
  @Post('webhooks/momo')
  @HttpCode(200)
  @RateLimit({ key: 'webhook-momo', limit: 600, windowSeconds: 60 })
  momoWebhook(@Body() body: Record<string, unknown>) {
    return this.paymentsService.handleMomoWebhook(body);
  }

  @Roles('super_admin', 'branch_admin')
  @Get('admin/payments')
  listTransactions(@Query('booking_id') bookingId: string) {
    return this.paymentsService.listTransactions(bookingId);
  }
}
