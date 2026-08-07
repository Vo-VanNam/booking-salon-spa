import { BookingStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { DateTime } from 'luxon';
import type { PrismaService } from '../prisma/prisma.service';
import { VN_TIMEZONE } from '../time/time.service';
import type { MailService } from './mail.service';
import { RemindersProcessor } from './reminders.processor';
import { SEND_REMINDER_JOB } from './reminders.types';

interface MailParams {
  to: string;
  subject: string;
  html: string;
}

interface SmsParams {
  phone: string;
  message: string;
}

describe('RemindersProcessor', () => {
  const prisma = { booking: { findUnique: jest.fn() } };
  const mail = {
    send: jest.fn() as jest.Mock<Promise<void>, [MailParams]>,
  };
  const sms = {
    send: jest.fn() as jest.Mock<Promise<void>, [SmsParams]>,
  };
  const processor = new RemindersProcessor(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
    sms,
  );

  beforeEach(() => jest.clearAllMocks());

  // 10:00 VN ngày mai — tránh trùng giờ hiện tại khi format lại
  const startVn = DateTime.now()
    .plus({ days: 1 })
    .setZone(VN_TIMEZONE)
    .set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
  const startIso = startVn.toUTC().toJSDate().toISOString();

  const booking = (overrides: Record<string, unknown> = {}) => ({
    id: 'bk1',
    status: BookingStatus.confirmed,
    startTime: new Date(startIso),
    customer: {
      name: 'Nguyễn Văn A',
      phone: '0901234567',
      email: 'a@example.com',
    },
    service: { name: 'Cắt tóc nam' },
    branch: {
      name: 'Salon Sài Gòn',
      address: '123 Lê Lợi, Quận 1',
      phone: '0281234567',
    },
    ...overrides,
  });

  const job = (overrides: Record<string, unknown> = {}): Job =>
    ({
      name: SEND_REMINDER_JOB,
      data: { bookingId: 'bk1', startTime: startIso },
      ...overrides,
    }) as Job;

  const formatted = DateTime.fromJSDate(new Date(startIso))
    .setZone(VN_TIMEZONE)
    .toFormat('HH:mm dd/MM/yyyy');

  it('status cancelled → không gửi email/sms', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      booking({ status: BookingStatus.cancelled }),
    );

    await processor.process(job());

    expect(mail.send).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('startTime không khớp (đã đổi lịch) → không gửi', async () => {
    prisma.booking.findUnique.mockResolvedValue(booking());

    await processor.process(
      job({ data: { bookingId: 'bk1', startTime: new Date(0).toISOString() } }),
    );

    expect(mail.send).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('confirmed + đúng startTime + có email → gửi email và sms đúng template', async () => {
    prisma.booking.findUnique.mockResolvedValue(booking());

    await processor.process(job());

    const html = mail.send.mock.calls[0][0].html;
    expect(mail.send).toHaveBeenCalledWith({
      to: 'a@example.com',
      subject: 'Nhắc lịch hẹn - Salon Sài Gòn',
      html,
    });
    expect(html).toContain('Nhắc lịch:');
    expect(html).toContain('Nguyễn Văn A');
    expect(html).toContain('Cắt tóc nam');
    expect(html).toContain(formatted);
    expect(html).toContain('Salon Sài Gòn');
    expect(html).toContain('123 Lê Lợi, Quận 1');
    expect(html).toContain('0281234567');
    expect(sms.send).toHaveBeenCalledWith({
      phone: '0901234567',
      message: html,
    });
  });

  it('branch.phone null → dùng từ "salon" trong message', async () => {
    prisma.booking.findUnique.mockResolvedValue(
      booking({
        branch: { name: 'Salon Sài Gòn', address: '123 Lê Lợi', phone: null },
      }),
    );

    await processor.process(job());

    const html = mail.send.mock.calls[0][0].html;
    expect(html).toContain('Liên hệ salon nếu cần thay đổi.');
  });

  it('booking null (đã bị xóa) → không gửi', async () => {
    prisma.booking.findUnique.mockResolvedValue(null);

    await processor.process(job());

    expect(mail.send).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });
});
