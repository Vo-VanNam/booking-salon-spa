// Quyết định: chỉ chấp nhận dạng 0xxxxxxxxx (10 chữ số, bắt đầu 03/05/07/08/09).
// Không hỗ trợ +84 (khách nhập +84 sẽ bị từ chối — ghi chú cho task 8: nếu cần
// hỗ trợ +84, hãy normalize trước khi gọi hàm này). Không cho phép dấu cách/gạch.
const VN_PHONE_REGEX = /^(03|05|07|08|09)\d{8}$/;

export function isValidVnPhone(phone: string): boolean {
  if (typeof phone !== 'string') {
    return false;
  }
  return VN_PHONE_REGEX.test(phone);
}
