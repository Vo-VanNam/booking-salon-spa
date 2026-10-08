import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from './request-context';

/** Gắn request_id (từ header hoặc sinh mới) vào AsyncLocalStorage để mọi log line trace được. */
export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const headerValue = request.headers['x-request-id'];
  const incoming = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const requestId = incoming && incoming.length <= 100 ? incoming : randomUUID();
  response.setHeader('X-Request-Id', requestId);
  runWithRequestContext(
    { requestId, method: request.method, path: request.originalUrl?.split('?')[0] ?? request.url },
    () => next(),
  );
}
