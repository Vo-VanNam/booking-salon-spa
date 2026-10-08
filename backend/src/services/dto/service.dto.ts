import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ToBoolean, ToNumber } from '../../common/transforms';

export class CreateServiceDto {
  @IsString({ message: 'Chi nhánh không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng chọn chi nhánh.' })
  branch_id!: string;

  @IsString({ message: 'Tên dịch vụ không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên dịch vụ.' })
  @MaxLength(150, { message: 'Tên dịch vụ quá dài.' })
  name!: string;

  @IsOptional()
  @IsString({ message: 'Mô tả không hợp lệ.' })
  @MaxLength(1000, { message: 'Mô tả quá dài.' })
  description?: string;

  @ToNumber()
  @IsInt({ message: 'Giá dịch vụ phải là số nguyên VND.' })
  @Min(0, { message: 'Giá dịch vụ không được âm.' })
  @Max(1_000_000_000, { message: 'Giá dịch vụ quá lớn.' })
  price!: number;

  @IsOptional()
  @ToNumber()
  @IsInt({ message: 'Thời lượng phải là số phút nguyên.' })
  @Min(5, { message: 'Thời lượng tối thiểu 5 phút.' })
  @Max(600, { message: 'Thời lượng tối đa 600 phút.' })
  duration_minutes?: number;

  /** Alias tương thích ngược với client cũ. */
  @IsOptional()
  @ToNumber()
  @IsInt({ message: 'Thời lượng phải là số phút nguyên.' })
  @Min(5, { message: 'Thời lượng tối thiểu 5 phút.' })
  duration?: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'Trạng thái hoạt động không hợp lệ.' })
  is_active?: boolean;
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString({ message: 'Chi nhánh không hợp lệ.' })
  branch_id?: string;

  @IsOptional()
  @IsString({ message: 'Tên dịch vụ không hợp lệ.' })
  @MaxLength(150, { message: 'Tên dịch vụ quá dài.' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Mô tả không hợp lệ.' })
  @MaxLength(1000, { message: 'Mô tả quá dài.' })
  description?: string;

  @IsOptional()
  @ToNumber()
  @IsInt({ message: 'Giá dịch vụ phải là số nguyên VND.' })
  @Min(0, { message: 'Giá dịch vụ không được âm.' })
  @Max(1_000_000_000, { message: 'Giá dịch vụ quá lớn.' })
  price?: number;

  @IsOptional()
  @ToNumber()
  @IsInt({ message: 'Thời lượng phải là số phút nguyên.' })
  @Min(5, { message: 'Thời lượng tối thiểu 5 phút.' })
  @Max(600, { message: 'Thời lượng tối đa 600 phút.' })
  duration_minutes?: number;

  @IsOptional()
  @ToNumber()
  @IsInt({ message: 'Thời lượng phải là số phút nguyên.' })
  @Min(5, { message: 'Thời lượng tối thiểu 5 phút.' })
  duration?: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean({ message: 'Trạng thái hoạt động không hợp lệ.' })
  is_active?: boolean;
}
