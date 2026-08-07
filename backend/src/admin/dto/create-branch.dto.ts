import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Tên chi nhánh tối đa 100 ký tự' })
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255, { message: 'Địa chỉ tối đa 255 ký tự' })
  address: string;

  @IsOptional()
  @Matches(/^(03|05|07|08|09)\d{8}$/, {
    message: 'Số điện thoại không hợp lệ (yêu cầu 10 số, đầu 03/05/07/08/09)',
  })
  phone?: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Giờ không hợp lệ (định dạng HH:mm)',
  })
  openTime: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Giờ không hợp lệ (định dạng HH:mm)',
  })
  closeTime: string;
}
