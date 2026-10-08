import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.decorators';
import { sanitizeText } from '../../common/validators';
import { AdminService } from '../../admin/admin.service';
import { BookingsService } from '../../bookings/bookings.service';
import { PrismaService } from '../../prisma/prisma.module';
import { SlotsService } from '../../slots/slots.service';
import { optionalInt, optionalString, parseToolArguments, requireString, ToolDefinition } from '../ai.types';

export interface ToolContext {
  sessionId: string;
  actor: 'ai' | string;
  user?: AuthUser;
}

export interface ToolOutcome {
  data: unknown;
  success?: boolean;
  preview?: string;
}

export interface RegisteredTool {
  definition: ToolDefinition;
  validate: (args: Record<string, unknown>) => Record<string, unknown>;
  handle: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolOutcome>;
}

export function toolErrorMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    const message = (response as { message?: unknown }).message;
    if (Array.isArray(message)) return String(message[0]);
    if (typeof message === 'string') return message;
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Bộ công cụ cho trợ lý khách hàng (DOCUMENT.md §2.8).
 * Chỉ những công cụ trong registry này mới được thực thi — mọi tên khác bị từ chối ở tầng service.
 */
@Injectable()
export class CustomerToolRegistry {
  private readonly tools: Map<string, RegisteredTool>;

  constructor(
    private readonly slots: SlotsService,
    private readonly bookings: BookingsService,
    private readonly prisma: PrismaService,
  ) {
    const registry: RegisteredTool[] = [
      {
        definition: {
          type: 'function',
          function: {
            name: 'get_slots',
            description:
              'Lấy danh sách khung giờ còn trống thật của hệ thống cho một stylist/dịch vụ trong một ngày. Bắt buộc dùng công cụ này trước khi giới thiệu giờ cho khách.',
            parameters: {
              type: 'object',
              properties: {
                branch_id: { type: 'string', description: 'Mã chi nhánh (ví dụ branch-1).' },
                stylist_id: { type: 'string', description: 'Mã stylist (ví dụ stylist-1-1).' },
                service_id: { type: 'string', description: 'Mã dịch vụ (ví dụ svc-1-1).' },
                date: { type: 'string', description: 'Ngày theo giờ Việt Nam, định dạng YYYY-MM-DD.' },
              },
              required: ['branch_id', 'stylist_id', 'service_id', 'date'],
            },
          },
        },
        validate: (args) => ({
          branch_id: requireString(args, 'branch_id', 'mã chi nhánh'),
          stylist_id: requireString(args, 'stylist_id', 'mã stylist'),
          service_id: requireString(args, 'service_id', 'mã dịch vụ'),
          date: requireString(args, 'date', 'ngày'),
        }),
        handle: async (args) => {
          const date = String(args.date);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return { data: { ok: false, error: 'Ngày không hợp lệ, cần theo định dạng YYYY-MM-DD.' }, success: false };
          }
          try {
            const slots = await this.slots.getSlots({
              branchId: String(args.branch_id),
              stylistId: String(args.stylist_id),
              serviceId: String(args.service_id),
              date,
            });
            const limited = slots.slice(0, 30).map((slot) => ({
              start_time: slot.start_time,
              end_time: slot.end_time,
            }));
            return {
              data: {
                date,
                branch_id: String(args.branch_id),
                stylist_id: String(args.stylist_id),
                service_id: String(args.service_id),
                total: slots.length,
                slots: limited,
              },
              preview: `${limited.length} khung giờ trống ngày ${date}`,
            };
          } catch (error) {
            return { data: { ok: false, error: toolErrorMessage(error) }, success: false };
          }
        },
      },
      {
        definition: {
          type: 'function',
          function: {
            name: 'create_booking',
            description:
              'Tạo lịch hẹn thật cho khách. Chỉ gọi khi đã có đủ: chi nhánh, dịch vụ, stylist, thời gian bắt đầu, tên và số điện thoại khách. Nếu khung giờ đã bị đặt, hệ thống trả về lỗi kèm gợi ý giờ khác.',
            parameters: {
              type: 'object',
              properties: {
                branch_id: { type: 'string', description: 'Mã chi nhánh.' },
                service_id: { type: 'string', description: 'Mã dịch vụ.' },
                stylist_id: { type: 'string', description: 'Mã stylist.' },
                start_time: {
                  type: 'string',
                  description: 'Thời gian bắt đầu ISO 8601 kèm offset +07:00 (ví dụ 2026-10-08T09:00:00+07:00).',
                },
                customer_name: { type: 'string', description: 'Tên khách hàng.' },
                customer_phone: { type: 'string', description: 'Số điện thoại di động Việt Nam 10 chữ số.' },
              },
              required: ['branch_id', 'service_id', 'stylist_id', 'start_time', 'customer_name', 'customer_phone'],
            },
          },
        },
        validate: (args) => ({
          branch_id: requireString(args, 'branch_id', 'mã chi nhánh'),
          service_id: requireString(args, 'service_id', 'mã dịch vụ'),
          stylist_id: requireString(args, 'stylist_id', 'mã stylist'),
          start_time: requireString(args, 'start_time', 'thời gian bắt đầu'),
          customer_name: requireString(args, 'customer_name', 'tên khách hàng'),
          customer_phone: requireString(args, 'customer_phone', 'số điện thoại'),
        }),
        handle: async (args) => {
          try {
            const booking = await this.bookings.create(
              {
                branchId: String(args.branch_id),
                serviceId: String(args.service_id),
                stylistId: String(args.stylist_id),
                startTime: String(args.start_time),
                customerName: String(args.customer_name),
                customerPhone: String(args.customer_phone),
                source: 'ai',
              },
              { actor: 'ai' },
            );
            return {
              data: {
                ok: true,
                booking: {
                  id: booking.id,
                  status: booking.status,
                  start_time: booking.start_time,
                  end_time: booking.end_time,
                  deposit_amount: booking.deposit_amount,
                  deposit_status: booking.deposit_status,
                  discount_amount: booking.discount_amount,
                },
              },
              preview: `Đã tạo lịch ${booking.id}`,
            };
          } catch (error) {
            const response = error instanceof HttpException ? error.getResponse() : null;
            const suggestions =
              response && typeof response === 'object' && Array.isArray((response as { suggestions?: unknown }).suggestions)
                ? (response as { suggestions: string[] }).suggestions
                : [];
            return {
              data: { ok: false, error: toolErrorMessage(error), suggestions },
              success: false,
              preview: `Không tạo được lịch: ${toolErrorMessage(error)}`,
            };
          }
        },
      },
      {
        definition: {
          type: 'function',
          function: {
            name: 'get_branch_info',
            description:
              'Lấy thông tin chi nhánh từ cơ sở dữ liệu: địa chỉ, giờ mở/đóng cửa, danh sách dịch vụ kèm giá và thời lượng. Dùng để trả lời câu hỏi thường gặp; không được tự bịa.',
            parameters: {
              type: 'object',
              properties: {
                branch_id: { type: 'string', description: 'Mã chi nhánh; bỏ trống để lấy tất cả chi nhánh.' },
              },
            },
          },
        },
        validate: (args) => ({ branch_id: optionalString(args, 'branch_id') }),
        handle: async (args) => {
          const branchId = args.branch_id ? String(args.branch_id) : undefined;
          const branches = await this.prisma.branch.findMany({
            where: { isActive: true, ...(branchId ? { id: branchId } : {}) },
            include: { services: { where: { isActive: true }, orderBy: { id: 'asc' } } },
            orderBy: { id: 'asc' },
          });
          if (branches.length === 0) {
            return { data: { ok: false, error: 'Không tìm thấy chi nhánh.' }, success: false };
          }
          return {
            data: {
              branches: branches.map((branch) => ({
                id: branch.id,
                name: branch.name,
                address: branch.address,
                open_time: branch.openTime,
                close_time: branch.closeTime,
                services: branch.services.map((service) => ({
                  id: service.id,
                  name: service.name,
                  price: service.price,
                  duration_minutes: service.durationMinutes,
                })),
              })),
            },
            preview: `${branches.length} chi nhánh`,
          };
        },
      },
      {
        definition: {
          type: 'function',
          function: {
            name: 'list_branches',
            description: 'Liệt kê các chi nhánh đang hoạt động (mã, tên, địa chỉ, giờ mở cửa) từ cơ sở dữ liệu.',
            parameters: { type: 'object', properties: {} },
          },
        },
        validate: () => ({}),
        handle: async () => {
          const branches = await this.prisma.branch.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } });
          return {
            data: {
              branches: branches.map((branch) => ({
                id: branch.id,
                name: branch.name,
                address: branch.address,
                open_time: branch.openTime,
                close_time: branch.closeTime,
              })),
            },
            preview: `${branches.length} chi nhánh`,
          };
        },
      },
      {
        definition: {
          type: 'function',
          function: {
            name: 'request_human_support',
            description:
              'Đánh dấu hội thoại cần nhân viên hỗ trợ khi khách yêu cầu gặp người thật, khiếu nại, hoặc câu hỏi ngoài phạm vi đặt lịch/dịch vụ.',
            parameters: {
              type: 'object',
              properties: { reason: { type: 'string', description: 'Lý do cần hỗ trợ.' } },
              required: ['reason'],
            },
          },
        },
        validate: (args) => ({ reason: requireString(args, 'reason', 'lý do') }),
        handle: async (args, context) => {
          await this.prisma.aiSession.upsert({
            where: { sessionId: context.sessionId },
            update: { needsHuman: true, reason: sanitizeText(String(args.reason), 250) },
            create: {
              sessionId: context.sessionId,
              kind: 'customer',
              needsHuman: true,
              reason: sanitizeText(String(args.reason), 250),
            },
          });
          return { data: { ok: true, message: 'Đã ghi nhận yêu cầu hỗ trợ từ nhân viên.' }, preview: 'handoff' };
        },
      },
    ];

    this.tools = new Map(registry.map((tool) => [tool.definition.function.name, tool]));
  }

  definitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => tool.definition);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  names(): string[] {
    return Array.from(this.tools.keys());
  }
}

/**
 * Bộ công cụ cho trợ lý phân tích của admin (DOCUMENT.md §2.9).
 * Model KHÔNG được truyền branch_id: phạm vi chi nhánh do server quyết định theo role của người hỏi,
 * nên branch_admin không thể hỏi dữ liệu chi nhánh khác. Model cũng không bao giờ sinh SQL.
 */
@Injectable()
export class AnalyticsToolRegistry {
  private readonly tools: Map<string, RegisteredTool>;

  constructor(private readonly admin: AdminService) {
    const registry: RegisteredTool[] = [
      {
        definition: {
          type: 'function',
          function: {
            name: 'get_revenue_summary',
            description: 'Tổng doanh thu (VND) của các lịch hẹn đã hoàn tất, kèm số lịch hoàn tất và doanh thu theo ngày/tháng.',
            parameters: {
              type: 'object',
              properties: {
                from: { type: 'string', description: 'Ngày bắt đầu YYYY-MM-DD (giờ Việt Nam), bỏ trống = từ trước tới nay.' },
                to: { type: 'string', description: 'Ngày kết thúc YYYY-MM-DD, bỏ trống = hiện tại.' },
              },
            },
          },
        },
        validate: (args) => ({ from: optionalString(args, 'from'), to: optionalString(args, 'to') }),
        handle: async (args, context) => {
          if (!context.user) throw new NotFoundException('Thiếu thông tin người dùng.');
          const revenue = await this.admin.revenue(context.user, {
            from: args.from ? String(args.from) : undefined,
            to: args.to ? String(args.to) : undefined,
          });
          return { data: revenue, preview: `Doanh thu ${revenue.total_revenue} VND` };
        },
      },
      {
        definition: {
          type: 'function',
          function: {
            name: 'get_top_services',
            description: 'Các dịch vụ được đặt nhiều nhất kèm doanh thu, trong phạm vi được phép của người hỏi.',
            parameters: {
              type: 'object',
              properties: {
                from: { type: 'string', description: 'Ngày bắt đầu YYYY-MM-DD.' },
                to: { type: 'string', description: 'Ngày kết thúc YYYY-MM-DD.' },
                limit: { type: 'integer', description: 'Số dịch vụ trả về (mặc định 5).' },
              },
            },
          },
        },
        validate: (args) => ({
          from: optionalString(args, 'from'),
          to: optionalString(args, 'to'),
          limit: optionalInt(args, 'limit', 5),
        }),
        handle: async (args, context) => {
          if (!context.user) throw new NotFoundException('Thiếu thông tin người dùng.');
          const data = await this.admin.topServices(context.user, {
            from: args.from ? String(args.from) : undefined,
            to: args.to ? String(args.to) : undefined,
            limit: Math.min(Number(args.limit ?? 5), 20),
          });
          return { data: { top_services: data }, preview: `${data.length} dịch vụ` };
        },
      },
      {
        definition: {
          type: 'function',
          function: {
            name: 'get_top_stylists',
            description: 'Các stylist có nhiều lịch hoàn tất nhất kèm doanh thu, trong phạm vi được phép.',
            parameters: {
              type: 'object',
              properties: {
                from: { type: 'string', description: 'Ngày bắt đầu YYYY-MM-DD.' },
                to: { type: 'string', description: 'Ngày kết thúc YYYY-MM-DD.' },
                limit: { type: 'integer', description: 'Số stylist trả về (mặc định 5).' },
              },
            },
          },
        },
        validate: (args) => ({
          from: optionalString(args, 'from'),
          to: optionalString(args, 'to'),
          limit: optionalInt(args, 'limit', 5),
        }),
        handle: async (args, context) => {
          if (!context.user) throw new NotFoundException('Thiếu thông tin người dùng.');
          const data = await this.admin.topStylists(context.user, {
            from: args.from ? String(args.from) : undefined,
            to: args.to ? String(args.to) : undefined,
            limit: Math.min(Number(args.limit ?? 5), 20),
          });
          return { data: { top_stylists: data }, preview: `${data.length} stylist` };
        },
      },
      {
        definition: {
          type: 'function',
          function: {
            name: 'get_cancellation_rate',
            description: 'Tỷ lệ hủy/không đến trên tổng số lịch hẹn trong phạm vi được phép.',
            parameters: {
              type: 'object',
              properties: {
                from: { type: 'string', description: 'Ngày bắt đầu YYYY-MM-DD.' },
                to: { type: 'string', description: 'Ngày kết thúc YYYY-MM-DD.' },
              },
            },
          },
        },
        validate: (args) => ({ from: optionalString(args, 'from'), to: optionalString(args, 'to') }),
        handle: async (args, context) => {
          if (!context.user) throw new NotFoundException('Thiếu thông tin người dùng.');
          const data = await this.admin.cancellationRate(context.user, {
            from: args.from ? String(args.from) : undefined,
            to: args.to ? String(args.to) : undefined,
          });
          return { data, preview: `Tỷ lệ hủy ${data.cancellation_rate}%` };
        },
      },
    ];
    this.tools = new Map(registry.map((tool) => [tool.definition.function.name, tool]));
  }

  definitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => tool.definition);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }
}

export { parseToolArguments };
