import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
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
  ValidateIf,
} from 'class-validator';

import { BudgetPeriod } from 'src/database/enums/budget-period.enum';
import { BudgetScopeType } from '../../../../generated/prisma/client.js';

const budgetScopeTypeEnum = BudgetScopeType as Record<string, string>;

export class UpdateBudgetDto {
  @ApiPropertyOptional({
    description: 'Budget name',
    example: 'Updated Food Budget',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Monthly allocation amount',
    example: '2000000',
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
    description: 'First day of the target allocation month',
    example: '2026-11-01',
  })
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-01$/, {
    message: 'periodStart must be the first day of a month (YYYY-MM-01)',
  })
  periodStart?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  applyToFuture?: boolean;

  @ApiPropertyOptional({
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
    enum: BudgetPeriod,
  })
  @IsOptional()
  @IsEnum(BudgetPeriod)
  period?: BudgetPeriod;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Send null to remove the end date.',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({
    enum: BudgetScopeType as unknown as object,
    description: 'New budget scope type',
  })
  @IsOptional()
  @IsEnum(budgetScopeTypeEnum)
  scopeType?: BudgetScopeType;

  @ApiPropertyOptional({
    description:
      'Category ID for CATEGORY or CATEGORY_GROUP. Send null to clear it.',
    nullable: true,
  })
  @ValidateIf(
    (dto: UpdateBudgetDto) =>
      dto.scopeCategoryId !== undefined && dto.scopeCategoryId !== null,
  )
  @IsUUID('4')
  scopeCategoryId?: string | null;

  @ApiPropertyOptional({
    description: 'Category IDs for CUSTOM scope',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({
    description:
      'Legacy category field. Send null to remove the category association.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf(
    (dto: UpdateBudgetDto) =>
      dto.categoryId !== undefined && dto.categoryId !== null,
  )
  @IsUUID('4')
  categoryId?: string | null;
}
