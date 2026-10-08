import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const HM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateBranchDto {
  @IsString({ message: 'Tên chi nhánh không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên chi nhánh.' })
  @MaxLength(150, { message: 'Tên chi nhánh quá dài.' })
  name!: string;

  @IsString({ message: 'Địa chỉ không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập địa chỉ chi nhánh.' })
  @MaxLength(255, { message: 'Địa chỉ quá dài.' })
  address!: string;

  @IsOptional()
  @Matches(HM_PATTERN, { message: 'Giờ mở cửa phải theo định dạng HH:mm.' })
  open_time?: string;

  @IsOptional()
  @Matches(HM_PATTERN, { message: 'Giờ đóng cửa phải theo định dạng HH:mm.' })
  close_time?: string;

  @IsOptional()
  @IsBoolean({ message: 'Trạng thái hoạt động không hợp lệ.' })
  is_active?: boolean;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString({ message: 'Tên chi nhánh không hợp lệ.' })
  @MaxLength(150, { message: 'Tên chi nhánh quá dài.' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Địa chỉ không hợp lệ.' })
  @MaxLength(255, { message: 'Địa chỉ quá dài.' })
  address?: string;

  @IsOptional()
  @Matches(HM_PATTERN, { message: 'Giờ mở cửa phải theo định dạng HH:mm.' })
  open_time?: string;

  @IsOptional()
  @Matches(HM_PATTERN, { message: 'Giờ đóng cửa phải theo định dạng HH:mm.' })
  close_time?: string;

  @IsOptional()
  @IsBoolean({ message: 'Trạng thái hoạt động không hợp lệ.' })
  is_active?: boolean;
}
