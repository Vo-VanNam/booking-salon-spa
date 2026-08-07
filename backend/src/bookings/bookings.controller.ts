import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { BookingService } from './bookings.service';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingService: BookingService) {}

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateBookingDto, @CurrentUser() user: AuthUser) {
    const booking = await this.bookingService.create(dto, user.sub);
    return {
      id: booking.id,
      branchId: booking.branchId,
      serviceId: booking.serviceId,
      stylistId: booking.stylistId,
      customerId: booking.customerId,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      priceAtBooking: booking.priceAtBooking,
      discountAmount: booking.discountAmount,
      depositAmount: booking.depositAmount,
      depositStatus: booking.depositStatus,
    };
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bookingService.cancel(id, user.sub, dto);
  }

  @Patch(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  async reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleBookingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bookingService.reschedule(id, user.sub, dto);
  }
}
