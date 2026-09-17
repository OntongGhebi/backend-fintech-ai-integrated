import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsDecimal,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
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
      'Budget amount in IDR. Maximum 4 decimal places are supported.',
    example: '2000000',
    pattern: '^\\d+(\\.\\d{1,4})?$',
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
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'amount must be a positive decimal with up to 4 decimal places',
  })
  amount?: string;

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
    example: '2026-09-30',
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
