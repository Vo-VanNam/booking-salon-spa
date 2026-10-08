import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { assertBranchAccess } from '../common/branch-access';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Public()
  @Get()
  list() {
    return this.branchesService.list();
  }

  @Public()
  @Get(':branchId')
  getById(@Param('branchId') branchId: string) {
    return this.branchesService.getById(branchId);
  }

  @Public()
  @Get(':branchId/services')
  listServices(@Param('branchId') branchId: string, @Query('include_inactive') includeInactive?: string) {
    return this.branchesService.listServices(branchId, includeInactive === 'true');
  }

  @Public()
  @Get(':branchId/stylists')
  listStylists(@Param('branchId') branchId: string, @Query('include_inactive') includeInactive?: string) {
    return this.branchesService.listStylists(branchId, includeInactive === 'true');
  }

  @Roles('super_admin')
  @Post()
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @Roles('super_admin', 'branch_admin')
  @Patch(':branchId')
  update(@Param('branchId') branchId: string, @Body() dto: UpdateBranchDto, @CurrentUser() user: AuthUser) {
    assertBranchAccess(user, branchId);
    return this.branchesService.update(branchId, dto);
  }
}
