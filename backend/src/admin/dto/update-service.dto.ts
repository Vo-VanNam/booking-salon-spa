import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1000, { message: 'Giá không hợp lệ' })
  @Max(50_000_000, { message: 'Giá không hợp lệ' })
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(5, { message: 'Thời lượng không hợp lệ (5-480 phút)' })
  @Max(480, { message: 'Thời lượng không hợp lệ (5-480 phút)' })
  durationMinutes?: number;
}
