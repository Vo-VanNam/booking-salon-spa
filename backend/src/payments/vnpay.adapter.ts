import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VnpayConfig } from '../common/config';

/**
 * Adapter VNPay — thuật toán chữ ký theo đúng hợp đồng harness (DOCUMENT.md):
 *   lowercase hex HMAC-SHA512 trên chuỗi các field vnp_* (trừ vnp_SecureHash) sắp xếp theo key tăng dần,
 *   mỗi field là "<key>=<value>", nối bằng "&", secret = VNPAY_HASH_SECRET.
 * vnp_Amount là số nguyên VND (không nhân 100).
 */

const SIGNATURE_FIELDS = ['vnp_SecureHash', 'vnp_SecureHashType'];

export function buildCanonicalString(params: Record<string, string>, exclude: readonly string[]): string {
  return Object.keys(params)
    .filter((key) => !exclude.includes(key))
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
}

export function signVnpay(params: Record<string, string>, secret: string, exclude: readonly string[] = SIGNATURE_FIELDS): string {
  return createHmac('sha512', secret).update(buildCanonicalString(params, exclude), 'utf8').digest('hex');
}

function safeEqualHex(expectedHex: string, providedHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'utf8');
  const provided = Buffer.from(providedHex, 'utf8');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/**
 * Xác thực chữ ký webhook. Chấp nhận 2 cách hiểu chuỗi canonical:
 *  (1) bỏ vnp_SecureHash + vnp_SecureHashType (chuẩn VNPay),
 *  (2) bỏ mỗi vnp_SecureHash ("mọi field vnp_* còn lại").
 * Cả hai đều yêu cầu biết secret nên không nới lỏng bảo mật.
 */
export function verifyVnpaySignature(params: Record<string, string>, secret: string): boolean {
  const provided = (params.vnp_SecureHash ?? '').toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(provided)) return false;
  const candidates = [
    signVnpay(params, secret, SIGNATURE_FIELDS),
    signVnpay(params, secret, ['vnp_SecureHash']),
  ];
  return candidates.some((expected) => safeEqualHex(expected, provided));
}

function compactVnDate(instant: Date): string {
  const shifted = new Date(instant.getTime() + 7 * 3600 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${shifted.getUTCFullYear()}${pad(shifted.getUTCMonth() + 1)}${pad(shifted.getUTCDate())}` +
    `${pad(shifted.getUTCHours())}${pad(shifted.getUTCMinutes())}${pad(shifted.getUTCSeconds())}`
  );
}

export interface PaymentUrlInput {
  amountVnd: number;
  txnRef: string;
  orderInfo: string;
  ipAddr: string;
  createdAt?: Date;
}

export function buildVnpayPaymentUrl(config: VnpayConfig, input: PaymentUrlInput): string {
  const params: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: config.tmnCode,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: input.txnRef,
    vnp_OrderInfo: input.orderInfo,
    vnp_OrderType: 'other',
    // Hợp đồng harness quy định vnp_Amount là VND nguyên (không nhân 100).
    vnp_Amount: String(Math.round(input.amountVnd)),
    vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: input.ipAddr.includes(':') ? '127.0.0.1' : input.ipAddr,
    vnp_CreateDate: compactVnDate(input.createdAt ?? new Date()),
  };
  const secureHash = signVnpay(params, config.hashSecret, []);
  const query = Object.keys(params)
    .sort()
    .map((key) => `${key}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`)
    .join('&');
  return `${config.payUrl}?${query}&vnp_SecureHash=${secureHash}`;
}
