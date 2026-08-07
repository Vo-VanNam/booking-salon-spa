import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService } from '../time/time.service';

const NO_STYLIST_MESSAGE = 'Tài khoản không liên kết với stylist';
const INVALID_DATE_MESSAGE = 'Ngày không hợp lệ';

@Injectable()
export class StylistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
  ) {}

  async getMe(userId: string) {
    const stylistId = await this.resolveStylistId(userId);
    const stylist = await this.prisma.stylist.findUnique({
      where: { id: stylistId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        avatarUrl: true,
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            openTime: true,
            closeTime: true,
          },
        },
        workingHours: {
          select: { dayOfWeek: true, startTime: true, endTime: true },
          orderBy: { dayOfWeek: 'asc' },
        },
        timeOffs: {
          where: {
            endTime: { gte: this.time.dateToVnRange(this.todayStr()).startUtc },
          },
          select: { id: true, startTime: true, endTime: true, reason: true },
          orderBy: { startTime: 'asc' },
        },
      },
    });
    if (!stylist) {
      throw new NotFoundException('Không tìm thấy stylist');
    }
    return stylist;
  }

  async getBookings(userId: string, from: string, to: string) {
    const stylistId = await this.resolveStylistId(userId);
    let startUtc: Date;
    let endUtc: Date;
    try {
      startUtc = this.time.dateToVnRange(from).startUtc;
      // [from 00:00 VN, to+1 ngày 00:00 VN) — bao trọn cả ngày `to`
      endUtc = this.time.dateToVnRange(to).endUtc;
    } catch {
      throw new BadRequestException(INVALID_DATE_MESSAGE);
    }
    return this.prisma.booking.findMany({
      where: {
        stylistId,
        startTime: { gte: startUtc, lt: endUtc },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        branchId: true,
        note: true,
        service: {
          select: { name: true, durationMinutes: true, price: true },
        },
        customer: { select: { name: true, phone: true } },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async getTodayBookings(userId: string) {
    const today = this.todayStr();
    return this.getBookings(userId, today, today);
  }

  private todayStr(): string {
    return this.time.vnNow().toFormat('yyyy-MM-dd');
  }

  private async resolveStylistId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stylistId: true },
    });
    if (!user?.stylistId) {
      throw new ForbiddenException(NO_STYLIST_MESSAGE);
    }
    return user.stylistId;
  }
}
