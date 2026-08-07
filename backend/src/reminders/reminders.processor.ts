import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { VN_TIMEZONE } from '../time/time.service';
import { MailService } from './mail.service';
import { SMS_PROVIDER } from './sms.provider';
import type { SmsProvider } from './sms.provider';
import {
  ReminderJobData,
  REMINDERS_QUEUE,
  SEND_REMINDER_JOB,
} from './reminders.types';

@Processor(REMINDERS_QUEUE)
export class RemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(RemindersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SEND_REMINDER_JOB) return;
    const data = job.data as ReminderJobData;

    const booking = await this.prisma.booking.findUnique({
      where: { id: data.bookingId },
      include: { customer: true, service: true, branch: true },
    });
    if (!booking) {
      // booking đã bị xóa → bỏ qua, không gửi nhắc
      return;
    }
    if (
      booking.status !== BookingStatus.confirmed &&
      booking.status !== BookingStatus.pending
    )
      return;
    // đã đổi lịch → không gửi nhắc cũ
    if (data.startTime !== new Date(booking.startTime).toISOString()) return;

    const message = `Nhắc lịch: ${booking.customer.name}, ${booking.service.name} lúc ${DateTime.fromJSDate(booking.startTime).setZone(VN_TIMEZONE).toFormat('HH:mm dd/MM/yyyy')} tại ${booking.branch.name} — ${booking.branch.address}. Liên hệ ${booking.branch.phone ?? 'salon'} nếu cần thay đổi.`;

    if (booking.customer.email) {
      try {
        await this.mail.send({
          to: booking.customer.email,
          subject: `Nhắc lịch hẹn - ${booking.branch.name}`,
          html: message,
        });
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            tag: '[MAIL]',
            bookingId: booking.id,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }

    try {
      await this.sms.send({ phone: booking.customer.phone, message });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          tag: '[SMS]',
          bookingId: booking.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
