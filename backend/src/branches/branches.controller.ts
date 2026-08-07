import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { BranchesService } from './branches.service';

@Public()
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  list() {
    return this.branches.listActive();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.branches.getActive(id);
  }

  @Get(':id/services')
  services(@Param('id') id: string) {
    return this.branches.getServices(id);
  }

  @Get(':id/stylists')
  stylists(@Param('id') id: string) {
    return this.branches.getStylists(id);
  }
}
