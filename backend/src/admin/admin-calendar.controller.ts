import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { CalendarQueryDto } from './dto/calendar-query.dto';

@Roles('branch_admin', 'super_admin')
@Controller('admin')
export class AdminCalendarController {
  constructor(private readonly adminService: AdminService) {}

  @Get('calendar')
  getCalendar(@CurrentUser() user: AuthUser, @Query() query: CalendarQueryDto) {
    return this.adminService.getCalendar(user, query);
  }

  @Get('revenue')
  getRevenue(@CurrentUser() user: AuthUser, @Query() query: CalendarQueryDto) {
    return this.adminService.getRevenue(user, query);
  }
}
