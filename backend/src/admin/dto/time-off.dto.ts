import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTimeOffDto {
  @IsISO8601({}, { message: 'Định dạng ngày giờ không hợp lệ' })
  startTime: string;

  @IsISO8601({}, { message: 'Định dạng ngày giờ không hợp lệ' })
  endTime: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
