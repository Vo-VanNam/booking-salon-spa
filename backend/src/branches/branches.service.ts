import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive() {
    return this.prisma.branch.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        openTime: true,
        closeTime: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getActive(id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, active: true },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        openTime: true,
        closeTime: true,
      },
    });
    if (!branch) {
      throw new NotFoundException('Không tìm thấy chi nhánh');
    }
    return branch;
  }

  async getServices(branchId: string) {
    await this.ensureActive(branchId);
    return this.prisma.service.findMany({
      where: { branchId, active: true },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        durationMinutes: true,
      },
      orderBy: { price: 'asc' },
    });
  }

  async getStylists(branchId: string) {
    await this.ensureActive(branchId);
    return this.prisma.stylist.findMany({
      where: { branchId, active: true },
      select: {
        id: true,
        name: true,
        phone: true,
        avatarUrl: true,
        workingHours: {
          select: { dayOfWeek: true, startTime: true, endTime: true },
          orderBy: { dayOfWeek: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  private async ensureActive(id: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id, active: true },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Không tìm thấy chi nhánh');
    }
  }
}
