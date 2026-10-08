import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ToBoolean, ToNumber } from '../../common/transforms';

const HM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateStylistDto {
  @IsString({ message: 'Chi nhánh không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng chọn chi nhánh.' })
  branch_id!: string;

  @IsString({ message: 'Tên stylist không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên stylist.' })
  @MaxLength(150, { message: 'Tên stylist quá dài.' })
  name!: string;

  @IsOptional()
  @IsString({ message: 'Số điện thoại không hợp lệ.' })
  @MaxLength(15, { message: 'Số điện thoại quá dài.' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @MaxLength(200, { message: 'Email quá dài.' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'Giới thiệu không hợp lệ.' })
  @MaxLength(1000, { message: 'Giới thiệu quá dài.' })
  bio?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'Trạng thái hoạt động không hợp lệ.' })
  is_active?: boolean;
}

export class UpdateStylistDto {
  @IsOptional()
  @IsString({ message: 'Chi nhánh không hợp lệ.' })
  branch_id?: string;

  @IsOptional()
  @IsString({ message: 'Tên stylist không hợp lệ.' })
  @MaxLength(150, { message: 'Tên stylist quá dài.' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Số điện thoại không hợp lệ.' })
  @MaxLength(15, { message: 'Số điện thoại quá dài.' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'Giới thiệu không hợp lệ.' })
  @MaxLength(1000, { message: 'Giới thiệu quá dài.' })
  bio?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'Trạng thái hoạt động không hợp lệ.' })
  is_active?: boolean;
}

export class WorkingHourItemDto {
  @ToNumber()
  @IsInt({ message: 'Thứ trong tuần không hợp lệ.' })
  @Min(0, { message: 'Thứ trong tuần từ 0 (Chủ nhật) đến 6 (Thứ bảy).' })
  @Max(6, { message: 'Thứ trong tuần từ 0 (Chủ nhật) đến 6 (Thứ bảy).' })
  day_of_week!: number;

  @Matches(HM_PATTERN, { message: 'Giờ bắt đầu phải theo định dạng HH:mm.' })
  start_time!: string;

  @Matches(HM_PATTERN, { message: 'Giờ kết thúc phải theo định dạng HH:mm.' })
  end_time!: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'Trạng thái không hợp lệ.' })
  is_active?: boolean;
}

export class SetWorkingHoursDto {
  @IsArray({ message: 'Danh sách giờ làm việc không hợp lệ.' })
  @ArrayMaxSize(50, { message: 'Quá nhiều khung giờ làm việc.' })
  @ValidateNested({ each: true })
  @Type(() => WorkingHourItemDto)
  working_hours!: WorkingHourItemDto[];
}

export class TimeOffDto {
  @IsString({ message: 'Thời gian bắt đầu không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng chọn thời gian bắt đầu nghỉ.' })
  start_time!: string;

  @IsString({ message: 'Thời gian kết thúc không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng chọn thời gian kết thúc nghỉ.' })
  end_time!: string;

  @IsOptional()
  @IsString({ message: 'Lý do không hợp lệ.' })
  @MaxLength(255, { message: 'Lý do quá dài.' })
  reason?: string;
}
