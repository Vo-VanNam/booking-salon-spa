import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class SlotQueryDto {
  @IsString({ message: 'Chi nhánh không hợp lệ.' })
  @IsNotEmpty({ message: 'Thiếu tham số branch_id.' })
  branch_id!: string;

  @IsString({ message: 'Stylist không hợp lệ.' })
  @IsNotEmpty({ message: 'Thiếu tham số stylist_id.' })
  stylist_id!: string;

  @IsString({ message: 'Dịch vụ không hợp lệ.' })
  @IsNotEmpty({ message: 'Thiếu tham số service_id.' })
  service_id!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày không hợp lệ, cần theo định dạng YYYY-MM-DD.' })
  date!: string;
}
