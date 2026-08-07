import { IsOptional } from 'class-validator';

// Query chung cho GET /admin/calendar và GET /admin/revenue. Mọi giá trị được
// validate trong service (lỗi tiếng Việt nhất quán với các endpoint admin khác).
export class CalendarQueryDto {
  @IsOptional()
  branchId?: string;

  @IsOptional()
  from?: string;

  @IsOptional()
  to?: string;

  @IsOptional()
  stylistId?: string;

  @IsOptional()
  groupBy?: string;
}
