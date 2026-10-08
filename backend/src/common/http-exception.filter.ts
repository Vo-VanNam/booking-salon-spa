import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppLogger } from './logger';
import { getRequestId } from './request-context';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  requestId?: string;
  code?: string;
  [key: string]: unknown;
}

const FALLBACK_MESSAGE = 'Đã có lỗi xảy ra. Vui lòng thử lại sau ít phút.';

/**
 * Mọi lỗi trả về client đều là tiếng Việt (DOCUMENT.md §4.1, §8).
 * `error` và `message` mang cùng nội dung tiếng Việt để client đọc field nào cũng đúng;
 * `code` là mã máy đọc được (SLOT_CONFLICT, VALIDATION_ERROR, …).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const requestId = getRequestId();

    const body = this.toErrorBody(exception, requestId);

    if (body.statusCode >= 500) {
      this.logger.error(
        `Lỗi hệ thống tại ${request?.method} ${request?.url}: ${body.message}`,
        exception instanceof Error ? exception.stack : undefined,
        { code: body.code, status: body.statusCode },
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorBody(exception: unknown, requestId?: string): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        return { statusCode: status, error: payload, message: payload, requestId, code: this.codeFor(status) };
      }
      const record = payload as Record<string, unknown>;
      const rawMessage = record.message;
      const message = Array.isArray(rawMessage)
        ? String(rawMessage[0] ?? FALLBACK_MESSAGE)
        : typeof rawMessage === 'string' && rawMessage.length > 0
          ? rawMessage
          : exception.message || FALLBACK_MESSAGE;
      const { statusCode: _statusCode, error: _error, message: _message, code, ...rest } = record;
      return {
        statusCode: status,
        error: message,
        message,
        requestId,
        code: typeof code === 'string' ? code : this.codeFor(status),
        ...rest,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception, requestId);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Dữ liệu gửi lên không hợp lệ.',
        message: 'Dữ liệu gửi lên không hợp lệ.',
        requestId,
        code: 'INVALID_DATA',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: FALLBACK_MESSAGE,
      message: FALLBACK_MESSAGE,
      requestId,
      code: 'INTERNAL_ERROR',
    };
  }

  private fromPrisma(error: Prisma.PrismaClientKnownRequestError, requestId?: string): ErrorBody {
    switch (error.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'Dữ liệu đã tồn tại, vui lòng kiểm tra lại.',
          message: 'Dữ liệu đã tồn tại, vui lòng kiểm tra lại.',
          requestId,
          code: 'DUPLICATE',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Không tìm thấy dữ liệu yêu cầu.',
          message: 'Không tìm thấy dữ liệu yêu cầu.',
          requestId,
          code: 'NOT_FOUND',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Dữ liệu tham chiếu không hợp lệ.',
          message: 'Dữ liệu tham chiếu không hợp lệ.',
          requestId,
          code: 'INVALID_REFERENCE',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: FALLBACK_MESSAGE,
          message: FALLBACK_MESSAGE,
          requestId,
          code: `PRISMA_${error.code}`,
        };
    }
  }

  private codeFor(status: number): string {
    switch (status) {
      case 400:
        return 'VALIDATION_ERROR';
      case 401:
        return 'UNAUTHENTICATED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 429:
        return 'RATE_LIMITED';
      case 503:
        return 'SERVICE_UNAVAILABLE';
      default:
        return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
    }
  }
}
