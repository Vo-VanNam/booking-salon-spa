import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BookingStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth.decorators';
import { resolveBranchScope } from '../common/branch-access';
import { parseInstant, vnDateKey, vnDayRangeUtc } from '../common/time';
import { PrismaService } from '../prisma/prisma.module';

export interface RevenueQuery {
  branch_id?: string;
  from?: string;
  to?: string;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number.parseInt(value, 10) || 0;
  return 0;
}

/** Ngày (YYYY-MM-DD) từ kết quả raw SQL: Postgres trả Date, một số driver trả chuỗi. */
function toDateKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return String(value ?? '');
}

function toMonthKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 7);
  if (typeof value === 'string') return value.slice(0, 7);
  return String(value ?? '');
}

/**
 * Doanh thu + số liệu phân tích (DOCUMENT.md §2.6, §2.9).
 * Doanh thu ghi nhận khi lịch hẹn hoàn tất: price − discount_amount.
 * branch_admin chỉ thấy chi nhánh mình (resolveBranchScope ném 403 nếu hỏi chi nhánh khác).
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private rangeWhere(from?: string, to?: string): { start: Date; end: Date } | null {
    if (!from && !to) return null;
    const start = from ? (parseInstant(from) ?? vnDayRangeUtc(from).start) : new Date(0);
    const end = to ? (parseInstant(to) ?? vnDayRangeUtc(to).end) : new Date();
    return { start, end };
  }

  async revenue(user: AuthUser, query: RevenueQuery) {
    const branchId = resolveBranchScope(user, query.branch_id);
    const range = this.rangeWhere(query.from, query.to);
    const where: Prisma.BookingWhereInput = {
      status: 'completed',
      ...(branchId ? { branchId } : {}),
      ...(range ? { startTime: { gte: range.start, lte: range.end } } : {}),
    };

    const [totals, byBranchRaw, byDayRows, byMonthRows, branches] = await Promise.all([
      this.prisma.booking.aggregate({
        where,
        _sum: { price: true, discountAmount: true, depositAmount: true },
        _count: { _all: true },
      }),
      this.prisma.booking.groupBy({
        by: ['branchId'],
        where,
        _sum: { price: true, discountAmount: true },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ day: Date; total: bigint; bookings: bigint }[]>`
        SELECT (start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
               COALESCE(SUM(price - discount_amount), 0)::bigint AS total,
               COUNT(*)::bigint AS bookings
        FROM bookings
        WHERE status = 'completed'
          ${branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty}
          ${range ? Prisma.sql`AND start_time >= ${range.start} AND start_time <= ${range.end}` : Prisma.empty}
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 400
      `,
      this.prisma.$queryRaw<{ month: Date; total: bigint; bookings: bigint }[]>`
        SELECT date_trunc('month', (start_time AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date AS month,
               COALESCE(SUM(price - discount_amount), 0)::bigint AS total,
               COUNT(*)::bigint AS bookings
        FROM bookings
        WHERE status = 'completed'
          ${branchId ? Prisma.sql`AND branch_id = ${branchId}` : Prisma.empty}
          ${range ? Prisma.sql`AND start_time >= ${range.start} AND start_time <= ${range.end}` : Prisma.empty}
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 60
      `,
      this.prisma.branch.findMany({ select: { id: true, name: true } }),
    ]);

    const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
    const totalRevenue = (totals._sum.price ?? 0) - (totals._sum.discountAmount ?? 0);

    return {
      total_revenue: totalRevenue,
      currency: 'VND',
      completed_bookings: totals._count._all,
      deposit_collected: totals._sum.depositAmount ?? 0,
      by_branch: byBranchRaw
        .map((row) => ({
          branch_id: row.branchId,
          branch_name: branchNames.get(row.branchId) ?? row.branchId,
          total_revenue: (row._sum.price ?? 0) - (row._sum.discountAmount ?? 0),
          completed_bookings: row._count._all,
        }))
        .sort((a, b) => b.total_revenue - a.total_revenue),
      by_day: byDayRows.map((row) => ({
        date: toDateKey(row.day),
        total_revenue: toNumber(row.total),
        completed_bookings: toNumber(row.bookings),
      })),
      by_month: byMonthRows.map((row) => ({
        month: toMonthKey(row.month),
        total_revenue: toNumber(row.total),
        completed_bookings: toNumber(row.bookings),
      })),
    };
  }

  async dashboard(user: AuthUser, query: { branch_id?: string; date?: string }) {
    const branchId = resolveBranchScope(user, query.branch_id);
    const dateKey = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : vnDateKey(new Date());
    const { start, end } = vnDayRangeUtc(dateKey);
    const baseWhere: Prisma.BookingWhereInput = { ...(branchId ? { branchId } : {}) };

    const [byStatus, revenueToday, stylists, nextBooking, upcomingCount] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['status'],
        where: { ...baseWhere, startTime: { gte: start, lt: end } },
        _count: { _all: true },
      }),
      this.prisma.booking.aggregate({
        where: { ...baseWhere, status: 'completed', startTime: { gte: start, lt: end } },
        _sum: { price: true, discountAmount: true },
      }),
      this.prisma.stylist.count({ where: { ...(branchId ? { branchId } : {}), isActive: true } }),
      this.prisma.booking.findFirst({
        where: { ...baseWhere, status: { in: ['pending', 'confirmed'] }, startTime: { gte: new Date() } },
        orderBy: { startTime: 'asc' },
        include: { customer: true, stylist: true, service: true, branch: true },
      }),
      this.prisma.booking.count({
        where: { ...baseWhere, status: { in: ['pending', 'confirmed'] }, startTime: { gte: new Date() } },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    return {
      date: dateKey,
      branch_id: branchId,
      bookings_total: Object.values(statusCounts).reduce((sum, value) => sum + value, 0),
      bookings_by_status: statusCounts,
      revenue_today: (revenueToday._sum.price ?? 0) - (revenueToday._sum.discountAmount ?? 0),
      active_stylists: stylists,
      upcoming_bookings: upcomingCount,
      next_booking: nextBooking
        ? {
            id: nextBooking.id,
            start_time: nextBooking.startTime.toISOString(),
            customer_name: nextBooking.customer.name,
            stylist_name: nextBooking.stylist?.name ?? null,
            service_name: nextBooking.service.name,
            branch_name: nextBooking.branch.name,
          }
        : null,
    };
  }

  async topServices(user: AuthUser, query: { branch_id?: string; from?: string; to?: string; limit?: number }) {
    const branchId = resolveBranchScope(user, query.branch_id);
    const range = this.rangeWhere(query.from, query.to);
    const grouped = await this.prisma.booking.groupBy({
      by: ['serviceId'],
      where: {
        status: 'completed',
        ...(branchId ? { branchId } : {}),
        ...(range ? { startTime: { gte: range.start, lte: range.end } } : {}),
      },
      _count: { _all: true },
      _sum: { price: true, discountAmount: true },
      orderBy: { _count: { serviceId: 'desc' } },
      take: query.limit ?? 10,
    });
    const services = await this.prisma.service.findMany({
      where: { id: { in: grouped.map((row) => row.serviceId) } },
      select: { id: true, name: true },
    });
    const names = new Map(services.map((service) => [service.id, service.name]));
    return grouped.map((row) => ({
      service_id: row.serviceId,
      service_name: names.get(row.serviceId) ?? row.serviceId,
      bookings: row._count._all,
      revenue: (row._sum.price ?? 0) - (row._sum.discountAmount ?? 0),
    }));
  }

  async topStylists(user: AuthUser, query: { branch_id?: string; from?: string; to?: string; limit?: number }) {
    const branchId = resolveBranchScope(user, query.branch_id);
    const range = this.rangeWhere(query.from, query.to);
    const grouped = await this.prisma.booking.groupBy({
      by: ['stylistId'],
      where: {
        status: 'completed',
        ...(branchId ? { branchId } : {}),
        ...(range ? { startTime: { gte: range.start, lte: range.end } } : {}),
      },
      _count: { _all: true },
      _sum: { price: true, discountAmount: true },
      orderBy: { _count: { stylistId: 'desc' } },
      take: query.limit ?? 10,
    });
    const stylists = await this.prisma.stylist.findMany({
      where: { id: { in: grouped.map((row) => row.stylistId) } },
      select: { id: true, name: true },
    });
    const names = new Map(stylists.map((stylist) => [stylist.id, stylist.name]));
    return grouped.map((row) => ({
      stylist_id: row.stylistId,
      stylist_name: names.get(row.stylistId) ?? row.stylistId,
      bookings: row._count._all,
      revenue: (row._sum.price ?? 0) - (row._sum.discountAmount ?? 0),
    }));
  }

  async cancellationRate(user: AuthUser, query: { branch_id?: string; from?: string; to?: string }) {
    const branchId = resolveBranchScope(user, query.branch_id);
    const range = this.rangeWhere(query.from, query.to);
    const grouped = await this.prisma.booking.groupBy({
      by: ['status'],
      where: {
        ...(branchId ? { branchId } : {}),
        ...(range ? { startTime: { gte: range.start, lte: range.end } } : {}),
      },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const row of grouped) counts[row.status] = row._count._all;
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const cancelled = (counts.cancelled ?? 0) + (counts.no_show ?? 0);
    return {
      total_bookings: total,
      by_status: counts as Record<BookingStatus, number>,
      cancelled: counts.cancelled ?? 0,
      no_show: counts.no_show ?? 0,
      cancellation_rate: total > 0 ? Number(((cancelled / total) * 100).toFixed(2)) : 0,
    };
  }
}
