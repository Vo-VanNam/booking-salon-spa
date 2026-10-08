import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Public()
  @Get(':serviceId')
  getById(@Param('serviceId') serviceId: string) {
    return this.servicesService.getById(serviceId);
  }

  @Roles('super_admin', 'branch_admin')
  @Post()
  create(@Body() dto: CreateServiceDto, @CurrentUser() user: AuthUser) {
    return this.servicesService.create(dto, user);
  }

  @Roles('super_admin', 'branch_admin')
  @Patch(':serviceId')
  update(@Param('serviceId') serviceId: string, @Body() dto: UpdateServiceDto, @CurrentUser() user: AuthUser) {
    return this.servicesService.update(serviceId, dto, user);
  }

  @Roles('super_admin', 'branch_admin')
  @Delete(':serviceId')
  remove(@Param('serviceId') serviceId: string, @CurrentUser() user: AuthUser) {
    return this.servicesService.deactivate(serviceId, user);
  }
}
