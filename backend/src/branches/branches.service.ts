import { Injectable, NotFoundException } from '@nestjs/common';
import { branchJson, serviceJson, stylistJson } from '../common/serializers';
import { PrismaService } from '../prisma/prisma.module';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Danh sách chi nhánh công khai, sắp xếp theo id tăng dần (yêu cầu của harness). */
  async list() {
    const branches = await this.prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    return branches.map(branchJson);
  }

  async getById(id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('Không tìm thấy chi nhánh.');
    return branchJson(branch);
  }

  async listServices(branchId: string, includeInactive = false) {
    await this.ensureBranch(branchId);
    const services = await this.prisma.service.findMany({
      where: { branchId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { id: 'asc' },
    });
    return services.map(serviceJson);
  }

  async listStylists(branchId: string, includeInactive = false) {
    await this.ensureBranch(branchId);
    const stylists = await this.prisma.stylist.findMany({
      where: { branchId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { id: 'asc' },
    });
    return stylists.map(stylistJson);
  }

  async create(dto: CreateBranchDto) {
    const branch = await this.prisma.branch.create({
      data: {
        name: dto.name,
        address: dto.address,
        openTime: dto.open_time ?? '08:00',
        closeTime: dto.close_time ?? '20:00',
        isActive: dto.is_active ?? true,
      },
    });
    return branchJson(branch);
  }

  async update(id: string, dto: UpdateBranchDto) {
    await this.ensureBranch(id);
    const branch = await this.prisma.branch.update({
      where: { id },
      data: {
        name: dto.name,
        address: dto.address,
        openTime: dto.open_time,
        closeTime: dto.close_time,
        isActive: dto.is_active,
      },
    });
    return branchJson(branch);
  }

  private async ensureBranch(id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id }, select: { id: true } });
    if (!branch) throw new NotFoundException('Không tìm thấy chi nhánh.');
  }
}
