import { Body, Controller, Post, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

@Controller('payments/momo/ipn')
export class MomoIpnController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @SkipThrottle()
  @Post()
  async handleIpn(
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.paymentsService.handleMomoIpn(body);
    res.status(result.httpStatus).send(result.body);
  }
}
