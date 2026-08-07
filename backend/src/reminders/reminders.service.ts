import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Booking } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  REMINDERS_QUEUE,
  SEND_REMINDER_JOB,
  reminderJobId,
} from './reminders.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class RemindersService {
  constructor(@InjectQueue(REMINDERS_QUEUE) private readonly queue: Queue) {}

  async scheduleForBooking(booking: Booking): Promise<void> {
    for (const [slot, leadMs] of [
      ['d1', DAY_MS],
      ['h1', HOUR_MS],
    ] as const) {
      const delay = booking.startTime.getTime() - leadMs - Date.now();
      if (delay <= 0) {
        // booking bắt đầu trong vòng cửa sổ này → không cần job nhắc, delay âm vô nghĩa
        continue;
      }
      await this.queue.add(
        SEND_REMINDER_JOB,
        { bookingId: booking.id, startTime: booking.startTime.toISOString() },
        {
          jobId: reminderJobId(booking.id, slot),
          delay,
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    }
  }

  async unscheduleForBooking(bookingId: string): Promise<void> {
    // bullmq 5.x khong con Queue.removeJobs -> dung Queue.remove theo jobId
    await this.queue.remove(reminderJobId(bookingId, 'd1'));
    await this.queue.remove(reminderJobId(bookingId, 'h1'));
  }
}
