import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateBudgetDto {
  @ApiProperty({
    description: 'Budget name',
    example: 'Monthly Food Budget',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({
    description:
      'Budget amount in IDR. Maximum 4 decimal places are supported.',
    example: '1500000',
    pattern: '^\\d+(\\.\\d{1,4})?$',
  })
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
  amount!: string;

  @ApiProperty({
    description: 'Budget period',
    enum: BudgetPeriod,
    example: BudgetPeriod.MONTHLY,
  })
  @IsEnum(BudgetPeriod)
  period!: BudgetPeriod;

  @ApiProperty({
    description: 'Budget start date in ISO 8601 date format',
    example: '2026-09-01',
  })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({
    description: 'Optional budget end date in ISO 8601 date format',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Optional category UUID associated with the budget',
    example: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
  })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;
}
