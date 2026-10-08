import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Stylist } from '@prisma/client';
import type { AuthUser } from '../auth/auth.decorators';
import { assertBranchAccess } from '../common/branch-access';
import { bookingJson, stylistJson } from '../common/serializers';
import { parseInstant, vnDayRangeUtc, vnDateKey } from '../common/time';
import { PrismaService } from '../prisma/prisma.module';
import { CreateStylistDto, SetWorkingHoursDto, TimeOffDto, UpdateStylistDto } from './dto/stylist.dto';

@Injectable()
export class StylistsService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: string) {
    const stylist = await this.requireStylist(id);
    const [workingHours, timeOff] = await Promise.all([
      this.prisma.workingHour.findMany({
        where: { stylistId: id },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.timeOff.findMany({ where: { stylistId: id, endTime: { gte: new Date() } }, orderBy: { startTime: 'asc' } }),
    ]);
    return {
      ...stylistJson(stylist),
      working_hours: workingHours.map((item) => ({
        id: item.id,
        day_of_week: item.dayOfWeek,
        start_time: item.startTime,
        end_time: item.endTime,
        is_active: item.isActive,
      })),
      time_off: timeOff.map((item) => ({
        id: item.id,
        start_time: item.startTime.toISOString(),
        end_time: item.endTime.toISOString(),
        reason: item.reason,
      })),
    };
  }

  async create(dto: CreateStylistDto, user: AuthUser) {
    assertBranchAccess(user, dto.branch_id);
    const branch = await this.prisma.branch.findUnique({ where: { id: dto.branch_id } });
    if (!branch) throw new BadRequestException('Chi nhánh không tồn tại.');

    const stylist = await this.prisma.stylist.create({
      data: {
        branchId: dto.branch_id,
        name: dto.name,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        bio: dto.bio ?? null,
        isActive: dto.is_active ?? true,
      },
    });

    // Mặc định giờ làm việc 08:00–20:00 cả tuần để stylist mới nhận được lịch ngay.
    await this.prisma.workingHour.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        stylistId: stylist.id,
        dayOfWeek,
        startTime: '08:00',
        endTime: '20:00',
      })),
    });
    return this.getById(stylist.id);
  }

  async update(id: string, dto: UpdateStylistDto, user: AuthUser) {
    const stylist = await this.requireStylist(id);
    assertBranchAccess(user, stylist.branchId);
    if (dto.branch_id) {
      assertBranchAccess(user, dto.branch_id);
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branch_id } });
      if (!branch) throw new BadRequestException('Chi nhánh không tồn tại.');
    }
    const updated = await this.prisma.stylist.update({
      where: { id },
      data: {
        branchId: dto.branch_id,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        bio: dto.bio,
        isActive: dto.is_active,
      },
    });
    return stylistJson(updated);
  }

  /** Thay toàn bộ lịch làm việc theo tuần trong một transaction. */
  async setWorkingHours(id: string, dto: SetWorkingHoursDto, user: AuthUser) {
    const stylist = await this.requireStylist(id);
    assertBranchAccess(user, stylist.branchId);

    for (const item of dto.working_hours) {
      if (item.start_time >= item.end_time) {
        throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workingHour.deleteMany({ where: { stylistId: id } });
      if (dto.working_hours.length > 0) {
        await tx.workingHour.createMany({
          data: dto.working_hours.map((item) => ({
            stylistId: id,
            dayOfWeek: item.day_of_week,
            startTime: item.start_time,
            endTime: item.end_time,
            isActive: item.is_active ?? true,
          })),
        });
      }
    });

    return this.listWorkingHours(id);
  }

  async listWorkingHours(id: string) {
    await this.requireStylist(id);
    const items = await this.prisma.workingHour.findMany({
      where: { stylistId: id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    return items.map((item) => ({
      id: item.id,
      day_of_week: item.dayOfWeek,
      start_time: item.startTime,
      end_time: item.endTime,
      is_active: item.isActive,
    }));
  }

  async addTimeOff(id: string, dto: TimeOffDto, user: AuthUser) {
    const stylist = await this.requireStylist(id);
    assertBranchAccess(user, stylist.branchId);

    const start = parseInstant(dto.start_time);
    const end = parseInstant(dto.end_time);
    if (!start || !end) throw new BadRequestException('Thời gian nghỉ không hợp lệ.');
    if (end.getTime() <= start.getTime()) throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu.');

    const conflicted = await this.prisma.booking.count({
      where: {
        stylistId: id,
        status: { in: ['pending', 'confirmed'] },
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });
    if (conflicted > 0) {
      throw new BadRequestException(
        `Stylist đang có ${conflicted} lịch hẹn trong khoảng nghỉ này. Vui lòng dời hoặc hủy lịch trước.`,
      );
    }

    const timeOff = await this.prisma.timeOff.create({
      data: { stylistId: id, startTime: start, endTime: end, reason: dto.reason ?? null },
    });
    return {
      id: timeOff.id,
      stylist_id: timeOff.stylistId,
      start_time: timeOff.startTime.toISOString(),
      end_time: timeOff.endTime.toISOString(),
      reason: timeOff.reason,
    };
  }

  async listTimeOff(id: string) {
    await this.requireStylist(id);
    const items = await this.prisma.timeOff.findMany({ where: { stylistId: id }, orderBy: { startTime: 'asc' } });
    return items.map((item) => ({
      id: item.id,
      start_time: item.startTime.toISOString(),
      end_time: item.endTime.toISOString(),
      reason: item.reason,
    }));
  }

  async removeTimeOff(id: string, timeOffId: string, user: AuthUser) {
    const stylist = await this.requireStylist(id);
    assertBranchAccess(user, stylist.branchId);
    const existing = await this.prisma.timeOff.findFirst({ where: { id: timeOffId, stylistId: id } });
    if (!existing) throw new NotFoundException('Không tìm thấy khoảng nghỉ.');
    await this.prisma.timeOff.delete({ where: { id: timeOffId } });
    return { success: true };
  }

  /** Trang stylist (DOCUMENT.md §2.7): hồ sơ + lịch cá nhân. */
  async me(user: AuthUser) {
    if (!user.stylistId) throw new NotFoundException('Tài khoản này chưa gắn với hồ sơ stylist.');
    const stylist = await this.getById(user.stylistId);
    return { ...stylist, full_name: user.fullName };
  }

  async myBookings(user: AuthUser, from?: string, to?: string) {
    if (!user.stylistId) throw new NotFoundException('Tài khoản này chưa gắn với hồ sơ stylist.');
    const today = vnDateKey(new Date());
    const start = from ? (parseInstant(from) ?? vnDayRangeUtc(today).start) : vnDayRangeUtc(today).start;
    const end = to
      ? (parseInstant(to) ?? vnDayRangeUtc(today).end)
      : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

    const bookings = await this.prisma.booking.findMany({
      where: { stylistId: user.stylistId, startTime: { gte: start, lt: end } },
      include: { service: true, customer: true, branch: true, stylist: true },
      orderBy: { startTime: 'asc' },
    });
    return bookings.map(bookingJson);
  }

  private async requireStylist(id: string): Promise<Stylist> {
    const stylist = await this.prisma.stylist.findUnique({ where: { id } });
    if (!stylist) throw new NotFoundException('Không tìm thấy stylist.');
    return stylist;
  }
}
