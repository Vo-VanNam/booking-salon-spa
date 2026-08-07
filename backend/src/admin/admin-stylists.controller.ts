import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { CreateStylistDto } from './dto/create-stylist.dto';
import { UpdateStylistDto } from './dto/update-stylist.dto';
import { WorkingHoursDto } from './dto/working-hours.dto';
import { CreateTimeOffDto } from './dto/time-off.dto';

@Roles('branch_admin', 'super_admin')
@Controller('admin/stylists')
export class AdminStylistsController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  listStylists(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.adminService.listStylists(user, branchId);
  }

  @Post()
  @HttpCode(201)
  createStylist(@CurrentUser() user: AuthUser, @Body() dto: CreateStylistDto) {
    return this.adminService.createStylist(user, dto);
  }

  @Patch(':id')
  updateStylist(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStylistDto,
  ) {
    return this.adminService.updateStylist(user, id, dto);
  }

  @Put(':id/working-hours')
  replaceWorkingHours(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: WorkingHoursDto,
  ) {
    return this.adminService.replaceWorkingHours(user, id, dto);
  }

  @Post(':id/time-off')
  @HttpCode(201)
  createTimeOff(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateTimeOffDto,
  ) {
    return this.adminService.createTimeOff(user, id, dto);
  }

  @Delete(':id/time-off/:timeOffId')
  deleteTimeOff(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('timeOffId') timeOffId: string,
  ) {
    return this.adminService.deleteTimeOff(user, id, timeOffId);
  }
}
