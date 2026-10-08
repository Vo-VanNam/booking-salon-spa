import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { SlotQueryDto } from './dto/slot-query.dto';
import { SlotsService } from './slots.service';

@Controller('slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  /** GET /slots?branch_id=&stylist_id=&service_id=&date=YYYY-MM-DD (giờ Việt Nam). */
  @Public()
  @Get()
  async list(@Query() query: SlotQueryDto) {
    const slots = await this.slotsService.getSlots({
      branchId: query.branch_id,
      stylistId: query.stylist_id,
      serviceId: query.service_id,
      date: query.date,
    });
    return slots.map((slot) => ({
      start_time: slot.start_time,
      end_time: slot.end_time,
      branch_id: slot.branch_id,
      stylist_id: slot.stylist_id,
      service_id: slot.service_id,
      duration_minutes: slot.duration_minutes,
    }));
  }
}
