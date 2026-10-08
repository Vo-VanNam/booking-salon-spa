import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { CreateStylistDto, SetWorkingHoursDto, TimeOffDto, UpdateStylistDto } from './dto/stylist.dto';
import { StylistsService } from './stylists.service';

@Controller('stylists')
export class StylistsController {
  constructor(private readonly stylistsService: StylistsService) {}

  @Public()
  @Get(':stylistId')
  getById(@Param('stylistId') stylistId: string) {
    return this.stylistsService.getById(stylistId);
  }

  @Roles('super_admin', 'branch_admin')
  @Post()
  create(@Body() dto: CreateStylistDto, @CurrentUser() user: AuthUser) {
    return this.stylistsService.create(dto, user);
  }

  @Roles('super_admin', 'branch_admin')
  @Patch(':stylistId')
  update(@Param('stylistId') stylistId: string, @Body() dto: UpdateStylistDto, @CurrentUser() user: AuthUser) {
    return this.stylistsService.update(stylistId, dto, user);
  }

  @Public()
  @Get(':stylistId/working-hours')
  workingHours(@Param('stylistId') stylistId: string) {
    return this.stylistsService.listWorkingHours(stylistId);
  }

  @Roles('super_admin', 'branch_admin')
  @Put(':stylistId/working-hours')
  setWorkingHours(@Param('stylistId') stylistId: string, @Body() dto: SetWorkingHoursDto, @CurrentUser() user: AuthUser) {
    return this.stylistsService.setWorkingHours(stylistId, dto, user);
  }

  @Public()
  @Get(':stylistId/time-off')
  timeOff(@Param('stylistId') stylistId: string, @Query('from') _from?: string) {
    return this.stylistsService.listTimeOff(stylistId);
  }

  @Roles('super_admin', 'branch_admin')
  @Post(':stylistId/time-off')
  addTimeOff(@Param('stylistId') stylistId: string, @Body() dto: TimeOffDto, @CurrentUser() user: AuthUser) {
    return this.stylistsService.addTimeOff(stylistId, dto, user);
  }

  @Roles('super_admin', 'branch_admin')
  @Delete(':stylistId/time-off/:timeOffId')
  removeTimeOff(
    @Param('stylistId') stylistId: string,
    @Param('timeOffId') timeOffId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stylistsService.removeTimeOff(stylistId, timeOffId, user);
  }
}
