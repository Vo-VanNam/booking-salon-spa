import { BusinessRuleException } from './business-rule.exception';

export class BookingConflictException extends BusinessRuleException {
  constructor(message = 'Khung giờ này đã có lịch hẹn') {
    super(message);
  }
}
