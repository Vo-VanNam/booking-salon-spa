import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessRuleException extends HttpException {
  constructor(message: string, statusCode: HttpStatus = HttpStatus.CONFLICT) {
    super(message, statusCode);
  }
}
