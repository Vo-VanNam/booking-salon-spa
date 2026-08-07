import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateBookingDto {
  @IsString({ message: 'Phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Thiếu chi nhánh' })
  branchId: string;

  @IsString({ message: 'Phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Thiếu dịch vụ' })
  serviceId: string;

  @IsString({ message: 'Phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Thiếu stylist' })
  stylistId: string;

  @IsISO8601({}, { message: 'Thời gian bắt đầu không đúng định dạng ISO 8601' })
  @IsNotEmpty({ message: 'Thiếu thời gian bắt đầu' })
  startTime: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}
