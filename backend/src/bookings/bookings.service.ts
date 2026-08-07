import { Injectable, Logger } from '@nestjs/common';
import {
  Booking,
  BookingStatus,
  DepositStatus,
  Prisma,
  Service,
  UserRole,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { assertCanAccessBranch } from '../admin/branch-scope';
import type { AuthUser } from '../auth/auth.types';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';
import { BookingConflictException } from '../common/exceptions/booking-conflict.exception';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { RemindersService } from '../reminders/reminders.service';
import { PrismaService } from '../prisma/prisma.service';
import { VN_TIMEZONE, TimeService } from '../time/time.service';
import { DayContext, SlotEngineService } from '../slots/slot-engine.service';
import { SlotsService } from '../slots/slots.service';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';

const BOOKING_NOT_FOUND_MESSAGE = 'Không tìm thấy lịch hẹn';
const NO_PERMISSION_MESSAGE = 'Bạn không có quyền thao tác lịch hẹn này';
const CANCEL_24H_MESSAGE =
  'Không thể hủy lịch hẹn trong vòng 24 giờ trước giờ hẹn. Vui lòng liên hệ salon để được hỗ trợ.';
const SLOT_CONFLICT_MESSAGE =
  'Khung giờ này đã có lịch hẹn khác, vui lòng chọn khung giờ khác';

interface ManageUser {
  role: UserRole;
  customerId: string | null;
  branchId: string | null;
}

interface ValidateAndLockParams {
  branchId: string;
  serviceId: string;
  stylistId: string;
  startTime: Date;
  endTime: Date;
  customerId: string;
}

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
    private readonly engine: SlotEngineService,
    private readonly slotsService: SlotsService,
    private readonly loyalty: LoyaltyService,
    private readonly reminders: RemindersService,
  ) {}

  private readonly logger = new Logger(BookingService.name);

  async create(dto: CreateBookingDto, userId: string): Promise<Booking> {
    let booking: Booking;
    try {
      booking = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user || user.role !== 'customer' || !user.customerId) {
          throw new BusinessRuleException(
            'Chỉ khách hàng mới có thể đặt lịch',
            403,
          );
        }

        const service = await tx.service.findFirst({
          where: { id: dto.serviceId, branchId: dto.branchId, active: true },
          select: { durationMinutes: true },
        });
        if (!service) {
          throw new BusinessRuleException('Dịch vụ không tồn tại', 404);
        }

        const startVn = DateTime.fromISO(dto.startTime).setZone(VN_TIMEZONE);
        if (!startVn.isValid) {
          throw new BusinessRuleException(
            'Thời gian bắt đầu không hợp lệ',
            400,
          );
        }
        const start = startVn.toUTC().toJSDate();
        const end = startVn
          .plus({ minutes: service.durationMinutes })
          .toUTC()
          .toJSDate();

        const validated = await this.validateAndLockSlot(tx, {
          branchId: dto.branchId,
          serviceId: dto.serviceId,
          stylistId: dto.stylistId,
          startTime: start,
          endTime: end,
          customerId: user.customerId,
        });

        // Loyalty: đủ 100 điểm → giảm 10% tự động cho booking kế tiếp
        const customer = await tx.customer.findUnique({
          where: { id: user.customerId },
          select: { id: true, loyaltyPoints: true },
        });
        if (!customer) {
          throw new BusinessRuleException('Khách hàng không tồn tại', 404);
        }
        const discountAmount = await this.loyalty.applyDiscountForNextBooking(
          tx,
          customer,
          validated.service.price,
        );
        const created = await tx.booking.create({
          data: {
            branchId: dto.branchId,
            serviceId: dto.serviceId,
            stylistId: dto.stylistId,
            customerId: user.customerId,
            startTime: start,
            endTime: end,
            status: BookingStatus.confirmed,
            priceAtBooking: validated.service.price,
            discountAmount,
            depositAmount: 0,
            depositStatus: DepositStatus.none,
            note: dto.note,
          },
        });
        return created;
      });
    } catch (error) {
      throw this.mapConflictError(error);
    }
    await this.scheduleRemindersSafely(booking);
    await this.slotsService.invalidateForBooking(
      booking.stylistId,
      booking.startTime,
    );
    return booking;
  }

  async cancel(
    bookingId: string,
    userId: string,
    dto: CancelBookingDto,
    opts?: { adminOverride?: boolean },
  ): Promise<Booking> {
    const adminOverride = opts?.adminOverride ?? false;
    let booking: Booking;
    try {
      booking = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { customer: true },
        });
        if (!existing) {
          throw new BusinessRuleException(BOOKING_NOT_FOUND_MESSAGE, 404);
        }
        const user = await this.assertCanManageBooking(tx, existing, userId);

        if (existing.status === BookingStatus.cancelled) {
          throw new BusinessRuleException('Lịch hẹn đã bị hủy');
        }
        if (
          existing.status === BookingStatus.completed ||
          existing.status === BookingStatus.no_show
        ) {
          throw new BusinessRuleException(
            'Lịch hẹn đã ở trạng thái không thể hủy',
          );
        }

        const now = this.time.vnNow();
        if (
          user.role === UserRole.customer &&
          !adminOverride &&
          !this.time.isAtLeast24hBefore(existing.startTime, now.toJSDate())
        ) {
          throw new BusinessRuleException(CANCEL_24H_MESSAGE);
        }

        return tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.cancelled,
            cancelledAt: now.toUTC().toJSDate(),
            cancelReason: dto.reason ?? null,
          },
        });
      });
    } catch (error) {
      throw this.mapConflictError(error);
    }
    await this.unscheduleRemindersSafely(booking.id);
    await this.slotsService.invalidateForBooking(
      booking.stylistId,
      booking.startTime,
    );
    return booking;
  }

  async reschedule(
    bookingId: string,
    userId: string,
    dto: RescheduleBookingDto,
    opts?: { adminOverride?: boolean },
  ): Promise<Booking> {
    const adminOverride = opts?.adminOverride ?? false;
    let booking: Booking;
    let oldStartTime: Date | undefined;
    try {
      booking = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { customer: true },
        });
        if (!existing) {
          throw new BusinessRuleException(BOOKING_NOT_FOUND_MESSAGE, 404);
        }
        const user = await this.assertCanManageBooking(tx, existing, userId);

        if (
          existing.status !== BookingStatus.pending &&
          existing.status !== BookingStatus.confirmed
        ) {
          throw new BusinessRuleException(
            'Không thể đổi lịch ở trạng thái này',
          );
        }

        const now = this.time.vnNow();
        if (
          user.role === UserRole.customer &&
          !adminOverride &&
          !this.time.isAtLeast24hBefore(existing.startTime, now.toJSDate())
        ) {
          throw new BusinessRuleException(CANCEL_24H_MESSAGE);
        }

        const startVn = DateTime.fromISO(dto.startTime).setZone(VN_TIMEZONE);
        if (!startVn.isValid) {
          throw new BusinessRuleException(
            'Thời gian bắt đầu không hợp lệ',
            400,
          );
        }
        const service = await tx.service.findFirst({
          where: {
            id: existing.serviceId,
            branchId: existing.branchId,
            active: true,
          },
          select: { durationMinutes: true },
        });
        if (!service) {
          throw new BusinessRuleException('Dịch vụ không tồn tại', 404);
        }

        const start = startVn.toUTC().toJSDate();
        const end = startVn
          .plus({ minutes: service.durationMinutes })
          .toUTC()
          .toJSDate();
        oldStartTime = existing.startTime;

        await this.validateAndLockSlot(tx, {
          branchId: existing.branchId,
          serviceId: existing.serviceId,
          stylistId: existing.stylistId,
          startTime: start,
          endTime: end,
          customerId: existing.customerId,
        });

        return tx.booking.update({
          where: { id: bookingId },
          data: { startTime: start, endTime: end },
        });
      });
    } catch (error) {
      throw this.mapConflictError(error);
    }
    await this.unscheduleRemindersSafely(booking.id);
    await this.scheduleRemindersSafely(booking);
    if (oldStartTime) {
      await this.slotsService.invalidateForBooking(
        booking.stylistId,
        oldStartTime,
      );
    }
    await this.slotsService.invalidateForBooking(
      booking.stylistId,
      booking.startTime,
    );
    return booking;
  }

  // Admin đổi trạng thái booking (completed/no_show/cancelled). completed chỉ
  // chuyển từ confirmed và lịch hẹn đã kết thúc; cộng điểm loyalty trong cùng
  // transaction. no_show chỉ chuyển từ confirmed (không cộng điểm). Admin
  // cancel không cần quy tắc 24h (đã có quyền).
  async changeStatus(
    bookingId: string,
    status: BookingStatus,
    user: AuthUser,
  ): Promise<Booking> {
    let booking: Booking;
    try {
      booking = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.booking.findUnique({
          where: { id: bookingId },
        });
        if (!existing) {
          throw new BusinessRuleException(BOOKING_NOT_FOUND_MESSAGE, 404);
        }
        assertCanAccessBranch(user, existing.branchId);

        if (
          status !== BookingStatus.completed &&
          status !== BookingStatus.no_show &&
          status !== BookingStatus.cancelled
        ) {
          throw new BusinessRuleException('Không thể chuyển trạng thái này');
        }
        if (status === BookingStatus.cancelled) {
          if (
            existing.status !== BookingStatus.confirmed &&
            existing.status !== BookingStatus.pending
          ) {
            throw new BusinessRuleException('Không thể chuyển trạng thái này');
          }
          return tx.booking.update({
            where: { id: bookingId },
            data: {
              status: BookingStatus.cancelled,
              cancelledAt: this.time.vnNow().toUTC().toJSDate(),
            },
          });
        }
        if (existing.status !== BookingStatus.confirmed) {
          throw new BusinessRuleException('Không thể chuyển trạng thái này');
        }
        if (status === BookingStatus.no_show) {
          return tx.booking.update({
            where: { id: bookingId },
            data: { status: BookingStatus.no_show },
          });
        }
        // completed chỉ hợp lệ khi lịch hẹn đã kết thúc
        if (existing.endTime > this.time.vnNow().toUTC().toJSDate()) {
          throw new BusinessRuleException('Không thể chuyển trạng thái này');
        }
        const updated = await tx.booking.update({
          where: { id: bookingId },
          data: { status: BookingStatus.completed },
        });
        await this.loyalty.applyCompletedReward(tx, existing);
        return updated;
      });
    } catch (error) {
      throw this.mapConflictError(error);
    }
    await this.unscheduleRemindersSafely(booking.id);
    await this.slotsService.invalidateForBooking(
      booking.stylistId,
      booking.startTime,
    );
    return booking;
  }

  // Lên lịch nhắc hẹn; lỗi chỉ log, không làm fail việc tạo/đổi lịch
  private async scheduleRemindersSafely(booking: Booking): Promise<void> {
    try {
      await this.reminders.scheduleForBooking(booking);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          tag: '[REMINDER]',
          bookingId: booking.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  // Hủy job nhắc hẹn; lỗi chỉ log, không làm fail việc hủy/đổi trạng thái
  private async unscheduleRemindersSafely(bookingId: string): Promise<void> {
    try {
      await this.reminders.unscheduleForBooking(bookingId);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          tag: '[REMINDER]',
          bookingId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  // Phân quyền chung cho cancel/reschedule: khách sở hữu booking hoặc admin
  // (branch_admin chỉ được thao tác booking thuộc branch của mình).
  private async assertCanManageBooking(
    tx: Prisma.TransactionClient,
    booking: { customerId: string; branchId: string },
    userId: string,
  ): Promise<ManageUser> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true, customerId: true, branchId: true },
    });
    if (!user) {
      throw new BusinessRuleException(NO_PERMISSION_MESSAGE, 403);
    }
    const isOwner =
      user.role === UserRole.customer && user.customerId === booking.customerId;
    const isAdmin =
      user.role === UserRole.super_admin ||
      (user.role === UserRole.branch_admin &&
        user.branchId === booking.branchId);
    if (!isOwner && !isAdmin) {
      throw new BusinessRuleException(NO_PERMISSION_MESSAGE, 403);
    }
    return user;
  }

  // Validation đầy đủ + SELECT ... FOR UPDATE chống race — dùng chung cho
  // create và reschedule (đổi lịch phải chạy lại toàn bộ check như đặt mới).
  private async validateAndLockSlot(
    tx: Prisma.TransactionClient,
    params: ValidateAndLockParams,
  ): Promise<{ service: Service }> {
    const { branchId, serviceId, stylistId, startTime, endTime } = params;

    const branch = await tx.branch.findFirst({
      where: { id: branchId, active: true },
    });
    if (!branch) {
      throw new BusinessRuleException('Chi nhánh không hoạt động', 404);
    }

    const service = await tx.service.findFirst({
      where: { id: serviceId, branchId, active: true },
    });
    if (!service) {
      throw new BusinessRuleException('Dịch vụ không tồn tại', 404);
    }

    const stylist = await tx.stylist.findFirst({
      where: { id: stylistId, branchId, active: true },
    });
    if (!stylist) {
      throw new BusinessRuleException(
        'Stylist không tồn tại hoặc không thuộc chi nhánh',
        404,
      );
    }

    const startVn = DateTime.fromJSDate(startTime).setZone(VN_TIMEZONE);
    if (startVn <= this.time.vnNow()) {
      throw new BusinessRuleException(
        'Thời gian bắt đầu phải ở tương lai',
        400,
      );
    }
    const dateStr = startVn.toFormat('yyyy-MM-dd');

    const timeOffs = await tx.timeOff.findMany({
      where: {
        stylistId: stylist.id,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (timeOffs.length > 0) {
      throw new BusinessRuleException(
        'Stylist đang nghỉ trong khoảng thời gian này',
      );
    }

    const weekday = this.time.vnDayOfWeek(dateStr);
    const workingHour = await tx.workingHour.findFirst({
      where: { stylistId: stylist.id, dayOfWeek: weekday },
    });
    if (!workingHour) {
      throw new BusinessRuleException('Ngoài giờ làm việc của stylist');
    }

    let dayCtx: DayContext;
    try {
      dayCtx = this.engine.computeDayContext({
        dateStr,
        workingHours: [workingHour],
        branchOpen: branch.openTime,
        branchClose: branch.closeTime,
        timeOffs: [],
        bookings: [],
      });
    } catch (error) {
      if (error instanceof BusinessRuleException) {
        if (error.message === 'Stylist không làm việc vào ngày này') {
          throw new BusinessRuleException('Ngoài giờ làm việc của stylist');
        }
        if (error.message === 'Ngoài giờ làm việc') {
          throw new BusinessRuleException(
            'Ngoài giờ làm việc của stylist hoặc ngoài giờ mở cửa của chi nhánh',
          );
        }
      }
      throw error;
    }

    if (startTime < dayCtx.workingStart || endTime > dayCtx.workingEnd) {
      const branchOpen = this.time.hhmmToVnDate(dateStr, branch.openTime);
      const branchClose = this.time.hhmmToVnDate(dateStr, branch.closeTime);
      if (startTime < branchOpen || endTime > branchClose) {
        throw new BusinessRuleException('Ngoài giờ mở cửa của chi nhánh');
      }
      throw new BusinessRuleException('Ngoài giờ làm việc của stylist');
    }

    const conflicts = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "Booking" WHERE "stylistId" = ${stylist.id} AND status IN ('pending','confirmed') AND "startTime" < ${endTime} AND "endTime" > ${startTime} FOR UPDATE`,
    );
    if (conflicts.length > 0) {
      throw new BookingConflictException(SLOT_CONFLICT_MESSAGE);
    }

    return { service };
  }

  private mapConflictError(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.meta as { constraint?: string } | undefined)?.constraint ===
        'booking_no_overlap'
    ) {
      return new BookingConflictException(SLOT_CONFLICT_MESSAGE);
    }
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('23P01') ||
      msg.includes('booking_no_overlap') ||
      msg.includes('conflicting key')
    ) {
      return new BookingConflictException(SLOT_CONFLICT_MESSAGE);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    ) {
      return new BookingConflictException(SLOT_CONFLICT_MESSAGE);
    }
    if (
      error instanceof Prisma.PrismaClientUnknownRequestError &&
      (msg.includes('40P01') || msg.includes('deadlock'))
    ) {
      return new BookingConflictException(SLOT_CONFLICT_MESSAGE);
    }
    return error;
  }
}
