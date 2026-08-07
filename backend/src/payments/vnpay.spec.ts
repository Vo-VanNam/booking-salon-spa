import { vnpayBuildUrl, vnpaySignParams, vnpayVerify } from './vnpay';

// Vector độc lập: tính bằng node -e với node:crypto (KHÔNG dùng util đang test).
// params gốc: { vnp_TmnCode: 'TESTTMN', vnp_Amount: '100', vnp_SecureHash: 'stale' }
// → query sau khi sort + loại vnp_SecureHash: "vnp_Amount=100&vnp_TmnCode=TESTTMN"
const VECTOR_SECRET = 'vnpay-secret';
const VECTOR_QUERY = 'vnp_Amount=100&vnp_TmnCode=TESTTMN';
const VECTOR_HASH =
  'e8327408e0c0e38c70aef5ebd8f694f1074011e85b1eceec5f2b8555dbffd5961cd252533ffcd27844783b1ef58a4d2053689b45b18e544c9f78b11ee69772f2';

describe('vnpay', () => {
  it('signParams: sắp xếp key alphabet + loại vnp_SecureHash (khớp vector độc lập)', () => {
    const params = {
      vnp_TmnCode: 'TESTTMN',
      vnp_Amount: '100',
      vnp_SecureHash: 'stale',
    };
    expect(vnpaySignParams(params, VECTOR_SECRET)).toBe(VECTOR_HASH);
  });

  it('buildUrl: query đã sort, thêm vnp_SecureHash vào cuối', () => {
    const url = vnpayBuildUrl(
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      { vnp_TmnCode: 'TESTTMN', vnp_Amount: '100' },
      VECTOR_SECRET,
    );
    expect(url).toBe(
      `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?${VECTOR_QUERY}&vnp_SecureHash=${VECTOR_HASH}`,
    );
  });

  it('verify: chữ ký đúng → true; sửa param → false; thiếu vnp_SecureHash → false', () => {
    const params = {
      vnp_Amount: '100',
      vnp_TmnCode: 'TESTTMN',
      vnp_SecureHash: VECTOR_HASH,
    };
    expect(vnpayVerify(params, VECTOR_SECRET)).toBe(true);
    expect(vnpayVerify({ ...params, vnp_Amount: '200' }, VECTOR_SECRET)).toBe(
      false,
    );
    const noHash: Record<string, string> = { ...params };
    delete noHash['vnp_SecureHash'];
    expect(vnpayVerify(noHash, VECTOR_SECRET)).toBe(false);
  });
});
