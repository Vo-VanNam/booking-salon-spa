import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { RateLimit } from '../common/rate-limit.guard';
import { BookingsService } from './bookings.service';
import { CancelBookingDto, CreateBookingDto, RescheduleBookingDto } from './dto/booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * Khách tự đặt lịch (không cần đăng nhập). Rate limit đủ rộng để không chặn các chuỗi đặt lịch
   * hợp lệ (hợp đồng harness yêu cầu tối thiểu 60 lượt/phút).
   */
  @Public()
  @Post()
  @RateLimit({ key: 'bookings-create', limit: 600, windowSeconds: 60 })
  create(@Body() dto: CreateBookingDto) {
    return this.bookingsService.create(
      {
        branchId: dto.branch_id,
        serviceId: dto.service_id,
        stylistId: dto.stylist_id,
        startTime: dto.start_time,
        customerName: dto.customer_name,
        customerPhone: dto.customer_phone,
        customerEmail: dto.customer_email ?? null,
        note: dto.note ?? null,
        source: dto.source ?? 'web',
      },
      { actor: dto.source === 'ai' ? 'ai' : 'web' },
    );
  }

  @Public()
  @Get()
  listByPhone(@Query('phone') phone: string) {
    return this.bookingsService.listByPhone(phone);
  }

  @Public()
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.bookingsService.getById(id);
  }

  @Public()
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() dto: CancelBookingDto) {
    return this.bookingsService.cancel(id, dto.reason);
  }

  @Public()
  @Post(':id/reschedule')
  @HttpCode(200)
  reschedule(@Param('id') id: string, @Body() dto: RescheduleBookingDto) {
    return this.bookingsService.reschedule(id, { startTime: dto.start_time, stylistId: dto.stylist_id });
  }

  @Roles('super_admin', 'branch_admin')
  @Post(':id/complete')
  @HttpCode(200)
  complete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.bookingsService.complete(id, user);
  }

  @Roles('super_admin', 'branch_admin')
  @Post(':id/no-show')
  @HttpCode(200)
  markNoShow(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.bookingsService.markNoShow(id, user);
  }
}
