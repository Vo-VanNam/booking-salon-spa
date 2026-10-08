import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Service } from '@prisma/client';
import type { AuthUser } from '../auth/auth.decorators';
import { assertBranchAccess } from '../common/branch-access';
import { serviceJson } from '../common/serializers';
import { PrismaService } from '../prisma/prisma.module';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: string) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException('Không tìm thấy dịch vụ.');
    return serviceJson(service);
  }

  async create(dto: CreateServiceDto, user: AuthUser) {
    assertBranchAccess(user, dto.branch_id);
    const branch = await this.prisma.branch.findUnique({ where: { id: dto.branch_id } });
    if (!branch) throw new BadRequestException('Chi nhánh không tồn tại.');

    const duration = this.duration(dto.duration_minutes, dto.duration);
    const service = await this.prisma.service.create({
      data: {
        branchId: dto.branch_id,
        name: dto.name,
        description: dto.description ?? null,
        price: dto.price,
        durationMinutes: duration,
        isActive: dto.is_active ?? true,
      },
    });
    return serviceJson(service);
  }

  async update(id: string, dto: UpdateServiceDto, user: AuthUser) {
    const existing = await this.requireService(id);
    assertBranchAccess(user, existing.branchId);
    if (dto.branch_id) {
      assertBranchAccess(user, dto.branch_id);
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branch_id } });
      if (!branch) throw new BadRequestException('Chi nhánh không tồn tại.');
    }
    const duration = this.duration(dto.duration_minutes, dto.duration, existing.durationMinutes);

    const service = await this.prisma.service.update({
      where: { id },
      data: {
        branchId: dto.branch_id,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        durationMinutes: duration,
        isActive: dto.is_active,
      },
    });
    return serviceJson(service);
  }

  /** Ẩn dịch vụ (soft delete) để không phá vỡ lịch sử booking đã có. */
  async deactivate(id: string, user: AuthUser) {
    const existing = await this.requireService(id);
    assertBranchAccess(user, existing.branchId);
    const service = await this.prisma.service.update({ where: { id }, data: { isActive: false } });
    return serviceJson(service);
  }

  private duration(primary?: number, alias?: number, fallback?: number): number {
    const value = primary ?? alias ?? fallback;
    if (value === undefined) throw new BadRequestException('Vui lòng nhập thời lượng dịch vụ (phút).');
    return value;
  }

  private async requireService(id: string): Promise<Service> {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException('Không tìm thấy dịch vụ.');
    return service;
  }
}
