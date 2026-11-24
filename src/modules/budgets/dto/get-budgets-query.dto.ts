import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, Matches } from 'class-validator';

import { BudgetStatus } from 'src/database/enums/budget-status.enum';

export class GetBudgetsQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter budgets by lifecycle status. Omit this parameter to retrieve all non-archived budgets.',
    enum: BudgetStatus,
    example: BudgetStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(BudgetStatus)
  status?: BudgetStatus;

  @ApiPropertyOptional({
    description:
      'Select the monthly budget allocation to include in the response. Must be the first calendar day of the selected month in YYYY-MM-01 format. Omit to retrieve the available allocation history.',
    example: '2026-11-01',
    pattern: '^\\d{4}-\\d{2}-01$',
  })
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-01$/, {
    message: 'month must be the first day of a month (YYYY-MM-01)',
  })
  month?: string;
}
