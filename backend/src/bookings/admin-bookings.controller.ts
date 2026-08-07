import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { Roles } from '../common/decorators/roles.decorator';
import { BookingService } from './bookings.service';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';

@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly bookingService: BookingService) {}

  // Dành cho kéo thả calendar (task 10): admin override quy tắc 24h của khách
  @Roles('branch_admin', 'super_admin')
  @Patch(':id/move')
  @HttpCode(HttpStatus.OK)
  async move(
    @Param('id') id: string,
    @Body() dto: RescheduleBookingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bookingService.reschedule(id, user.sub, dto, {
      adminOverride: true,
    });
  }

  // Admin đổi trạng thái: completed (cộng loyalty), no_show, cancelled
  @Roles('branch_admin', 'super_admin')
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bookingService.changeStatus(id, dto.status, user);
  }
}
