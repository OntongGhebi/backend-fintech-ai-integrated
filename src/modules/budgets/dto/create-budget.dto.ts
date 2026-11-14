import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsDecimal,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

import { BudgetPeriod } from 'src/database/enums/budget-period.enum';
import { BudgetScopeType } from '../../../../generated/prisma/client.js';

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
    description: 'Budget amount in IDR',
    example: '1500000',
    pattern: '^(?=.*[1-9])\\d+(\\.\\d{1,4})?$',
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
  @Matches(/^(?=.*[1-9])\d+(\.\d{1,4})?$/, {
    message: 'amount must be greater than zero and have up to 4 decimal places',
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
    description: 'Budget start date',
    example: '2026-09-01',
  })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({
    description: 'Optional budget end date',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Budget scope type',
    enum: BudgetScopeType as Record<string, string>,
    default: 'ALL_EXPENSES',
  })
  @IsOptional()
  @IsEnum(BudgetScopeType as object)
  scopeType?: BudgetScopeType;

  @ApiPropertyOptional({
    description:
      'Category ID for CATEGORY or CATEGORY_GROUP scope. For legacy requests, categoryId is also supported.',
    format: 'uuid',
  })
  @ValidateIf(
    (dto: CreateBudgetDto) =>
      dto.scopeCategoryId !== undefined && dto.scopeCategoryId !== null,
  )
  @IsUUID('4')
  scopeCategoryId?: string;

  @ApiPropertyOptional({
    description:
      'Category IDs for CUSTOM scope. Every category must be an active expense leaf category.',
    type: [String],
    example: ['2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({
    description:
      'Legacy category field. When supplied without scopeType, it creates a CATEGORY budget.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;
}
