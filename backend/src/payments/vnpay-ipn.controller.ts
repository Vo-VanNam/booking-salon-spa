import { Controller, Get, Post, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

@Controller('payments/vnpay/ipn')
export class VnpayIpnController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async handleIpnGet(
    @Query() params: Record<string, string | string[]>,
    @Res() res: Response,
  ): Promise<void> {
    await this.handle(params, res);
  }

  @Public()
  @SkipThrottle()
  @Post()
  async handleIpnPost(
    @Query() params: Record<string, string | string[]>,
    @Res() res: Response,
  ): Promise<void> {
    await this.handle(params, res);
  }

  // Query của VNPay có thể lặp param dạng mảng → lấy giá trị đầu tiên
  private async handle(
    params: Record<string, string | string[]>,
    res: Response,
  ): Promise<void> {
    const flat: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      flat[key] = Array.isArray(value) ? (value[0] ?? '') : value;
    }
    const result = await this.paymentsService.handleVnpayIpn(flat);
    res.status(result.httpStatus).json({
      RspCode: result.rspCode,
      Message: result.message,
    });
  }
}
