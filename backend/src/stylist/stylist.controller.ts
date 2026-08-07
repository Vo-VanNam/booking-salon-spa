import { Controller, Get, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BookingsQueryDto } from './dto/bookings-query.dto';
import { StylistService } from './stylist.service';

@Roles('stylist')
@Controller('stylist')
export class StylistController {
  constructor(private readonly stylistService: StylistService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.stylistService.getMe(user.sub);
  }

  @Get('me/bookings')
  bookings(@CurrentUser() user: AuthUser, @Query() query: BookingsQueryDto) {
    return this.stylistService.getBookings(user.sub, query.from, query.to);
  }

  @Get('me/today')
  today(@CurrentUser() user: AuthUser) {
    return this.stylistService.getTodayBookings(user.sub);
  }
}
