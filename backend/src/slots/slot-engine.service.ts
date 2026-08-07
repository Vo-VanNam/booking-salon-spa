import { Injectable } from '@nestjs/common';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';
import { TimeService } from '../time/time.service';

export interface WorkingHourInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface TimeRangeInput {
  start: Date;
  end: Date;
}

export interface DayContextInput {
  dateStr: string;
  workingHours: WorkingHourInput[];
  branchOpen: string;
  branchClose: string;
  timeOffs: TimeRangeInput[];
  bookings: TimeRangeInput[];
}

export interface DayContext {
  workingStart: Date;
  workingEnd: Date;
  busy: TimeRangeInput[];
}

@Injectable()
export class SlotEngineService {
  constructor(private readonly time: TimeService) {}

  computeDayContext(input: DayContextInput): DayContext {
    const weekday = this.time.vnDayOfWeek(input.dateStr);
    const workingHour = input.workingHours.find((h) => h.dayOfWeek === weekday);
    if (!workingHour) {
      throw new BusinessRuleException('Stylist không làm việc vào ngày này');
    }

    const { startUtc: dayStart, endUtc: dayEnd } = this.time.dateToVnRange(
      input.dateStr,
    );
    const whStart = this.time.hhmmToVnDate(
      input.dateStr,
      workingHour.startTime,
    );
    const whEnd = this.time.hhmmToVnDate(input.dateStr, workingHour.endTime);
    const branchOpen = this.time.hhmmToVnDate(input.dateStr, input.branchOpen);
    const branchClose = this.time.hhmmToVnDate(
      input.dateStr,
      input.branchClose,
    );

    const workingStart = whStart > branchOpen ? whStart : branchOpen;
    const workingEnd = whEnd < branchClose ? whEnd : branchClose;
    if (workingStart >= workingEnd) {
      throw new BusinessRuleException('Ngoài giờ làm việc');
    }

    const busy: TimeRangeInput[] = [];
    for (const range of [...input.timeOffs, ...input.bookings]) {
      const start = range.start < dayStart ? dayStart : range.start;
      const end = range.end > dayEnd ? dayEnd : range.end;
      if (start < end) {
        busy.push({ start, end });
      }
    }
    busy.sort((a, b) => a.start.getTime() - b.start.getTime());

    return { workingStart, workingEnd, busy };
  }

  buildSlots(
    context: DayContext,
    durationMinutes: number,
    stepMinutes = 15,
  ): string[] {
    const slots: string[] = [];
    const durationMs = durationMinutes * 60_000;
    const stepMs = stepMinutes * 60_000;
    const workingEndMs = context.workingEnd.getTime();
    let startMs = context.workingStart.getTime();

    while (startMs + durationMs <= workingEndMs) {
      const slotStart = new Date(startMs);
      const slotEnd = new Date(startMs + durationMs);
      const blocked = context.busy.some((b) =>
        this.time.overlaps(slotStart, slotEnd, b.start, b.end),
      );
      if (!blocked) {
        slots.push(this.time.formatVnHm(slotStart));
      }
      startMs += stepMs;
    }
    return slots;
  }
}
