import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

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
}
