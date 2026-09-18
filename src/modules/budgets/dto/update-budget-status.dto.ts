import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { BudgetStatus } from 'src/database/enums/budget-status.enum';
export class UpdateBudgetStatusDto {
  @ApiProperty({
    description: 'New status for the budget',
    enum: BudgetStatus,
    example: BudgetStatus.PAUSED,
  })
  @IsEnum(BudgetStatus)
  status!: BudgetStatus;
}
