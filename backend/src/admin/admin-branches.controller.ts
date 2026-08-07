import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Roles('super_admin')
@Controller('admin/branches')
export class AdminBranchesController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  listBranches() {
    return this.adminService.listBranches();
  }

  @Post()
  @HttpCode(201)
  createBranch(@Body() dto: CreateBranchDto) {
    return this.adminService.createBranch(dto);
  }

  @Patch(':id')
  updateBranch(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.adminService.updateBranch(id, dto);
  }

  @Delete(':id')
  deactivateBranch(@Param('id') id: string) {
    return this.adminService.deactivateBranch(id);
  }
}
