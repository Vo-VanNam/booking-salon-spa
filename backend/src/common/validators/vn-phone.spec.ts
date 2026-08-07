import { isValidVnPhone } from './vn-phone';

describe('isValidVnPhone', () => {
  it.each(['0901234567', '0371234567', '0912345678', '0999999999'])(
    'chấp nhận số hợp lệ %s',
    (phone) => {
      expect(isValidVnPhone(phone)).toBe(true);
    },
  );

  it.each([
    '090123456', // 9 chữ số
    '09012345678', // 11 chữ số
    '0201234567', // đầu 02
    '0401234567', // đầu 04
    '090123456a', // chứa chữ
    '090 1234567', // có dấu cách
    '0901-234567', // có dấu gạch
    '+84901234567', // +84
    '', // rỗng
    null,
  ])('từ chối số không hợp lệ %s', (phone) => {
    expect(isValidVnPhone(phone as unknown as string)).toBe(false);
  });
});
