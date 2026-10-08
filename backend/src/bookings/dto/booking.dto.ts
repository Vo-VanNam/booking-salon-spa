import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' || value === null ? undefined : value);

export class CreateBookingDto {
  @IsString({ message: 'Chi nhánh không hợp lệ.' })
  @IsNotEmpty({ message: 'Thiếu tham số branch_id.' })
  branch_id!: string;

  @IsString({ message: 'Dịch vụ không hợp lệ.' })
  @IsNotEmpty({ message: 'Thiếu tham số service_id.' })
  service_id!: string;

  @IsString({ message: 'Stylist không hợp lệ.' })
  @IsNotEmpty({ message: 'Thiếu tham số stylist_id.' })
  stylist_id!: string;

  @IsString({ message: 'Thời gian bắt đầu không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng chọn thời gian bắt đầu.' })
  start_time!: string;

  @IsString({ message: 'Tên khách hàng không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên khách hàng.' })
  @MaxLength(150, { message: 'Tên khách hàng quá dài.' })
  customer_name!: string;

  @IsString({ message: 'Số điện thoại không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập số điện thoại.' })
  @MaxLength(20, { message: 'Số điện thoại quá dài.' })
  customer_phone!: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString({ message: 'Email không hợp lệ.' })
  @MaxLength(200, { message: 'Email quá dài.' })
  customer_email?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString({ message: 'Ghi chú không hợp lệ.' })
  @MaxLength(500, { message: 'Ghi chú quá dài.' })
  note?: string;

  /** web | ai | admin | phone — phục vụ thống kê nguồn đặt lịch. */
  @IsOptional()
  @IsString({ message: 'Nguồn đặt lịch không hợp lệ.' })
  @MaxLength(20, { message: 'Nguồn đặt lịch quá dài.' })
  source?: string;
}

export class RescheduleBookingDto {
  @IsString({ message: 'Thời gian bắt đầu không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng chọn thời gian bắt đầu mới.' })
  start_time!: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString({ message: 'Stylist không hợp lệ.' })
  stylist_id?: string;
}

export class CancelBookingDto {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString({ message: 'Lý do không hợp lệ.' })
  @MaxLength(255, { message: 'Lý do quá dài.' })
  reason?: string;
}
