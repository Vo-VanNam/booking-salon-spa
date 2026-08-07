import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelBookingDto {
  @IsOptional()
  @IsString({ message: 'Phải là chuỗi ký tự' })
  @MaxLength(200, { message: 'Lý do hủy tối đa 200 ký tự' })
  reason?: string;
}
