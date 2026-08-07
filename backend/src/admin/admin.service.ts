import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import { isValidVnPhone } from '../common/validators/vn-phone';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService } from '../time/time.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { assertCanAccessBranch, resolveBranchId } from './branch-scope';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { CreateStylistDto } from './dto/create-stylist.dto';
import { UpdateStylistDto } from './dto/update-stylist.dto';
import { WorkingHoursDto } from './dto/working-hours.dto';
import { CreateTimeOffDto } from './dto/time-off.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { AdminRevenueService } from './admin-revenue.service';

const PHONE_INVALID_MESSAGE =
  'Số điện thoại không hợp lệ (yêu cầu 10 số, đầu 03/05/07/08/09)';
const EMAIL_INVALID_MESSAGE = 'Email không hợp lệ';
const PASSWORD_TOO_SHORT_MESSAGE = 'Mật khẩu tối thiểu 8 ký tự';
const PHONE_EXISTS_MESSAGE = 'Số điện thoại đã được đăng ký';
const EMAIL_EXISTS_MESSAGE = 'Email đã được đăng ký';

export type AdminUserResult = Omit<User, 'passwordHash' | 'refreshTokenHash'>;

type ScopeUser = { role: string; branchId?: string | null };

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
    private readonly revenue: AdminRevenueService,
  ) {}

  async createStaffUser(dto: CreateAdminUserDto): Promise<AdminUserResult> {
    if (!isValidVnPhone(dto.phone)) {
      throw new BadRequestException(PHONE_INVALID_MESSAGE);
    }
    if (dto.password.length < 8) {
      throw new BadRequestException(PASSWORD_TOO_SHORT_MESSAGE);
    }
    if (dto.email !== undefined && !this.isEmail(dto.email)) {
      throw new BadRequestException(EMAIL_INVALID_MESSAGE);
    }
    if (dto.role === UserRole.stylist && !dto.stylistId) {
      throw new BadRequestException('Thiếu stylist');
    }
    if (dto.role === UserRole.branch_admin && !dto.branchId) {
      throw new BadRequestException('Thiếu chi nhánh');
    }

    const [existingUser, existingCustomer] = await Promise.all([
      this.prisma.user.findUnique({ where: { phone: dto.phone } }),
      this.prisma.customer.findUnique({ where: { phone: dto.phone } }),
    ]);
    if (existingUser || existingCustomer) {
      throw new ConflictException(PHONE_EXISTS_MESSAGE);
    }
    if (dto.email !== undefined) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException(EMAIL_EXISTS_MESSAGE);
      }
    }

    const data: {
      phone: string;
      email?: string;
      passwordHash: string;
      role: UserRole;
      stylistId?: string;
      branchId?: string;
    } = {
      phone: dto.phone,
      email: dto.email,
      passwordHash: await argon2.hash(dto.password),
      role: dto.role,
    };

    if (dto.role === UserRole.stylist) {
      const stylist = await this.prisma.stylist.findUnique({
        where: { id: dto.stylistId },
        include: { user: { select: { id: true } } },
      });
      if (!stylist) {
        throw new NotFoundException('Stylist không tồn tại');
      }
      if (stylist.user) {
        throw new ConflictException('Stylist này đã có tài khoản');
      }
      data.stylistId = dto.stylistId;
    }

    if (dto.role === UserRole.branch_admin) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: dto.branchId },
      });
      if (!branch) {
        throw new NotFoundException('Chi nhánh không tồn tại');
      }
      data.branchId = dto.branchId;
    }

    const user = await this.prisma.user.create({ data });
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      active: user.active,
      customerId: user.customerId,
      stylistId: user.stylistId,
      branchId: user.branchId,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  listBranches() {
    return this.prisma.branch.findMany({
      include: {
        _count: { select: { services: true, stylists: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  createBranch(dto: CreateBranchDto) {
    if (dto.openTime >= dto.closeTime) {
      throw new BadRequestException('Giờ mở cửa phải trước giờ đóng cửa');
    }
    return this.prisma.branch.create({ data: { ...dto, active: true } });
  }

  async updateBranch(id: string, dto: UpdateBranchDto) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException('Không tìm thấy chi nhánh');
    }
    const openTime = dto.openTime ?? branch.openTime;
    const closeTime = dto.closeTime ?? branch.closeTime;
    if (openTime >= closeTime) {
      throw new BadRequestException('Giờ mở cửa phải trước giờ đóng cửa');
    }
    return this.prisma.branch.update({
      where: { id },
      data: { ...dto, openTime, closeTime },
    });
  }

  async deactivateBranch(id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException('Không tìm thấy chi nhánh');
    }
    if (!branch.active) {
      throw new ConflictException('Chi nhánh đã bị vô hiệu hóa');
    }
    const count = await this.prisma.booking.count({
      where: {
        branchId: id,
        status: { in: ['pending', 'confirmed'] },
        startTime: { gte: new Date() },
      },
    });
    if (count > 0) {
      throw new ConflictException(
        'Không thể vô hiệu hóa chi nhánh khi còn lịch hẹn chưa hoàn thành',
      );
    }
    return this.prisma.branch.update({
      where: { id },
      data: { active: false },
    });
  }

  listServices(user: ScopeUser, branchIdParam?: string) {
    const branchId = resolveBranchId(user, branchIdParam);
    assertCanAccessBranch(user, branchId);
    return this.prisma.service.findMany({
      where: { branchId },
      orderBy: { price: 'asc' },
    });
  }

  async createService(user: ScopeUser, dto: CreateServiceDto) {
    assertCanAccessBranch(user, dto.branchId);
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });
    if (!branch) {
      throw new NotFoundException('Không tìm thấy chi nhánh');
    }
    return this.prisma.service.create({ data: dto });
  }

  async updateService(user: ScopeUser, id: string, dto: UpdateServiceDto) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) {
      throw new NotFoundException('Không tìm thấy dịch vụ');
    }
    assertCanAccessBranch(user, service.branchId);
    if (dto.branchId && dto.branchId !== service.branchId) {
      throw new BadRequestException(
        'Không thể chuyển dịch vụ sang chi nhánh khác',
      );
    }
    const data = { ...dto };
    delete data.branchId;
    return this.prisma.service.update({ where: { id }, data });
  }

  async deactivateService(user: ScopeUser, id: string) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) {
      throw new NotFoundException('Không tìm thấy dịch vụ');
    }
    assertCanAccessBranch(user, service.branchId);
    if (!service.active) {
      throw new ConflictException('Dịch vụ đã bị vô hiệu hóa');
    }
    const count = await this.prisma.booking.count({
      where: {
        serviceId: id,
        status: { in: ['pending', 'confirmed'] },
        startTime: { gte: new Date() },
      },
    });
    if (count > 0) {
      throw new ConflictException(
        'Không thể vô hiệu hóa dịch vụ khi còn lịch hẹn chưa hoàn thành',
      );
    }
    return this.prisma.service.update({
      where: { id },
      data: { active: false },
    });
  }

  listStylists(user: ScopeUser, branchIdParam?: string) {
    const branchId = resolveBranchId(user, branchIdParam);
    assertCanAccessBranch(user, branchId);
    return this.prisma.stylist.findMany({
      where: { branchId },
      include: {
        workingHours: { orderBy: { dayOfWeek: 'asc' } },
        timeOffs: {
          where: { startTime: { gte: new Date() } },
          orderBy: { startTime: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createStylist(user: ScopeUser, dto: CreateStylistDto) {
    assertCanAccessBranch(user, dto.branchId);
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });
    if (!branch) {
      throw new NotFoundException('Không tìm thấy chi nhánh');
    }
    return this.prisma.stylist.create({ data: dto });
  }

  async updateStylist(user: ScopeUser, id: string, dto: UpdateStylistDto) {
    const stylist = await this.prisma.stylist.findUnique({ where: { id } });
    if (!stylist) {
      throw new NotFoundException('Không tìm thấy stylist');
    }
    assertCanAccessBranch(user, stylist.branchId);
    if (dto.active === false) {
      const count = await this.prisma.booking.count({
        where: {
          stylistId: id,
          status: { in: ['pending', 'confirmed'] },
          startTime: { gte: new Date() },
        },
      });
      if (count > 0) {
        throw new ConflictException(
          'Không thể vô hiệu hóa stylist khi còn lịch hẹn chưa hoàn thành',
        );
      }
    }
    return this.prisma.stylist.update({ where: { id }, data: dto });
  }

  async replaceWorkingHours(user: ScopeUser, id: string, dto: WorkingHoursDto) {
    const stylist = await this.prisma.stylist.findUnique({ where: { id } });
    if (!stylist) {
      throw new NotFoundException('Không tìm thấy stylist');
    }
    assertCanAccessBranch(user, stylist.branchId);
    const seenDays = new Set<number>();
    for (const item of dto.workingHours) {
      if (item.startTime >= item.endTime) {
        throw new BadRequestException('Giờ bắt đầu phải trước giờ kết thúc');
      }
      if (seenDays.has(item.dayOfWeek)) {
        throw new BadRequestException('Trùng ngày trong tuần');
      }
      seenDays.add(item.dayOfWeek);
    }
    // Không kiểm tra booking — admin chịu trách nhiệm khi đổi lịch làm việc
    await this.prisma.$transaction([
      this.prisma.workingHour.deleteMany({ where: { stylistId: id } }),
      this.prisma.workingHour.createMany({
        data: dto.workingHours.map((item) => ({
          stylistId: id,
          dayOfWeek: item.dayOfWeek,
          startTime: item.startTime,
          endTime: item.endTime,
        })),
      }),
    ]);
    return { count: dto.workingHours.length };
  }

  async createTimeOff(user: ScopeUser, id: string, dto: CreateTimeOffDto) {
    const stylist = await this.prisma.stylist.findUnique({ where: { id } });
    if (!stylist) {
      throw new NotFoundException('Không tìm thấy stylist');
    }
    assertCanAccessBranch(user, stylist.branchId);
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (start <= new Date()) {
      throw new BadRequestException(
        'Thời gian nghỉ phải bắt đầu trong tương lai',
      );
    }
    if (end <= start) {
      throw new BadRequestException('Thời gian nghỉ không hợp lệ');
    }
    const bookings = await this.prisma.booking.findMany({
      where: {
        stylistId: id,
        status: { in: ['pending', 'confirmed'] },
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });
    const affected = bookings.filter((b) =>
      this.time.overlaps(b.startTime, b.endTime, start, end),
    );
    if (affected.length > 0) {
      throw new ConflictException({
        message: 'Thời gian nghỉ trùng với lịch hẹn hiện có',
        affectedBookings: affected.map((b) => ({
          id: b.id,
          startTime: b.startTime,
        })),
      });
    }
    return this.prisma.timeOff.create({ data: { ...dto, stylistId: id } });
  }

  async deleteTimeOff(user: ScopeUser, stylistId: string, timeOffId: string) {
    const stylist = await this.prisma.stylist.findUnique({
      where: { id: stylistId },
    });
    if (!stylist) {
      throw new NotFoundException('Không tìm thấy stylist');
    }
    assertCanAccessBranch(user, stylist.branchId);
    const timeOff = await this.prisma.timeOff.findFirst({
      where: { id: timeOffId, stylistId },
    });
    if (!timeOff) {
      throw new NotFoundException('Không tìm thấy thời gian nghỉ');
    }
    await this.prisma.timeOff.deleteMany({
      where: { id: timeOffId, stylistId },
    });
    return { id: timeOffId };
  }

  // Lịch hẹn trong [from 00:00 VN, to 23:59:59 VN] — không lọc status vì calendar
  // cần hiển thị cả booking cancelled (mờ đi).
  async getCalendar(user: ScopeUser, query: CalendarQueryDto) {
    const branchId = resolveBranchId(user, query.branchId);
    assertCanAccessBranch(user, branchId);
    const range = this.validateDateRange(query.from, query.to);
    if (query.stylistId) {
      const stylist = await this.prisma.stylist.findFirst({
        where: { id: query.stylistId, branchId },
        select: { id: true },
      });
      if (!stylist) {
        throw new BadRequestException('Stylist không thuộc chi nhánh này');
      }
    }
    const bookings = await this.prisma.booking.findMany({
      where: {
        branchId,
        stylistId: query.stylistId,
        startTime: { gte: range.startUtc, lt: range.endUtc },
      },
      include: {
        stylist: { select: { id: true, name: true } },
        service: {
          select: { id: true, name: true, durationMinutes: true, price: true },
        },
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { startTime: 'asc' },
    });
    return {
      bookings: bookings.map((b) => ({
        id: b.id,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        note: b.note,
        branchId: b.branchId,
        stylist: b.stylist,
        service: b.service,
        customer: b.customer,
        depositAmount: b.depositAmount,
        depositStatus: b.depositStatus,
        priceAtBooking: b.priceAtBooking,
        discountAmount: b.discountAmount,
      })),
    };
  }

  // Doanh thu theo ngày/tháng: query bookings trong kỳ rồi tính trong JS (đủ cho
  // 3-5 chi nhánh). Công thức chi tiết nằm trong AdminRevenueService.calculate.
  async getRevenue(user: ScopeUser, query: CalendarQueryDto) {
    const branchId = resolveBranchId(user, query.branchId);
    assertCanAccessBranch(user, branchId);
    const range = this.validateDateRange(query.from, query.to);
    const groupBy = query.groupBy ?? 'day';
    if (groupBy !== 'day' && groupBy !== 'month') {
      throw new BadRequestException('Tham số groupBy không hợp lệ');
    }
    const bookings = await this.prisma.booking.findMany({
      where: {
        branchId,
        startTime: { gte: range.startUtc, lt: range.endUtc },
      },
      select: {
        id: true,
        startTime: true,
        status: true,
        priceAtBooking: true,
        discountAmount: true,
        depositAmount: true,
        depositStatus: true,
      },
    });
    return this.revenue.calculate(bookings, groupBy);
  }

  private validateDateRange(
    from: string | undefined,
    to: string | undefined,
  ): { startUtc: Date; endUtc: Date } {
    if (
      !from ||
      !to ||
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to)
    ) {
      throw new BadRequestException('Ngày không hợp lệ');
    }
    let fromDt: ReturnType<TimeService['parseVnDate']>;
    let toDt: ReturnType<TimeService['parseVnDate']>;
    try {
      fromDt = this.time.parseVnDate(from);
      toDt = this.time.parseVnDate(to);
    } catch {
      throw new BadRequestException('Ngày không hợp lệ');
    }
    if (fromDt.toMillis() > toDt.toMillis()) {
      throw new BadRequestException(
        'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
      );
    }
    if (toDt.diff(fromDt, 'days').days > 61) {
      throw new BadRequestException('Khoảng thời gian quá dài, tối đa 62 ngày');
    }
    return {
      startUtc: fromDt.startOf('day').toUTC().toJSDate(),
      endUtc: toDt.plus({ days: 1 }).startOf('day').toUTC().toJSDate(),
    };
  }
}
