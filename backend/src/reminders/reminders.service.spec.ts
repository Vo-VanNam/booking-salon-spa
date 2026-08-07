import { Booking } from '@prisma/client';
import { Queue } from 'bullmq';
import { DateTime } from 'luxon';
import { RemindersService } from './reminders.service';
import { SEND_REMINDER_JOB, reminderJobId } from './reminders.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

interface AddOptions {
  jobId: string;
  delay: number;
  removeOnComplete: number;
  removeOnFail: number;
}

describe('RemindersService', () => {
  const queue = {
    add: jest.fn() as jest.Mock<
      Promise<unknown>,
      [string, unknown, AddOptions]
    >,
    remove: jest.fn(),
  };
  const service = new RemindersService(queue as unknown as Queue);

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  const bookingAt = (startTime: Date): Booking =>
    ({ id: 'bk1', startTime }) as Booking;

  const jobOptions = (slot: 'd1' | 'h1', start: Date, delay: number) => ({
    jobId: reminderJobId('bk1', slot),
    delay,
    removeOnComplete: 100,
    removeOnFail: 100,
  });

  it('booking cách 48h → thêm 2 job d1/h1 với delay dương đúng', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const start = DateTime.now().plus({ hours: 48 }).toJSDate();

    await service.scheduleForBooking(bookingAt(start));

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      SEND_REMINDER_JOB,
      { bookingId: 'bk1', startTime: start.toISOString() },
      jobOptions('d1', start, start.getTime() - DAY_MS - now),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      SEND_REMINDER_JOB,
      { bookingId: 'bk1', startTime: start.toISOString() },
      jobOptions('h1', start, start.getTime() - HOUR_MS - now),
    );
    expect(queue.add.mock.calls[0][2].delay).toBeGreaterThan(0);
    expect(queue.add.mock.calls[1][2].delay).toBeGreaterThan(0);
  });

  it('booking cách 2h → chỉ thêm job h1 (d1 delay âm → bỏ qua)', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const start = DateTime.now().plus({ hours: 2 }).toJSDate();

    await service.scheduleForBooking(bookingAt(start));

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      SEND_REMINDER_JOB,
      { bookingId: 'bk1', startTime: start.toISOString() },
      jobOptions('h1', start, start.getTime() - HOUR_MS - now),
    );
  });

  it('unscheduleForBooking → remove cả 2 job theo jobId', async () => {
    await service.unscheduleForBooking('bk1');

    expect(queue.remove).toHaveBeenCalledTimes(2);
    expect(queue.remove).toHaveBeenCalledWith(reminderJobId('bk1', 'd1'));
    expect(queue.remove).toHaveBeenCalledWith(reminderJobId('bk1', 'h1'));
  });
});
