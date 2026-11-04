import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, Matches } from 'class-validator';

import { BudgetStatus } from 'src/database/enums/budget-status.enum';

export class GetBudgetsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter budgets by budget status',
    enum: BudgetStatus,
    example: BudgetStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(BudgetStatus)
  status?: BudgetStatus;

  @ApiPropertyOptional({
    description:
      'Return the monthly allocation for this month. Must be YYYY-MM-01.',
    example: '2026-11-01',
  })
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-01$/, {
    message: 'month must be the first day of a month (YYYY-MM-01)',
  })
  month?: string;
}
