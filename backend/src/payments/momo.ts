import { createHmac, timingSafeEqual } from 'node:crypto';

// Thứ tự field BẮT BUỘC của MoMo khi tạo chữ ký create (không được đổi)
export const MOMO_CREATE_FIELD_ORDER = [
  'accessKey',
  'amount',
  'extraData',
  'ipnUrl',
  'orderId',
  'orderInfo',
  'partnerCode',
  'redirectUrl',
  'requestId',
  'requestType',
] as const;

// Thứ tự field BẮT BUỘC của MoMo khi xác thực IPN (không được đổi)
export const MOMO_IPN_FIELD_ORDER = [
  'accessKey',
  'amount',
  'extraData',
  'message',
  'orderId',
  'orderInfo',
  'orderType',
  'partnerCode',
  'payType',
  'requestId',
  'responseTime',
  'resultCode',
  'transId',
] as const;

type MomoFieldMap = Record<string, string | number>;

function rawString(data: MomoFieldMap, fieldOrder: readonly string[]): string {
  return fieldOrder.map((field) => `${field}=${data[field] ?? ''}`).join('&');
}

export function momoCreateSignature(
  data: MomoFieldMap,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(rawString(data, MOMO_CREATE_FIELD_ORDER))
    .digest('hex');
}

export function momoIpnSignature(data: MomoFieldMap, secret: string): string {
  return createHmac('sha256', secret)
    .update(rawString(data, MOMO_IPN_FIELD_ORDER))
    .digest('hex');
}

// accessKey KHÔNG có trong body IPN — phải truyền từ env riêng
export function momoVerifyIpn(
  data: MomoFieldMap,
  secret: string,
  accessKey: string,
): boolean {
  const received = data['signature'];
  if (typeof received !== 'string' || received.length === 0) return false;
  const expected = momoIpnSignature({ ...data, accessKey }, secret);
  const receivedBuf = Buffer.from(received, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (receivedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(receivedBuf, expectedBuf);
}
