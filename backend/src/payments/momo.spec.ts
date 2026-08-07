import {
  MOMO_CREATE_FIELD_ORDER,
  MOMO_IPN_FIELD_ORDER,
  momoCreateSignature,
  momoIpnSignature,
  momoVerifyIpn,
} from './momo';

// Vector độc lập: tính bằng node -e với node:crypto (KHÔNG dùng util đang test).
const SECRET = 'SECRET';

// Create signature: raw string theo MOMO_CREATE_FIELD_ORDER:
// accessKey=AK&amount=150000&extraData=&ipnUrl=http://ipn&orderId=ORD1&orderInfo=Test
// &partnerCode=PC&redirectUrl=http://ret&requestId=REQ1&requestType=captureWallet
const CREATE_DATA = {
  accessKey: 'AK',
  amount: 150000,
  extraData: '',
  ipnUrl: 'http://ipn',
  orderId: 'ORD1',
  orderInfo: 'Test',
  partnerCode: 'PC',
  redirectUrl: 'http://ret',
  requestId: 'REQ1',
  requestType: 'captureWallet',
};
const CREATE_HASH =
  '5f3a6b8eb492c11bc0ba0cbfb87f1a4c0f645b399444008e05cf2c7bb9a9ba92';

// IPN signature: raw string theo MOMO_IPN_FIELD_ORDER:
// accessKey=AK&amount=150000&extraData=&message=Successful.&orderId=ORD1&orderInfo=Test
// &orderType=momo_wallet&partnerCode=PC&payType=wallet&requestId=REQ1
// &responseTime=1234567890&resultCode=0&transId=12345
const IPN_DATA = {
  accessKey: 'AK',
  amount: 150000,
  extraData: '',
  message: 'Successful.',
  orderId: 'ORD1',
  orderInfo: 'Test',
  orderType: 'momo_wallet',
  partnerCode: 'PC',
  payType: 'wallet',
  requestId: 'REQ1',
  responseTime: 1234567890,
  resultCode: 0,
  transId: 12345,
};
const IPN_HASH =
  '24c6277b73d226a28a6636108809eda2bd282c4ef754d5b348630b7d18fb6e00';

describe('momo', () => {
  it('thứ tự field create/IPN cố định theo template MoMo', () => {
    expect(MOMO_CREATE_FIELD_ORDER).toEqual([
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
    ]);
    expect(MOMO_IPN_FIELD_ORDER).toEqual([
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
    ]);
  });

  it('create signature khớp vector độc lập (HMAC-SHA256 hex lowercase)', () => {
    expect(momoCreateSignature(CREATE_DATA, SECRET)).toBe(CREATE_HASH);
  });

  it('ipn signature khớp vector độc lập', () => {
    expect(momoIpnSignature(IPN_DATA, SECRET)).toBe(IPN_HASH);
  });

  it('verifyIpn: đúng → true; sửa amount → false; thiếu signature → false', () => {
    // Body IPN KHÔNG chứa accessKey — verify lấy accessKey từ tham số riêng
    const { accessKey, ...ipnBody } = IPN_DATA;
    const body = { ...ipnBody, signature: IPN_HASH };
    expect(momoVerifyIpn(body, SECRET, accessKey)).toBe(true);

    expect(momoVerifyIpn({ ...body, amount: 999 }, SECRET, accessKey)).toBe(
      false,
    );

    const noSignature: Record<string, string | number> = { ...body };
    delete noSignature['signature'];
    expect(momoVerifyIpn(noSignature, SECRET, accessKey)).toBe(false);
  });
});
