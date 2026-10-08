import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { BookingsService } from '../bookings/bookings.service';
import { AdminRangeQueryDto, UpdateBookingStatusDto } from './dto/admin-query.dto';
import { AdminService } from './admin.service';

/** Dashboard quản trị (DOCUMENT.md §2.6): chỉ branch_admin / super_admin. */
@Controller('admin')
@Roles('super_admin', 'branch_admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly bookingsService: BookingsService,
  ) {}

  @Get('revenue')
  revenue(@CurrentUser() user: AuthUser, @Query() query: AdminRangeQueryDto) {
    return this.adminService.revenue(user, query);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser, @Query() query: AdminRangeQueryDto) {
    return this.adminService.dashboard(user, { branch_id: query.branch_id, date: query.date });
  }

  @Get('bookings')
  listBookings(@CurrentUser() user: AuthUser, @Query() query: AdminRangeQueryDto) {
    const branchId = user.role === 'super_admin' ? (query.branch_id ?? null) : user.branchId;
    return this.bookingsService.listForAdmin({
      branchId,
      from: query.from,
      to: query.to,
      status: query.status,
    });
  }

  @Get('analytics/top-services')
  topServices(@CurrentUser() user: AuthUser, @Query() query: AdminRangeQueryDto) {
    return this.adminService.topServices(user, query);
  }

  @Get('analytics/top-stylists')
  topStylists(@CurrentUser() user: AuthUser, @Query() query: AdminRangeQueryDto) {
    return this.adminService.topStylists(user, query);
  }

  @Get('analytics/cancellation-rate')
  cancellationRate(@CurrentUser() user: AuthUser, @Query() query: AdminRangeQueryDto) {
    return this.adminService.cancellationRate(user, query);
  }

  @Patch('bookings/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateBookingStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Truyền user xuống cả ba nhánh: branch_admin chỉ thao tác được trong chi nhánh mình.
    if (body.status === 'completed') return this.bookingsService.complete(id, user);
    if (body.status === 'cancelled') return this.bookingsService.cancel(id, undefined, user);
    return this.bookingsService.markNoShow(id, user);
  }
}
