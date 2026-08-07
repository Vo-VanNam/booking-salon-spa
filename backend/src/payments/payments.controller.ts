import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DepositDto } from './dto/deposit.dto';
import { PaymentsService } from './payments.service';

@Controller('bookings')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':id/deposit')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async createDeposit(
    @Param('id') id: string,
    @Body() dto: DepositDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.paymentsService.createDeposit(id, user, dto, req.ip ?? '');
  }
}
