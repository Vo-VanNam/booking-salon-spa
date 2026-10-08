import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class AdminRangeQueryDto {
  @IsOptional()
  @IsString({ message: 'Chi nhánh không hợp lệ.' })
  branch_id?: string;

  /** Ngày (YYYY-MM-DD, giờ VN) hoặc ISO 8601. */
  @IsOptional()
  @IsString({ message: 'Tham số from không hợp lệ.' })
  @MaxLength(40, { message: 'Tham số from quá dài.' })
  from?: string;

  @IsOptional()
  @IsString({ message: 'Tham số to không hợp lệ.' })
  @MaxLength(40, { message: 'Tham số to quá dài.' })
  to?: string;

  @IsOptional()
  @IsString({ message: 'Trạng thái không hợp lệ.' })
  @MaxLength(120, { message: 'Danh sách trạng thái quá dài.' })
  status?: string;

  @IsOptional()
  @IsString({ message: 'Tham số date không hợp lệ.' })
  @MaxLength(40, { message: 'Tham số date quá dài.' })
  date?: string;
}

export class CreateTimeOffAdminDto {
  @IsString({ message: 'Thời gian bắt đầu không hợp lệ.' })
  @IsNotEmpty({ message: 'Thiếu thời gian bắt đầu.' })
  start_time!: string;

  @IsString({ message: 'Thời gian kết thúc không hợp lệ.' })
  @IsNotEmpty({ message: 'Thiếu thời gian kết thúc.' })
  end_time!: string;
}

export class UpdateBookingStatusDto {
  /** Chỉ ba trạng thái hợp lệ — mọi giá trị khác bị từ chối ngay ở tầng validate. */
  @IsIn(['completed', 'cancelled', 'no_show'], { message: 'Trạng thái không hợp lệ.' })
  status!: 'completed' | 'cancelled' | 'no_show';
}

export class MonthQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'Tham số month phải theo định dạng YYYY-MM.' })
  month?: string;
}
