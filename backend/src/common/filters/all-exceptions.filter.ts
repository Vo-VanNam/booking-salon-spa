import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: unknown;
  requestId: string;
  path: string;
  timestamp: string;
  affectedBookings?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const requestId = request.id ?? randomUUID();

    // Response đã gửi (stream/static) thì không can thiệp tiếp để tránh ERR_HTTP_HEADERS_SENT
    if (response.headersSent) {
      this.logger.error(
        `Lỗi xảy ra sau khi response đã gửi: ${String(exception)}`,
      );
      return;
    }

    const resolved = this.resolve(exception);

    this.logger.error(
      `${request.method} ${request.originalUrl} -> ${resolved.statusCode} | requestId=${requestId} | ${String(
        exception instanceof Error ? exception.stack : exception,
      )}`,
    );

    const body: ErrorBody = {
      statusCode: resolved.statusCode,
      message: resolved.message,
      requestId,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      ...(resolved.affectedBookings !== undefined
        ? { affectedBookings: resolved.affectedBookings }
        : {}),
    };

    response
      .status(resolved.statusCode)
      .setHeader('x-request-id', requestId)
      .json(body);
  }

  private resolve(exception: unknown): {
    statusCode: number;
    message: unknown;
    affectedBookings?: unknown;
  } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaError(exception);
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        return { statusCode, message: this.localizeMessage(payload) };
      }
      if (typeof payload === 'object' && payload !== null) {
        const body = payload as Record<string, unknown>;
        if (Array.isArray(body.message)) {
          return { statusCode, message: body.message.join('; ') };
        }
        if (typeof body.message === 'string') {
          if (
            body.affectedBookings !== undefined &&
            Array.isArray(body.affectedBookings)
          ) {
            return {
              statusCode,
              message: this.localizeMessage(body.message),
              affectedBookings: body.affectedBookings,
            };
          }
          return { statusCode, message: this.localizeMessage(body.message) };
        }
        // Object detail (vd health check 503) giữ nguyên để client thấy chi tiết
        return { statusCode, message: payload };
      }
      return { statusCode, message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Đã có lỗi xảy ra, vui lòng thử lại sau',
    };
  }

  private resolvePrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    message: string;
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'Dữ liệu đã tồn tại',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Không tìm thấy dữ liệu',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Dữ liệu liên quan không hợp lệ',
        };
      case 'P2014':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'Thao tác vi phạm ràng buộc dữ liệu',
        };
      case 'P2024':
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Hệ thống quá tải, vui lòng thử lại sau',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Đã có lỗi xảy ra, vui lòng thử lại sau',
        };
    }
  }

  // Message mặc định của Nest khi không tìm thấy route ("Cannot GET /...") dịch sang tiếng Việt
  private localizeMessage(message: string): string {
    if (message.startsWith('Cannot ')) {
      return 'Không tìm thấy đường dẫn yêu cầu';
    }
    return message;
  }
}
