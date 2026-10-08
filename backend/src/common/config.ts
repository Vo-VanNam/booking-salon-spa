/**
 * Cấu hình ứng dụng: chỉ đọc từ biến môi trường (không hardcode secret ở bất kỳ đâu).
 * Các khoá thanh toán/AI là tuỳ chọn — thiếu thì ứng dụng vẫn khởi động và trả lỗi tiếng Việt rõ ràng
 * tại thời điểm gọi (không crash).
 */

export function env(name: string, fallback = ''): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

export function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function envList(name: string, fallback: string[] = []): string[] {
  const raw = env(name);
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function databaseUrl(): string {
  const url = env('DATABASE_URL');
  if (!url) {
    throw new Error('Thiếu biến môi trường DATABASE_URL — không thể kết nối cơ sở dữ liệu.');
  }
  return url;
}

export interface ServerConfig {
  port: number;
  corsOrigins: string[] | true;
  accessTtl: string;
  refreshTtlDays: number;
  jwtSecret: string;
}

export function serverConfig(): ServerConfig {
  const origins = envList('CORS_ORIGINS');
  return {
    port: envInt('PORT', 8100),
    corsOrigins: origins.length > 0 ? origins : true,
    accessTtl: env('JWT_ACCESS_TTL', '15m'),
    refreshTtlDays: envInt('JWT_REFRESH_TTL_DAYS', 7),
    jwtSecret: env('JWT_SECRET', ''),
  };
}

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxToolRounds: number;
}

/** null khi chưa cấu hình AI_BASE_URL — endpoint /ai/chat phải trả lỗi tiếng Việt, không được crash. */
export function aiConfig(): AiConfig | null {
  const baseUrl = env('AI_BASE_URL');
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey: env('AI_API_KEY'),
    model: env('AI_MODEL', 'gpt-4o-mini'),
    timeoutMs: envInt('AI_TIMEOUT_MS', 30_000),
    maxToolRounds: envInt('AI_MAX_TOOL_ROUNDS', 6),
  };
}

export interface VnpayConfig {
  tmnCode: string;
  hashSecret: string;
  payUrl: string;
  apiUrl: string;
  returnUrl: string;
}

export function vnpayConfig(): VnpayConfig {
  return {
    tmnCode: env('VNPAY_TMN_CODE'),
    hashSecret: env('VNPAY_HASH_SECRET'),
    payUrl: env('VNPAY_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'),
    apiUrl: env('VNPAY_API_URL', 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction'),
    returnUrl: env('VNPAY_RETURN_URL', `${env('PUBLIC_FRONTEND_URL', 'http://localhost:8101')}/booking`),
  };
}

export function vnpayConfigured(): boolean {
  const cfg = vnpayConfig();
  return Boolean(cfg.tmnCode && cfg.hashSecret);
}

export interface MomoConfig {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  apiUrl: string;
  returnUrl: string;
}

export function momoConfig(): MomoConfig {
  return {
    partnerCode: env('MOMO_PARTNER_CODE'),
    accessKey: env('MOMO_ACCESS_KEY'),
    secretKey: env('MOMO_SECRET_KEY'),
    apiUrl: env('MOMO_API_URL', 'https://test-payment.momo.vn/v2/gateway/api/create'),
    returnUrl: env('MOMO_RETURN_URL', `${env('PUBLIC_FRONTEND_URL', 'http://localhost:8101')}/booking`),
  };
}

export function momoConfigured(): boolean {
  const cfg = momoConfig();
  return Boolean(cfg.partnerCode && cfg.accessKey && cfg.secretKey);
}

export interface LoyaltyConfig {
  threshold: number;
  discountPercent: number;
}

export function loyaltyConfig(): LoyaltyConfig {
  return {
    threshold: envInt('LOYALTY_THRESHOLD', 10),
    discountPercent: envInt('LOYALTY_DISCOUNT_PERCENT', 10),
  };
}

export function slotConfig(): { stepMinutes: number; cacheTtlSeconds: number; leadMinutes: number } {
  return {
    stepMinutes: envInt('SLOT_STEP_MINUTES', 15),
    cacheTtlSeconds: envInt('SLOT_CACHE_TTL_SECONDS', 30),
    leadMinutes: envInt('SLOT_LEAD_MINUTES', 10),
  };
}

export function reminderHours(): number[] {
  return envList('REMINDER_HOURS', ['24', '1'])
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

export function queueEnabled(): boolean {
  return env('QUEUE_ENABLED', 'true') !== 'false' && Boolean(env('REDIS_URL'));
}

/**
 * Bật khi ứng dụng chạy sau reverse proxy (nginx ghi X-Real-IP = $remote_addr).
 * Khi tắt (mặc định), danh tính cho rate limit chỉ lấy từ địa chỉ socket — chống giả mạo header.
 */
export function trustProxyEnabled(): boolean {
  return env('TRUST_PROXY', 'false') === 'true';
}

export function depositPercent(): number {
  return envInt('DEPOSIT_PERCENT', 30);
}
