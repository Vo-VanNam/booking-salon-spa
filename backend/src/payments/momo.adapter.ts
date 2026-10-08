import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MomoConfig } from '../common/config';

/**
 * Adapter Momo (ví điện tử) — tạo yêu cầu thanh toán qua API thật và xác thực webhook HMAC-SHA256.
 * Tuân theo tài liệu Momo: chữ ký tính trên chuỗi key=value sắp xếp cố định, nối bằng "&".
 */

export function momoSignatureString(params: {
  accessKey: string;
  amount: number;
  extraData: string;
  message: string;
  orderId: string;
  orderInfo: string;
  orderType: string;
  partnerCode: string;
  payType: string;
  requestId: string;
  responseTime: string | number;
  resultCode: number | string;
  transId: string | number;
}): string {
  return [
    `accessKey=${params.accessKey}`,
    `amount=${params.amount}`,
    `extraData=${params.extraData}`,
    `message=${params.message}`,
    `orderId=${params.orderId}`,
    `orderInfo=${params.orderInfo}`,
    `orderType=${params.orderType}`,
    `partnerCode=${params.partnerCode}`,
    `payType=${params.payType}`,
    `requestId=${params.requestId}`,
    `responseTime=${params.responseTime}`,
    `resultCode=${params.resultCode}`,
    `transId=${params.transId}`,
  ].join('&');
}

export function signMomo(rawSignature: string, secretKey: string): string {
  return createHmac('sha256', secretKey).update(rawSignature, 'utf8').digest('hex');
}

export function verifyMomoSignature(
  payload: Record<string, unknown>,
  config: MomoConfig,
): boolean {
  const provided = String(payload.signature ?? '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const raw = momoSignatureString({
    accessKey: config.accessKey,
    amount: Number(payload.amount ?? 0),
    extraData: String(payload.extraData ?? ''),
    message: String(payload.message ?? ''),
    orderId: String(payload.orderId ?? ''),
    orderInfo: String(payload.orderInfo ?? ''),
    orderType: String(payload.orderType ?? ''),
    partnerCode: String(payload.partnerCode ?? ''),
    payType: String(payload.payType ?? ''),
    requestId: String(payload.requestId ?? ''),
    responseTime: String(payload.responseTime ?? ''),
    resultCode: String(payload.resultCode ?? ''),
    transId: String(payload.transId ?? ''),
  });
  const expected = signMomo(raw, config.secretKey);
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export interface MomoCreateInput {
  orderId: string;
  requestId: string;
  amountVnd: number;
  orderInfo: string;
}

/** Gọi API tạo giao dịch Momo (môi trường sandbox/production theo MOMO_API_URL). */
export async function createMomoPayment(
  config: MomoConfig,
  input: MomoCreateInput,
): Promise<{ payUrl: string; deeplink?: string; qrCodeUrl?: string; raw: unknown }> {
  const extraData = '';
  const requestType = 'captureWallet';
  const rawSignature = [
    `accessKey=${config.accessKey}`,
    `amount=${Math.round(input.amountVnd)}`,
    `extraData=${extraData}`,
    `ipnUrl=${config.returnUrl}`,
    `orderId=${input.orderId}`,
    `orderInfo=${input.orderInfo}`,
    `partnerCode=${config.partnerCode}`,
    `redirectUrl=${config.returnUrl}`,
    `requestId=${input.requestId}`,
    `requestType=${requestType}`,
  ].join('&');

  const body = {
    partnerCode: config.partnerCode,
    partnerName: 'Booking Spa',
    storeId: 'BookingSpaOnline',
    requestId: input.requestId,
    amount: Math.round(input.amountVnd),
    orderId: input.orderId,
    orderInfo: input.orderInfo,
    redirectUrl: config.returnUrl,
    ipnUrl: config.returnUrl,
    lang: 'vi',
    requestType,
    autoCapture: true,
    extraData,
    signature: signMomo(rawSignature, config.secretKey),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const payUrl = typeof payload.payUrl === 'string' ? payload.payUrl : '';
    if (!response.ok || !payUrl) {
      throw new Error(`Momo trả về lỗi (${response.status}): ${String(payload.message ?? 'không có payUrl')}`);
    }
    return {
      payUrl,
      deeplink: typeof payload.deeplink === 'string' ? payload.deeplink : undefined,
      qrCodeUrl: typeof payload.qrCodeUrl === 'string' ? payload.qrCodeUrl : undefined,
      raw: payload,
    };
  } finally {
    clearTimeout(timeout);
  }
}
