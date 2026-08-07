import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TimeService } from '../time/time.service';
import { SlotResult, SlotsService } from './slots.service';

const DEFAULT_DURATION_MINUTES = 30;
const MAX_DURATION_MINUTES = 480;

@Public()
@Controller('stylists')
export class SlotsController {
  constructor(
    private readonly slots: SlotsService,
    private readonly time: TimeService,
  ) {}

  @Get(':id/slots')
  async getSlots(
    @Param('id') stylistId: string,
    @Query('branchId') branchId?: string,
    @Query('date') date?: string,
    @Query('durationMinutes') durationMinutes?: string,
  ): Promise<SlotResult> {
    if (!branchId) {
      throw new BadRequestException('Thiếu chi nhánh');
    }
    if (!date || !this.isValidDate(date)) {
      throw new BadRequestException('Ngày không hợp lệ');
    }
    const duration =
      durationMinutes === undefined || durationMinutes === ''
        ? DEFAULT_DURATION_MINUTES
        : Number(durationMinutes);
    if (
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > MAX_DURATION_MINUTES
    ) {
      throw new BadRequestException('Thời lượng không hợp lệ');
    }
    return this.slots.getSlots(branchId, stylistId, date, duration);
  }

  private isValidDate(date: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return false;
    }
    try {
      this.time.parseVnDate(date);
      return true;
    } catch {
      return false;
    }
  }
}
