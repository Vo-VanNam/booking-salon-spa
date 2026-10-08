import { BadRequestException, ValidationError } from '@nestjs/common';

function collectMessages(errors: ValidationError[], out: string[] = []): string[] {
  for (const error of errors) {
    if (error.constraints) out.push(...Object.values(error.constraints));
    if (error.children && error.children.length > 0) collectMessages(error.children, out);
  }
  return out;
}

/** ValidationPipe dùng chung: message lỗi tiếng Việt, kèm danh sách chi tiết để client hiển thị. */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const messages = collectMessages(errors);
  const primary = messages[0] ?? 'Dữ liệu gửi lên không hợp lệ.';
  return new BadRequestException({
    statusCode: 400,
    message: primary,
    code: 'VALIDATION_ERROR',
    details: messages,
  });
}
