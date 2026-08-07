import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Roles('branch_admin', 'super_admin')
@Controller('admin/services')
export class AdminServicesController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  listServices(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.adminService.listServices(user, branchId);
  }

  @Post()
  @HttpCode(201)
  createService(@CurrentUser() user: AuthUser, @Body() dto: CreateServiceDto) {
    return this.adminService.createService(user, dto);
  }

  @Patch(':id')
  updateService(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.adminService.updateService(user, id, dto);
  }

  @Delete(':id')
  deactivateService(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.adminService.deactivateService(user, id);
  }
}
