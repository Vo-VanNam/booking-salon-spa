import { PaymentProvider } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class DepositDto {
  @IsEnum(PaymentProvider)
  provider: PaymentProvider;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;
}
