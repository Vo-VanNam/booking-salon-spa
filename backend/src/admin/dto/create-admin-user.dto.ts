import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateAdminUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;

  @IsIn([UserRole.stylist, UserRole.branch_admin])
  role: UserRole;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  stylistId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  branchId?: string;
}
