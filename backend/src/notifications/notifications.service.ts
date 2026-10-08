import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env, envInt } from '../common/config';
import { AppLogger } from '../common/logger';
import { PrismaService } from '../prisma/prisma.module';

export interface NotificationInput {
  bookingId?: string;
  channel: 'email' | 'sms';
  kind: string;
  to: string;
  subject: string;
  body: string;
  payload?: Record<string, unknown>;
}

/**
 * Gửi nhắc lịch (DOCUMENT.md §2.3) và ghi lại mọi lần gửi vào bảng notifications để audit.
 *  - Email: SMTP khi có cấu hình SMTP_*; nếu chưa cấu hình thì ghi log (không chặn luồng booking).
 *  - SMS: chưa gắn nhà cung cấp (chưa có credentials trong yêu cầu) → ghi nhận ở trạng thái "skipped"
 *    kèm lý do, để không âm thầm mất nhắc lịch.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new AppLogger('notifications');
  private transporter: Transporter | null = null;
  private smtpChecked = false;

  constructor(private readonly prisma: PrismaService) {}

  private smtp(): Transporter | null {
    if (this.smtpChecked) return this.transporter;
    this.smtpChecked = true;
    const host = env('SMTP_HOST');
    if (!host) return null;
    try {
      this.transporter = nodemailer.createTransport({
        host,
        port: envInt('SMTP_PORT', 587),
        secure: envInt('SMTP_PORT', 587) === 465,
        auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined,
      });
    } catch (error) {
      this.logger.warn('Không khởi tạo được SMTP — chỉ ghi log nhắc lịch', {
        message: error instanceof Error ? error.message : String(error),
      });
      this.transporter = null;
    }
    return this.transporter;
  }

  async send(input: NotificationInput): Promise<{ status: 'sent' | 'failed' | 'skipped'; error?: string }> {
    const record = await this.prisma.notification.create({
      data: {
        bookingId: input.bookingId ?? null,
        channel: input.channel,
        kind: input.kind,
        to: input.to,
        status: 'queued',
        payload: (input.payload ?? {}) as object,
      },
    });

    if (!input.to) {
      await this.mark(record.id, 'skipped', 'Thiếu thông tin người nhận');
      return { status: 'skipped', error: 'Thiếu thông tin người nhận' };
    }

    if (input.channel === 'sms') {
      const message = 'Chưa cấu hình nhà cung cấp SMS — nhắc lịch được ghi log để xử lý thủ công.';
      this.logger.log('Nhắc lịch SMS (chưa có provider)', { kind: input.kind, booking_id: input.bookingId });
      await this.mark(record.id, 'skipped', message);
      return { status: 'skipped', error: message };
    }

    const transporter = this.smtp();
    if (!transporter) {
      this.logger.log('Nhắc lịch email (chế độ log)', {
        kind: input.kind,
        to: input.to,
        subject: input.subject,
        booking_id: input.bookingId,
      });
      await this.mark(record.id, 'sent', 'SMTP chưa cấu hình — đã ghi log');
      return { status: 'sent' };
    }

    try {
      await transporter.sendMail({
        from: env('SMTP_FROM', 'no-reply@booking-spa.local'),
        to: input.to,
        subject: input.subject,
        text: input.body,
      });
      await this.mark(record.id, 'sent');
      return { status: 'sent' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Gửi email nhắc lịch thất bại', undefined, { message, booking_id: input.bookingId });
      await this.mark(record.id, 'failed', message);
      return { status: 'failed', error: message };
    }
  }

  private async mark(id: string, status: 'sent' | 'failed' | 'skipped', error?: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status, error: error ?? null, sentAt: status === 'sent' ? new Date() : null },
    });
  }

  async listForBooking(bookingId: string) {
    const items = await this.prisma.notification.findMany({ where: { bookingId }, orderBy: { createdAt: 'desc' } });
    return items.map((item) => ({
      id: item.id,
      channel: item.channel,
      kind: item.kind,
      to: item.to,
      status: item.status,
      sent_at: item.sentAt?.toISOString() ?? null,
      created_at: item.createdAt.toISOString(),
    }));
  }
}
