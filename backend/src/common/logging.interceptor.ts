import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { AppLogger } from './logger';
import { setRequestUser } from './request-context';

/** Log HTTP hoàn tất dạng JSON kèm thời lượng + request_id (DOCUMENT.md §5). */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new AppLogger('http');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: { id?: string; role?: string } }>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    if (request.user?.id) setRequestUser(request.user.id, request.user.role);

    return next.handle().pipe(
      tap({
        next: () => this.writeLog(request, response, startedAt),
        error: () => this.writeLog(request, response, startedAt),
      }),
    );
  }

  private writeLog(request: Request, response: Response, startedAt: number): void {
    const path = request.originalUrl?.split('?')[0] ?? request.url;
    if (path === '/health') return;
    const record = {
      method: request.method,
      path,
      status: response.statusCode,
      duration_ms: Date.now() - startedAt,
    };
    if (response.statusCode >= 500) this.logger.error('http_request', undefined, record);
    else if (response.statusCode >= 400) this.logger.warn('http_request', record);
    else this.logger.log('http_request', record);
  }
}
