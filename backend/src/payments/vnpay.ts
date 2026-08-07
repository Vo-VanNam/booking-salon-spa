import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PARAMS = ['vnp_SecureHash', 'vnp_SecureHashType'];

// Chữ ký VNPay: HMAC-SHA512 trên query string gồm mọi param TRỪ
// vnp_SecureHash/vnp_SecureHashType, key sắp xếp alphabet, mỗi value
// encodeURIComponent, nối bằng '&'. Dùng chung cho cả build URL và verify IPN.
function buildRawQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => !SIGNATURE_PARAMS.includes(key))
    .sort()
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');
}

export function vnpaySignParams(
  params: Record<string, string>,
  secret: string,
): string {
  return createHmac('sha512', secret)
    .update(buildRawQuery(params))
    .digest('hex');
}

export function vnpayBuildUrl(
  baseUrl: string,
  params: Record<string, string>,
  secret: string,
): string {
  const query = buildRawQuery(params);
  const hash = createHmac('sha512', secret).update(query).digest('hex');
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}${query}&vnp_SecureHash=${hash}`;
}

export function vnpayVerify(
  params: Record<string, string>,
  secret: string,
): boolean {
  const received = params['vnp_SecureHash'];
  if (!received) return false;
  const expected = vnpaySignParams(params, secret);
  const receivedBuf = Buffer.from(received, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (receivedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(receivedBuf, expectedBuf);
}
