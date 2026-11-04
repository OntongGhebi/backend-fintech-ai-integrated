import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsDecimal,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { BudgetPeriod } from 'src/database/enums/budget-period.enum';

export class UpdateBudgetDto {
  @ApiPropertyOptional({
    description: 'Budget name',
    example: 'Monthly Food Budget Updated',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Monthly allocation amount in IDR. Requires periodStart. Maximum 4 decimal places.',
    example: '2000000',
    pattern: '^(?=.*[1-9])\\d+(\\.\\d{1,4})?$',
  })
  @IsOptional()
  @IsDecimal(
    {
      decimal_digits: '0,4',
      force_decimal: false,
      locale: 'en-US',
    },
    {
      message: 'amount must be a valid decimal with up to 4 decimal places',
    },
  )
  @Matches(/^(?=.*[1-9])\d+(\.\d{1,4})?$/, {
    message: 'amount must be greater than zero and have up to 4 decimal places',
  })
  amount?: string;

  @ApiPropertyOptional({
    description:
      'First day of the target allocation month (YYYY-MM-01). Required when amount is provided.',
    example: '2026-11-01',
    pattern: '^\\d{4}-\\d{2}-01$',
  })
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-01$/, {
    message: 'periodStart must be the first day of a month (YYYY-MM-01)',
  })
  periodStart?: string;

  @ApiPropertyOptional({
    description:
      'When true, apply the amount to the selected month and following months.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  applyToFuture?: boolean;

  @ApiPropertyOptional({
    description:
      'Number of months to update, including periodStart. Allowed from 1 to 24; defaults to 12 when applyToFuture is true.',
    minimum: 1,
    maximum: 24,
    default: 12,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  futureMonths?: number;

  @ApiPropertyOptional({
    description: 'Budget period',
    enum: BudgetPeriod,
    example: BudgetPeriod.MONTHLY,
  })
  @IsOptional()
  @IsEnum(BudgetPeriod)
  period?: BudgetPeriod;

  @ApiPropertyOptional({
    description: 'Budget start date in ISO 8601 date format',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'Budget end date in ISO 8601 date format. Send null to remove the end date.',
    example: '2026-12-31',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({
    description: 'Category UUID. Send null to remove the category association.',
    example: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string | null;
}
