import { Controller, Get, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { StylistsService } from './stylists.service';

/** Trang riêng cho stylist, tối ưu cho điện thoại (DOCUMENT.md §2.7). */
@Controller('stylist')
export class StylistSelfController {
  constructor(private readonly stylistsService: StylistsService) {}

  @Roles('stylist')
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.stylistsService.me(user);
  }

  @Roles('stylist')
  @Get('me/bookings')
  myBookings(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.stylistsService.myBookings(user, from, to);
  }
}
