import { buildCanonicalString, buildVnpayPaymentUrl, signVnpay, verifyVnpaySignature } from './vnpay.adapter';

/**
 * Test chữ ký VNPay (vector HMAC tính độc lập bằng Node crypto trước khi viết test).
 * secret = TEST_SECRET_123
 */
describe('VNPay adapter — chữ ký webhook (HMAC-SHA512, hex thường, field sắp xếp theo key)', () => {
  const secret = 'TEST_SECRET_123';

  it('canonical string sắp xếp key tăng dần, nối bằng &', () => {
    expect(
      buildCanonicalString({ vnp_TxnRef: 'branch-1', vnp_Amount: '54000', vnp_ResponseCode: '00' }, []),
    ).toBe('vnp_Amount=54000&vnp_ResponseCode=00&vnp_TxnRef=branch-1');
  });

  it('khớp vector đã tính trước (lowercase hex, SHA512)', () => {
    const params = {
      vnp_TxnRef: 'branch-1',
      vnp_Amount: '54000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    };
    expect(signVnpay(params, secret, [])).toBe(
      'f4b4fa73fd780c627e94d54a2f558402ad8691d0a7fac9146e7b932d32b0ffafc027d8df9905942ecc07a98dc0d3cb8f14eafd907734750c4a88c57145357915',
    );
  });

  it('xác thực callback hợp lệ (bỏ vnp_SecureHash khi ký)', () => {
    const params = {
      vnp_TxnRef: 'branch-1',
      vnp_Amount: '54000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    };
    const signed = { ...params, vnp_SecureHash: signVnpay(params, secret) };
    expect(verifyVnpaySignature(signed, secret)).toBe(true);
  });

  it('chấp nhận cả biến thể có vnp_SecureHashType (chuẩn VNPay cũng loại field này)', () => {
    const withHashType = { vnp_TxnRef: 'booking-xyz', vnp_Amount: '100000', vnp_SecureHashType: 'SHA512', vnp_ResponseCode: '00' };
    const expected =
      '0b3c32adfe5fb4d4213de447976c3a7981b1f8ea590cededea4689e0b12a740df9469fd30ec45a020676976e6bb5d52424c453d6a4e0d4feb70f53d376c11b7e';
    const signed = { ...withHashType, vnp_SecureHash: expected };
    expect(verifyVnpaySignature(signed, secret)).toBe(true);
  });

  it('từ chối chữ ký sai, thiếu hoặc sai định dạng', () => {
    const params = { vnp_TxnRef: 'branch-1', vnp_Amount: '54000' };
    expect(verifyVnpaySignature({ ...params, vnp_SecureHash: 'a'.repeat(128) }, secret)).toBe(false);
    expect(verifyVnpaySignature(params, secret)).toBe(false);
    expect(verifyVnpaySignature({ ...params, vnp_SecureHash: 'not-hex' }, secret)).toBe(false);
    // đổi số tiền sau khi ký → chữ ký không còn hợp lệ
    const signed = { ...params, vnp_SecureHash: signVnpay(params, secret) };
    expect(verifyVnpaySignature({ ...signed, vnp_Amount: '999999' }, secret)).toBe(false);
  });

  it('payment URL chứa chữ ký và amount nguyên VND (không nhân 100)', () => {
    const url = buildVnpayPaymentUrl(
      { tmnCode: 'TESTTMN', hashSecret: secret, payUrl: 'https://sandbox.vnpayment.vn/pay', apiUrl: '', returnUrl: 'http://localhost:8101/booking' },
      { amountVnd: 54_000, txnRef: 'booking-1', orderInfo: 'Dat coc', ipAddr: '127.0.0.1' },
    );
    expect(url).toContain('https://sandbox.vnpayment.vn/pay?');
    expect(url).toContain('vnp_Amount=54000');
    expect(url).toContain('vnp_TxnRef=booking-1');
    expect(url).toMatch(/vnp_SecureHash=[0-9a-f]{128}$/);
  });
});
