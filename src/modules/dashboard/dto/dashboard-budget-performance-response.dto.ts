import { ApiProperty } from '@nestjs/swagger';

export class DashboardBudgetPerformanceItemDto {
  @ApiProperty({
    example: '11111111-1111-4111-8111-111111111111',
  })
  budgetId!: string;

  @ApiProperty({
    example: 'Food Budget',
  })
  budgetName!: string;

  @ApiProperty({
    example: '22222222-2222-4222-8222-222222222222',
    nullable: true,
  })
  categoryId!: string | null;

  @ApiProperty({
    example: 'Food',
  })
  categoryName!: string;

  @ApiProperty({
    example: 'ALL_EXPENSES',
    enum: ['ALL_EXPENSES', 'CATEGORY', 'CATEGORY_GROUP', 'CUSTOM'],
  })
  scopeType!: 'ALL_EXPENSES' | 'CATEGORY' | 'CATEGORY_GROUP' | 'CUSTOM';

  @ApiProperty({
    example: '3000000',
  })
  budgetAmount!: string;

  @ApiProperty({
    example: '2250000',
  })
  actualAmount!: string;

  @ApiProperty({
    example: '750000',
  })
  remainingAmount!: string;

  @ApiProperty({
    example: '75',
  })
  usagePercentage!: string;

  @ApiProperty({
    example: 12,
  })
  transactionCount!: number;

  @ApiProperty({
    example: 'ON_TRACK',
    enum: ['ON_TRACK', 'NEAR_LIMIT', 'OVER_BUDGET'],
  })
  status!: 'ON_TRACK' | 'NEAR_LIMIT' | 'OVER_BUDGET';
}

export class DashboardBudgetPerformanceResponseDto {
  @ApiProperty({
    example: 'IDR',
  })
  currency!: string;

  @ApiProperty({
    type: [DashboardBudgetPerformanceItemDto],
  })
  budgets!: DashboardBudgetPerformanceItemDto[];

  @ApiProperty({
    example: '10000000',
  })
  totalBudgetAmount!: string;

  @ApiProperty({
    example: '7500000',
  })
  totalActualAmount!: string;

  @ApiProperty({
    example: '2500000',
  })
  totalRemainingAmount!: string;
}
