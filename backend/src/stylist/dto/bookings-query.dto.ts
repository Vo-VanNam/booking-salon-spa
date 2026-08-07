import { Matches } from 'class-validator';

export class BookingsQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày không hợp lệ' })
  from: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày không hợp lệ' })
  to: string;
}
