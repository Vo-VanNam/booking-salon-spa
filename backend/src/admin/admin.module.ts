import { Module } from '@nestjs/common';
import { TimeService } from '../time/time.service';
import { AdminBranchesController } from './admin-branches.controller';
import { AdminCalendarController } from './admin-calendar.controller';
import { AdminController } from './admin.controller';
import { AdminRevenueService } from './admin-revenue.service';
import { AdminServicesController } from './admin-services.controller';
import { AdminService } from './admin.service';
import { AdminStylistsController } from './admin-stylists.controller';

@Module({
  controllers: [
    AdminController,
    AdminBranchesController,
    AdminCalendarController,
    AdminServicesController,
    AdminStylistsController,
  ],
  providers: [AdminService, TimeService, AdminRevenueService],
})
export class AdminModule {}
