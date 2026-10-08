import { Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { queueEnabled, reminderHours } from '../common/config';
import { AppLogger } from '../common/logger';
import { env } from '../common/config';
import { formatVnDate, formatVnDateTime } from '../common/time';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';

const REMINDER_QUEUE = 'booking-reminders';
const MAINTENANCE_QUEUE = 'booking-maintenance';

export interface ScheduledBooking {
  id: string;
  startTime: Date;
  branchId: string;
  status: string;
}

function redisConnectionOptions(): { host: string; port: number; password?: string; username?: string; maxRetriesPerRequest: null } {
  const url = new URL(env('REDIS_URL'));
  return {
    host: url.hostname,
    port: Number.parseInt(url.port || '6379', 10),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * Nhắc lịch trước 1 ngày và 1 giờ (DOCUMENT.md §2.3) qua BullMQ; job được dời/xoá khi booking
 * đổi giờ hoặc bị hủy. Thiếu Redis → bỏ qua (không chặn luồng đặt lịch).
 */
@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new AppLogger('reminders');
  private reminderQueue: Queue | null = null;
  private maintenanceQueue: Queue | null = null;
  private worker: Worker | null = null;
  private maintenanceWorker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly loyalty: LoyaltyService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!queueEnabled()) {
      this.logger.warn('Queue bị tắt (thiếu REDIS_URL hoặc QUEUE_ENABLED=false) — không đặt nhắc lịch');
      return;
    }
    const connection = redisConnectionOptions();
    try {
      this.reminderQueue = new Queue(REMINDER_QUEUE, { connection });
      this.maintenanceQueue = new Queue(MAINTENANCE_QUEUE, { connection });

      this.worker = new Worker(
        REMINDER_QUEUE,
        async (job) => {
          await this.processReminder(job.data as { bookingId: string; kind: string });
        },
        { connection, concurrency: 4 },
      );
      this.worker.on('failed', (job, error) => {
        this.logger.error('Job nhắc lịch lỗi', error?.stack, { job_id: job?.id, message: error?.message });
      });

      this.maintenanceWorker = new Worker(
        MAINTENANCE_QUEUE,
        async (job) => {
          if (job.name === 'loyalty-reconcile') await this.loyalty.reconcileCompletedCounts();
        },
        { connection, concurrency: 1 },
      );

      // Cron rà soát loyalty: 02:00 giờ Việt Nam mỗi ngày.
      await this.maintenanceQueue.add(
        'loyalty-reconcile',
        {},
        { repeat: { pattern: '0 2 * * *', tz: 'Asia/Ho_Chi_Minh' }, jobId: 'loyalty-reconcile', removeOnComplete: true },
      );
      this.logger.log('Hàng đợi nhắc lịch đã sẵn sàng');
    } catch (error) {
      this.logger.warn('Không khởi tạo được hàng đợi BullMQ', {
        message: error instanceof Error ? error.message : String(error),
      });
      this.reminderQueue = null;
      this.maintenanceQueue = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.worker?.close(),
      this.maintenanceWorker?.close(),
      this.reminderQueue?.close(),
      this.maintenanceQueue?.close(),
    ]);
  }

  static jobId(bookingId: string, hours: number): string {
    return `reminder:${bookingId}:${hours}h`;
  }

  async scheduleForBooking(booking: ScheduledBooking): Promise<void> {
    if (!this.reminderQueue) return;
    if (booking.status !== 'confirmed' && booking.status !== 'pending') return;

    for (const hours of reminderHours()) {
      const fireAt = booking.startTime.getTime() - hours * 60 * 60 * 1000;
      const delay = fireAt - Date.now();
      if (delay <= 0) continue;
      try {
        await this.reminderQueue.add(
          'reminder',
          { bookingId: booking.id, kind: `reminder-${hours}h`, hours },
          {
            delay,
            jobId: RemindersService.jobId(booking.id, hours),
            removeOnComplete: true,
            removeOnFail: 50,
          },
        );
      } catch (error) {
        this.logger.warn('Không đặt được job nhắc lịch', {
          booking_id: booking.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.logger.debug('Đã đặt nhắc lịch', { booking_id: booking.id, start: formatVnDateTime(booking.startTime) });
  }

  /** Hủy mọi nhắc lịch còn chờ của booking (khi hủy hoặc trước khi xếp lại lịch mới). */
  async cancelForBooking(bookingId: string): Promise<void> {
    if (!this.reminderQueue) return;
    for (const hours of reminderHours()) {
      try {
        const job = await this.reminderQueue.getJob(RemindersService.jobId(bookingId, hours));
        if (job) await job.remove();
      } catch (error) {
        this.logger.warn('Không xoá được job nhắc lịch', {
          booking_id: bookingId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.logger.debug('Đã huỷ nhắc lịch', { booking_id: bookingId });
  }

  async rescheduleForBooking(booking: ScheduledBooking): Promise<void> {
    await this.cancelForBooking(booking.id);
    await this.scheduleForBooking(booking);
  }

  private async processReminder(data: { bookingId: string; kind: string; hours?: number }): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: data.bookingId },
      include: { customer: true, branch: true, service: true, stylist: true },
    });
    if (!booking) return;
    if (booking.status !== 'confirmed' && booking.status !== 'pending') return; // đã hủy/hoàn tất → không nhắc
    if (booking.startTime.getTime() <= Date.now()) return;

    const body =
      `Xin chào ${booking.customer.name}, bạn có lịch hẹn ${booking.service.name} với ${booking.stylist?.name ?? 'stylist'} ` +
      `tại ${booking.branch.name} lúc ${formatVnDateTime(booking.startTime)} (${formatVnDate(booking.startTime)}). ` +
      'Vui lòng đến trước 5 phút. Cần đổi lịch, vui lòng liên hệ chi nhánh trước 24 giờ.';
    const subject = `Nhắc lịch hẹn ${formatVnDateTime(booking.startTime)} tại ${booking.branch.name}`;

    if (booking.customer.email) {
      await this.notifications.send({
        bookingId: booking.id,
        channel: 'email',
        kind: data.kind,
        to: booking.customer.email,
        subject,
        body,
        payload: { start_time: booking.startTime.toISOString(), kind: data.kind },
      });
    }
    await this.notifications.send({
      bookingId: booking.id,
      channel: 'sms',
      kind: data.kind,
      to: booking.customer.phone,
      subject,
      body,
      payload: { start_time: booking.startTime.toISOString(), kind: data.kind },
    });
  }
}

@Module({
  imports: [PrismaModule, LoyaltyModule],
  providers: [NotificationsService, RemindersService],
  exports: [RemindersService, NotificationsService],
})
export class QueueModule {}
