import { IsISO8601, IsNotEmpty } from 'class-validator';

export class RescheduleBookingDto {
  @IsISO8601({}, { message: 'Thời gian không hợp lệ' })
  @IsNotEmpty({ message: 'Thiếu thời gian bắt đầu' })
  startTime: string;
}
