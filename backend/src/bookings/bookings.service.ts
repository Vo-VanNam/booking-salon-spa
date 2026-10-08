import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Booking, BookingStatus, Branch, Service, Stylist } from '@prisma/client';
import type { AuthUser } from '../auth/auth.decorators';
import { depositPercent, loyaltyConfig } from '../common/config';
import { AppLogger } from '../common/logger';
import { bookingJson, branchJson, BookingWithRelations } from '../common/serializers';
import { addMinutes, formatVnDate, formatVnDateTime, hmToMinutes, parseInstant, toVnIso, vnDateKey, vnDayRangeUtc, vnParts, vnTimeKey } from '../common/time';
import { isValidEmail, isValidVnPhone, normalizeEmail, normalizePhone, roundVnd, sanitizeText } from '../common/validators';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.module';
import { RemindersService } from '../queue/queue.module';
import { SlotsService } from '../slots/slots.service';
import { lockCustomer, lockOverlappingBookings, lockStylist } from './booking-lock';

const CANCEL_CHANGE_WINDOW_HOURS = 24;

/** Lỗi nội bộ để bắt trùng lịch trong transaction và bổ sung gợi ý ở ngoài. */
class SlotConflictError extends Error {}

export interface CreateBookingInput {
  branchId: string;
  serviceId: string;
  stylistId: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  note?: string | null;
  source?: string;
}

export interface BookingActorContext {
  /** ai | web | admin | system — dùng cho audit loyalty */
  actor: string;
}

@Injectable()
export class BookingsService {
  private readonly logger = new AppLogger('bookings');

  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotsService,
    private readonly loyalty: LoyaltyService,
    private readonly reminders: RemindersService,
  ) {}

  // ─────────────────────────────── Đọc ───────────────────────────────

  async getById(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { branch: true, service: true, stylist: true, customer: true },
    });
    if (!booking) throw new NotFoundException('Không tìm thấy lịch hẹn.');
    return bookingJson(booking);
  }

  async getByRef(ref: string): Promise<Booking | null> {
    const booking = await this.prisma.booking.findUnique({ where: { id: ref } });
    if (booking) return booking;
    const payment = await this.prisma.paymentTransaction.findFirst({
      where: { txnRef: ref },
      include: { booking: true },
    });
    return payment?.booking ?? null;
  }

  async listByPhone(phone: string) {
    const normalized = normalizePhone(phone ?? '');
    if (!isValidVnPhone(normalized)) {
      throw new BadRequestException('Số điện thoại không hợp lệ. Vui lòng nhập số di động Việt Nam 10 chữ số.');
    }
    // Endpoint công khai: KHÔNG trả về PII của khách (tên/email/SĐT) — chỉ trả về lịch hẹn để
    // khách tự tra cứu. Kèm bảo vệ: dữ liệu khách hàng khác không thể bị liệt kê từ đây.
    const bookings = await this.prisma.booking.findMany({
      where: { customer: { phone: normalized } },
      include: { branch: true, service: true, stylist: true },
      orderBy: { startTime: 'desc' },
      take: 50,
    });
    return bookings.map((booking) => ({
      id: booking.id,
      status: booking.status,
      start_time: toVnIso(booking.startTime),
      end_time: toVnIso(booking.endTime),
      deposit_status: booking.depositStatus,
      deposit_amount: booking.depositAmount,
      discount_amount: booking.discountAmount,
      price: booking.price,
      branch_id: booking.branchId,
      service_id: booking.serviceId,
      stylist_id: booking.stylistId,
      created_at: toVnIso(booking.createdAt),
      branch: booking.branch ? branchJson(booking.branch) : undefined,
      service: booking.service
        ? {
            id: booking.service.id,
            name: booking.service.name,
            price: booking.service.price,
            duration_minutes: booking.service.durationMinutes,
          }
        : undefined,
      stylist: booking.stylist ? { id: booking.stylist.id, name: booking.stylist.name } : undefined,
    }));
  }

  async listForAdmin(params: { branchId: string | null; from?: string; to?: string; status?: string }) {
    const today = vnDateKey(new Date());
    const start = params.from ? (parseInstant(params.from) ?? vnDayRangeUtc(today).start) : vnDayRangeUtc(today).start;
    const end = params.to
      ? (parseInstant(params.to) ?? vnDayRangeUtc(today).end)
      : new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const statuses = params.status
      ? (params.status.split(',').map((value) => value.trim()).filter(Boolean) as BookingStatus[])
      : undefined;

    const bookings = await this.prisma.booking.findMany({
      where: {
        ...(params.branchId ? { branchId: params.branchId } : {}),
        startTime: { gte: start, lt: end },
        ...(statuses && statuses.length > 0 ? { status: { in: statuses } } : {}),
      },
      include: { branch: true, service: true, stylist: true, customer: true },
      orderBy: { startTime: 'asc' },
      take: 500,
    });
    return bookings.map(bookingJson);
  }

  // ───────────────────────────── Tạo mới ─────────────────────────────

  async create(input: CreateBookingInput, context: BookingActorContext = { actor: 'web' }) {
    const { branch, service, stylist, start, end, phone, email, name } = await this.validateRequest(input);

    let bookingId: string;
    let discountAmount = 0;
    try {
      bookingId = await this.prisma.$transaction(
        async (tx) => {
          // Khoá theo stylist rồi mới kiểm tra trùng: hai request đồng thời không thể cùng thấy "trống".
          await lockStylist(tx, stylist.id);
          // Khoá thêm theo khách hàng: trạng thái loyalty là của khách, không của stylist.
          await lockCustomer(tx, phone);
          const conflicts = await lockOverlappingBookings(tx, stylist.id, start, end);
          if (conflicts.length > 0) throw new SlotConflictError();

          const customer = await this.upsertCustomer(tx, { phone, name, email });

          discountAmount = this.loyalty.computeDiscount(customer, service.price);
          if (discountAmount > 0) {
            // Chỉ đánh dấu khi ưu đãi của chu kỳ này chưa bị dùng ở nơi khác (chống cấp trùng).
            const used = await tx.customer.updateMany({
              where: {
                id: customer.id,
                OR: [{ loyaltyDiscountUsedAt: null }, { loyaltyDiscountUsedAt: { not: customer.completedBookings } }],
              },
              data: { loyaltyDiscountUsedAt: customer.completedBookings },
            });
            if (used.count === 0) discountAmount = 0;
          }
          const payload = service.price - discountAmount;
          const depositAmount = this.computeDeposit(payload);

          const booking = await tx.booking.create({
            data: {
              branchId: branch.id,
              serviceId: service.id,
              stylistId: stylist.id,
              customerId: customer.id,
              startTime: start,
              endTime: end,
              status: 'confirmed',
              price: service.price,
              discountAmount,
              depositAmount,
              depositStatus: 'unpaid',
              note: input.note ? sanitizeText(input.note, 500) : null,
              source: input.source ? sanitizeText(input.source, 20) : 'web',
            },
          });

          if (discountAmount > 0) {
            await this.loyalty.recordRedeem(tx, {
              customerId: customer.id,
              bookingId: booking.id,
              discountAmount,
              actor: context.actor,
            });
            this.logger.log('Áp dụng giảm giá loyalty', {
              booking_id: booking.id,
              customer_id: customer.id,
              discount: discountAmount,
              completed: customer.completedBookings,
            });
          }
          return booking.id;
        },
        { timeout: 15_000, maxWait: 10_000 },
      );
    } catch (error) {
      if (error instanceof SlotConflictError) {
        throw await this.conflictError(branch, stylist, service, start);
      }
      throw error;
    }

    await this.slots.invalidateForInstant(branch.id, stylist.id, start);
    const booking = await this.fetchFull(bookingId);
    await this.reminders.scheduleForBooking({
      id: booking.id,
      startTime: booking.startTime,
      branchId: booking.branchId,
      status: booking.status,
    });
    this.logger.log('Đã tạo lịch hẹn', {
      booking_id: booking.id,
      branch_id: branch.id,
      stylist_id: stylist.id,
      start: formatVnDateTime(start),
      discount: discountAmount,
      source: booking.source,
    });
    return bookingJson(booking);
  }

  // ──────────────────────── Hủy / đổi / hoàn tất ────────────────────

  async cancel(id: string, reason?: string, user?: AuthUser) {
    const booking = await this.requireBooking(id);
    // Khi được gọi từ dashboard (có user), branch_admin chỉ được thao tác trong chi nhánh mình.
    if (user && user.role === 'branch_admin' && user.branchId !== booking.branchId) {
      throw new ForbiddenException('Bạn chỉ có quyền với chi nhánh mình phụ trách.');
    }
    if (booking.status === 'cancelled') return bookingJson(await this.fetchFull(id));
    if (booking.status === 'completed' || booking.status === 'no_show') {
      throw new ConflictException('Không thể hủy lịch hẹn đã hoàn thành hoặc đã đánh dấu không đến.');
    }

    const hoursUntilStart = (booking.startTime.getTime() - Date.now()) / (60 * 60 * 1000);
    if (hoursUntilStart < CANCEL_CHANGE_WINDOW_HOURS) {
      throw new ConflictException(
        'Chỉ có thể hủy lịch trước giờ hẹn ít nhất 24 giờ. Vui lòng liên hệ trực tiếp chi nhánh để được hỗ trợ.',
      );
    }

    await this.prisma.booking.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        ...(reason ? { note: sanitizeText(reason, 250) } : {}),
      },
    });
    await this.slots.invalidateForInstant(booking.branchId, booking.stylistId, booking.startTime);
    await this.reminders.cancelForBooking(id);
    this.logger.log('Đã hủy lịch hẹn', { booking_id: id });
    return bookingJson(await this.fetchFull(id));
  }

  async reschedule(id: string, dto: { startTime: string; stylistId?: string }, context: BookingActorContext = { actor: 'web' }) {
    const booking = await this.requireBooking(id);
    if (booking.status !== 'pending' && booking.status !== 'confirmed') {
      throw new ConflictException('Chỉ có thể đổi lịch hẹn đang chờ hoặc đã xác nhận.');
    }

    const hoursUntilStart = (booking.startTime.getTime() - Date.now()) / (60 * 60 * 1000);
    if (hoursUntilStart < CANCEL_CHANGE_WINDOW_HOURS) {
      throw new ConflictException(
        'Chỉ có thể đổi lịch trước giờ hẹn ít nhất 24 giờ. Vui lòng liên hệ trực tiếp chi nhánh để được hỗ trợ.',
      );
    }

    const service = await this.prisma.service.findUnique({ where: { id: booking.serviceId } });
    if (!service) throw new BadRequestException('Dịch vụ của lịch hẹn không còn tồn tại.');

    const targetStylistId = dto.stylistId ?? booking.stylistId;
    const { branch, stylist, start, end } = await this.validateRequest(
      {
        branchId: booking.branchId,
        serviceId: booking.serviceId,
        stylistId: targetStylistId,
        startTime: dto.startTime,
        customerName: '',
        customerPhone: '',
      },
      { skipCustomer: true },
    );

    try {
      await this.prisma.$transaction(
        async (tx) => {
          await lockStylist(tx, stylist.id);
          const conflicts = await lockOverlappingBookings(tx, stylist.id, start, end, booking.id);
          if (conflicts.length > 0) throw new SlotConflictError();
          await tx.booking.update({
            where: { id: booking.id },
            data: { startTime: start, endTime: end, stylistId: stylist.id },
          });
        },
        { timeout: 15_000, maxWait: 10_000 },
      );
    } catch (error) {
      if (error instanceof SlotConflictError) throw await this.conflictError(branch, stylist, service, start);
      throw error;
    }

    await this.slots.invalidateForInstant(booking.branchId, booking.stylistId, booking.startTime);
    await this.slots.invalidateForInstant(branch.id, stylist.id, start);
    const updated = await this.fetchFull(booking.id);
    await this.reminders.rescheduleForBooking({
      id: updated.id,
      startTime: updated.startTime,
      branchId: updated.branchId,
      status: updated.status,
    });
    this.logger.log('Đã đổi lịch hẹn', {
      booking_id: booking.id,
      from: formatVnDateTime(booking.startTime),
      to: formatVnDateTime(start),
      actor: context.actor,
    });
    return bookingJson(updated);
  }

  /** Hoàn tất lịch hẹn: không ràng buộc thời gian, chỉ cần không phải lịch đã hủy (hợp đồng harness). */
  async complete(id: string, user?: AuthUser) {
    const booking = await this.requireBooking(id);
    if (booking.status === 'cancelled') {
      throw new ConflictException('Không thể hoàn tất lịch hẹn đã hủy.');
    }
    if (user && user.role === 'branch_admin' && user.branchId !== booking.branchId) {
      throw new ForbiddenException('Bạn chỉ có quyền với chi nhánh mình phụ trách.');
    }

    const updated = await this.prisma.booking.updateMany({
      where: { id, status: { not: 'completed' } },
      data: { status: 'completed', completedAt: new Date() },
    });

    if (updated.count > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.customer.update({
          where: { id: booking.customerId },
          data: { completedBookings: { increment: 1 } },
        });
        await this.loyalty.recordEarn(tx, {
          customerId: booking.customerId,
          bookingId: booking.id,
          actor: user?.id ?? 'system',
        });
      });
      const customer = await this.prisma.customer.findUnique({ where: { id: booking.customerId } });
      const { threshold } = loyaltyConfig();
      if (customer && customer.completedBookings > 0 && customer.completedBookings % threshold === 0) {
        this.logger.log('Khách đạt mốc loyalty — lần đặt kế tiếp được giảm giá', {
          customer_id: customer.id,
          completed: customer.completedBookings,
        });
      }
    }

    return bookingJson(await this.fetchFull(id));
  }

  async markNoShow(id: string, user: AuthUser) {
    const booking = await this.requireBooking(id);
    if (user.role === 'branch_admin' && user.branchId !== booking.branchId) {
      throw new ForbiddenException('Bạn chỉ có quyền với chi nhánh mình phụ trách.');
    }
    if (booking.status === 'cancelled' || booking.status === 'completed') {
      throw new ConflictException('Chỉ có thể đánh dấu không đến với lịch hẹn đang chờ hoặc đã xác nhận.');
    }
    await this.prisma.booking.update({ where: { id }, data: { status: 'no_show' } });
    await this.slots.invalidateForInstant(booking.branchId, booking.stylistId, booking.startTime);
    await this.reminders.cancelForBooking(id);
    return bookingJson(await this.fetchFull(id));
  }

  // ─────────────────────────── Nội bộ ───────────────────────────

  private computeDeposit(payable: number): number {
    if (payable <= 0) return 0;
    const deposit = roundVnd((payable * depositPercent()) / 100);
    return Math.min(deposit, payable);
  }

  /**
   * Tìm hoặc tạo khách theo SĐT. Hai lịch đầu tiên của cùng một khách ở hai stylist khác nhau có thể
   * chạy song song: một bên tạo khách, bên kia gặp P2002 → đọc lại bản ghi đã có thay vì trả lỗi 409.
   */
  private async upsertCustomer(
    tx: Prisma.TransactionClient,
    data: { phone: string; name: string; email: string | null },
  ) {
    const update = { name: data.name, ...(data.email ? { email: data.email } : {}) };
    try {
      return await tx.customer.upsert({
        where: { phone: data.phone },
        update,
        create: { name: data.name, phone: data.phone, email: data.email ?? undefined },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await tx.customer.findUnique({ where: { phone: data.phone } });
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async validateRequest(
    input: {
      branchId: string;
      serviceId: string;
      stylistId: string;
      startTime: string;
      customerName: string;
      customerPhone: string;
      customerEmail?: string | null;
    },
    options: { skipCustomer?: boolean } = {},
  ) {
    const [branch, service, stylist] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: input.branchId } }),
      this.prisma.service.findUnique({ where: { id: input.serviceId } }),
      this.prisma.stylist.findUnique({ where: { id: input.stylistId } }),
    ]);
    if (!branch) throw new BadRequestException('Chi nhánh không tồn tại.');
    if (!service) throw new BadRequestException('Dịch vụ không tồn tại.');
    if (!stylist) throw new BadRequestException('Stylist không tồn tại.');
    if (!branch.isActive) throw new BadRequestException('Chi nhánh hiện không hoạt động.');
    if (!service.isActive) throw new BadRequestException('Dịch vụ hiện không khả dụng.');
    if (!stylist.isActive) throw new BadRequestException('Stylist hiện không làm việc.');
    if (service.branchId !== branch.id) throw new BadRequestException('Dịch vụ không thuộc chi nhánh đã chọn.');
    if (stylist.branchId !== branch.id) throw new BadRequestException('Stylist không thuộc chi nhánh đã chọn.');

    const start = parseInstant(input.startTime ?? '');
    if (!start) {
      throw new BadRequestException('Thời gian bắt đầu không hợp lệ. Vui lòng dùng định dạng ISO 8601 (ví dụ 2026-10-08T09:00:00+07:00).');
    }
    if (start.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Thời gian bắt đầu phải ở tương lai.');
    }

    const end = addMinutes(start, service.durationMinutes);
    await this.assertWithinBranchHours(branch, start, end);
    await this.slots.assertWithinWorkingHours(stylist.id, start, end);
    await this.assertNotOnTimeOff(stylist.id, start, end);

    let phone = '';
    let email: string | null = null;
    let name = '';
    if (!options.skipCustomer) {
      phone = normalizePhone(input.customerPhone ?? '');
      if (!isValidVnPhone(phone)) {
        throw new BadRequestException(
          'Số điện thoại không hợp lệ. Vui lòng nhập số di động Việt Nam gồm 10 chữ số (bắt đầu bằng 03, 05, 07, 08 hoặc 09).',
        );
      }
      const rawEmail = (input.customerEmail ?? '').trim();
      if (rawEmail) {
        if (!isValidEmail(rawEmail)) throw new BadRequestException('Email không hợp lệ.');
        email = normalizeEmail(rawEmail);
      }
      name = sanitizeText(input.customerName ?? '', 150);
      if (!name) throw new BadRequestException('Vui lòng nhập tên khách hàng.');
    }

    return { branch, service, stylist, start, end, phone, email, name };
  }

  private async assertWithinBranchHours(branch: Branch, start: Date, end: Date): Promise<void> {
    const openMin = hmToMinutes(branch.openTime);
    const closeMin = hmToMinutes(branch.closeTime);
    if (openMin === null || closeMin === null) return;
    const startParts = vnParts(start);
    const endParts = vnParts(end);
    const startMin = startParts.hour * 60 + startParts.minute;
    const endMin = endParts.hour * 60 + endParts.minute;
    if (startParts.dateKey !== endParts.dateKey || startMin < openMin || endMin > closeMin) {
      throw new BadRequestException(
        `Khung giờ này ngoài giờ mở cửa của chi nhánh (${branch.openTime}–${branch.closeTime}). Vui lòng chọn khung giờ khác.`,
      );
    }
  }

  private async assertNotOnTimeOff(stylistId: string, start: Date, end: Date): Promise<void> {
    const timeOff = await this.prisma.timeOff.findFirst({
      where: { stylistId, startTime: { lt: end }, endTime: { gt: start } },
    });
    if (timeOff) {
      throw new BadRequestException(
        `Stylist đang nghỉ trong khung giờ này${timeOff.reason ? ` (${timeOff.reason})` : ''}. Vui lòng chọn khung giờ khác.`,
      );
    }
  }

  private async conflictError(branch: Branch, stylist: Stylist, service: Service, start: Date) {
    const suggestions = await this.slots.suggestAlternatives({
      branchId: branch.id,
      stylistId: stylist.id,
      serviceId: service.id,
      from: start,
      limit: 3,
    });
    const suggestionText = suggestions.length
      ? ` Gần nhất còn trống: ${suggestions
          .map((item) => formatVnDateTime(new Date(item.start_time)))
          .join(', ')}.`
      : ' Vui lòng chọn khung giờ hoặc stylist khác.';
    return new ConflictException({
      statusCode: 409,
      message: `Khung giờ ${vnTimeKey(start)} ngày ${formatVnDate(start)} đã được đặt.${suggestionText}`,
      code: 'SLOT_CONFLICT',
      suggestions: suggestions.map((item) => item.start_time),
    });
  }

  private async requireBooking(id: string): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Không tìm thấy lịch hẹn.');
    return booking;
  }

  private async fetchFull(id: string): Promise<BookingWithRelations> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { branch: true, service: true, stylist: true, customer: true },
    });
    if (!booking) throw new NotFoundException('Không tìm thấy lịch hẹn.');
    return booking;
  }
}
