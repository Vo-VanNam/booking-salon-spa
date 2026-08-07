import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class WorkingHourItemDto {
  @IsInt({ message: 'Ngày trong tuần không hợp lệ' })
  @Min(0, { message: 'Ngày trong tuần không hợp lệ' })
  @Max(6, { message: 'Ngày trong tuần không hợp lệ' })
  dayOfWeek: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Giờ không hợp lệ (định dạng HH:mm)',
  })
  startTime: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Giờ không hợp lệ (định dạng HH:mm)',
  })
  endTime: string;
}

export class WorkingHoursDto {
  @IsArray({ message: 'Danh sách giờ làm việc không hợp lệ' })
  @ValidateNested({ each: true })
  @Type(() => WorkingHourItemDto)
  workingHours: WorkingHourItemDto[];
}
