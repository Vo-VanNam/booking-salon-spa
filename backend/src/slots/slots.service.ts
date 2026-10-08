import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { slotConfig } from '../common/config';
import { AppLogger } from '../common/logger';
import { addMinutes, hmToMinutes, minutesToHm, toVnIso, vnDateKey, vnDayRangeUtc, vnLocalToUtc, vnParts } from '../common/time';
import { PrismaService } from '../prisma/prisma.module';
import { RedisService } from '../redis/redis.service';
import { buildStarts, findOverlap, isCoveredByRanges, Interval, RangeMinutes } from '../bookings/overlap.util';
export interface SlotQuery {
  branchId: string;
  stylistId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD theo giờ Việt Nam
}

export interface Slot {
  start_time: string;
  end_time: string;
  start: Date;
  end: Date;
  branch_id: string;
  stylist_id: string;
  service_id: string;
  duration_minutes: number;
}

function cacheKey(query: SlotQuery): string {
  return `slots:${query.branchId}:${query.stylistId}:${query.date}:${query.serviceId}:${slotConfig().stepMinutes}`;
}

/**
 * Slot trống (DOCUMENT.md §4.2) = working_hours − time_off − booking hiện có,
 * cache Redis TTL ngắn, invalidate ngay khi có booking mới/hủy/dời.
 */
@Injectable()
export class SlotsService {
  private readonly logger = new AppLogger('slots');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getSlots(query: SlotQuery, options: { skipCache?: boolean } = {}): Promise<Slot[]> {
    const key = cacheKey(query);
    if (!options.skipCache) {
      const cached = await this.redis.get(key);
      if (cached) {
        try {
          return (JSON.parse(cached) as Slot[]).map((slot) => ({
            ...slot,
            start: new Date(slot.start_time),
            end: new Date(slot.end_time),
          }));
        } catch {
          /* cache hỏng → tính lại */
        }
      }
    }

    const slots = await this.computeSlots(query);
    await this.redis.set(key, JSON.stringify(slots), slotConfig().cacheTtlSeconds);
    return slots;
  }

  /** Xoá cache slot của stylist trong một ngày (gọi sau mọi thao tác ghi). */
  async invalidate(branchId: string, stylistId: string, dateKey: string): Promise<void> {
    const removed = await this.redis.delByPrefix(`slots:${branchId}:${stylistId}:${dateKey}:`);
    if (removed > 0) this.logger.debug('Đã xoá cache slot', { branchId, stylistId, dateKey, removed });
  }

  async invalidateForInstant(branchId: string, stylistId: string, instant: Date): Promise<void> {
    // Một booking có thể ảnh hưởng khung giờ của ngày trước đó (booking qua nửa đêm) — xoá cả 2 ngày.
    await this.invalidate(branchId, stylistId, vnDateKey(instant));
    await this.invalidate(branchId, stylistId, vnDateKey(addMinutes(instant, -24 * 60)));
  }

  async computeSlots(query: SlotQuery): Promise<Slot[]> {
    const { branchId, stylistId, serviceId, date } = query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Ngày không hợp lệ, cần theo định dạng YYYY-MM-DD.');
    }

    const [branch, service, stylist] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: branchId } }),
      this.prisma.service.findUnique({ where: { id: serviceId } }),
      this.prisma.stylist.findUnique({ where: { id: stylistId } }),
    ]);
    if (!branch) throw new NotFoundException('Không tìm thấy chi nhánh.');
    if (!service) throw new NotFoundException('Không tìm thấy dịch vụ.');
    if (!stylist) throw new NotFoundException('Không tìm thấy stylist.');
    if (service.branchId !== branchId) throw new BadRequestException('Dịch vụ không thuộc chi nhánh đã chọn.');
    if (stylist.branchId !== branchId) throw new BadRequestException('Stylist không thuộc chi nhánh đã chọn.');

    const { start: dayStart, end: dayEnd } = vnDayRangeUtc(date);
    const weekday = vnParts(dayStart).weekday;

    const [workingHours, timeOff, bookings] = await Promise.all([
      this.prisma.workingHour.findMany({
        where: { stylistId, dayOfWeek: weekday, isActive: true },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.timeOff.findMany({
        where: { stylistId, startTime: { lt: dayEnd }, endTime: { gt: dayStart } },
      }),
      this.prisma.booking.findMany({
        where: {
          stylistId,
          status: { notIn: ['cancelled', 'no_show'] },
          startTime: { lt: dayEnd },
          endTime: { gt: dayStart },
        },
        select: { startTime: true, endTime: true },
      }),
    ]);

    const branchOpen = hmToMinutes(branch.openTime);
    const branchClose = hmToMinutes(branch.closeTime);
    if (branchOpen === null || branchClose === null || branchClose <= branchOpen) return [];

    const { stepMinutes, leadMinutes } = slotConfig();
    const duration = service.durationMinutes;
    const busy: Interval[] = [
      ...timeOff.map((item) => ({ start: item.startTime, end: item.endTime })),
      ...bookings.map((item) => ({ start: item.startTime, end: item.endTime })),
    ];
    const earliestStart = new Date(Date.now() + leadMinutes * 60_000);

    const starts = new Set<number>();
    for (const range of workingHours) {
      const rangeStart = hmToMinutes(range.startTime);
      const rangeEnd = hmToMinutes(range.endTime);
      if (rangeStart === null || rangeEnd === null) continue;
      const bounded: RangeMinutes = {
        startMin: Math.max(rangeStart, branchOpen),
        endMin: Math.min(rangeEnd, branchClose),
      };
      if (bounded.endMin <= bounded.startMin) continue;
      for (const minute of buildStarts(bounded, duration, stepMinutes)) starts.add(minute);
    }

    const slots: Slot[] = [];
    for (const minute of Array.from(starts).sort((a, b) => a - b)) {
      const start = vnLocalToUtc(date, minutesToHm(minute));
      const end = addMinutes(start, duration);
      if (start.getTime() < earliestStart.getTime()) continue;
      if (findOverlap({ start, end }, busy)) continue;
      slots.push({
        start_time: toVnIso(start),
        end_time: toVnIso(end),
        start,
        end,
        branch_id: branchId,
        stylist_id: stylistId,
        service_id: serviceId,
        duration_minutes: duration,
      });
    }
    return slots;
  }

  /**
   * Gợi ý khung giờ thay thế khi slot bị chiếm (dùng cho 409 và cho trợ lý AI).
   * Quét tối đa `days` ngày kể từ ngày yêu cầu.
   */
  async suggestAlternatives(
    query: Omit<SlotQuery, 'date'> & { from: Date; limit?: number; days?: number },
  ): Promise<{ start_time: string; stylist_id: string }[]> {
    const limit = query.limit ?? 3;
    const days = query.days ?? 3;
    const suggestions: { start_time: string; stylist_id: string }[] = [];

    for (let offset = 0; offset < days && suggestions.length < limit; offset += 1) {
      const dateKey = vnDateKey(addMinutes(query.from, offset * 24 * 60));
      let slots: Slot[] = [];
      try {
        slots = await this.computeSlots({
          branchId: query.branchId,
          stylistId: query.stylistId,
          serviceId: query.serviceId,
          date: dateKey,
        });
      } catch {
        return suggestions;
      }
      for (const slot of slots) {
        if (slot.start.getTime() < query.from.getTime()) continue;
        suggestions.push({ start_time: slot.start_time, stylist_id: slot.stylist_id });
        if (suggestions.length >= limit) break;
      }
    }
    return suggestions;
  }

  /** Kiểm tra một khung giờ cụ thể có nằm trong giờ làm việc của stylist hay không. */
  async assertWithinWorkingHours(stylistId: string, start: Date, end: Date): Promise<void> {
    const weekday = vnParts(start).weekday;
    const startMin = vnParts(start).hour * 60 + vnParts(start).minute;
    const endMin = vnParts(end).hour * 60 + vnParts(end).minute;
    const ranges = await this.prisma.workingHour.findMany({
      where: { stylistId, dayOfWeek: weekday, isActive: true },
    });
    const spans: RangeMinutes[] = ranges.map((range) => ({
      startMin: hmToMinutes(range.startTime) ?? 0,
      endMin: hmToMinutes(range.endTime) ?? 0,
    }));
    if (!isCoveredByRanges(startMin, endMin, spans)) {
      const human = ranges.length
        ? ranges.map((range) => `${range.startTime}–${range.endTime}`).join(', ')
        : 'không có lịch làm việc';
      throw new BadRequestException(`Khung giờ này ngoài giờ làm việc của stylist (${human}).`);
    }
  }
}
