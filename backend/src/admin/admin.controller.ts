import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Roles('super_admin')
  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  createStaffUser(@Body() dto: CreateAdminUserDto) {
    return this.adminService.createStaffUser(dto);
  }
}
