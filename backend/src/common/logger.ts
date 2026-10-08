import { LoggerService } from '@nestjs/common';
import { getRequestContext } from './request-context';

const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'secret',
  'apikey',
  'api_key',
  'hashsecret',
  'signature',
  'vnp_securehash',
];

/** Loại bỏ khoá/giá trị nhạy cảm trước khi ghi log (DOCUMENT.md §8: key không bao giờ xuất hiện trong log). */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEYS.includes(key.toLowerCase()) ? '[redacted]' : redact(item, depth + 1);
    }
    return output;
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

export interface LogFields {
  [key: string]: unknown;
}

/** Structured JSON logger (DOCUMENT.md §5) — mỗi dòng là một JSON object kèm request_id để trace. */
export class AppLogger implements LoggerService {
  constructor(private readonly context: string = 'app') {}

  child(context: string): AppLogger {
    return new AppLogger(context);
  }

  private write(level: string, message: unknown, fields?: LogFields, stack?: string): void {
    if (process.env.LOG_LEVEL === 'silent') return;
    const requestContext = getRequestContext();
    const record: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      context: this.context,
      msg: typeof message === 'string' ? message : redact(message),
    };
    if (requestContext?.requestId) record.request_id = requestContext.requestId;
    if (requestContext?.userId) record.user_id = requestContext.userId;
    if (fields) Object.assign(record, redact(fields) as Record<string, unknown>);
    if (stack) record.stack = stack.split('\n').slice(0, 6).join(' | ');
    process.stdout.write(`${JSON.stringify(record)}\n`);
  }

  log(message: unknown, context?: string | LogFields): void {
    this.write('info', message, this.asFields(context));
  }

  error(message: unknown, stack?: string, context?: string | LogFields): void {
    this.write('error', message, this.asFields(context), stack);
  }

  warn(message: unknown, context?: string | LogFields): void {
    this.write('warn', message, this.asFields(context));
  }

  debug(message: unknown, context?: string | LogFields): void {
    this.write('debug', message, this.asFields(context));
  }

  verbose(message: unknown, context?: string | LogFields): void {
    this.write('verbose', message, this.asFields(context));
  }

  private asFields(context?: string | LogFields): LogFields | undefined {
    if (!context) return undefined;
    return typeof context === 'string' ? { caller: context } : context;
  }
}
