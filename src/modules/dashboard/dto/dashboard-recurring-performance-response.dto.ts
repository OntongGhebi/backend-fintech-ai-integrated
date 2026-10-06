import { ApiProperty } from '@nestjs/swagger';

export class DashboardRecurringPerformanceItemDto {
  @ApiProperty({
    example: '11111111-1111-4111-8111-111111111111',
  })
  recurringTransactionId!: string;

  @ApiProperty({
    example: 'Netflix',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    example: 'EXPENSE',
    enum: ['INCOME', 'EXPENSE', 'TRANSFER'],
  })
  type!: 'INCOME' | 'EXPENSE' | 'TRANSFER';

  @ApiProperty({
    example: 'MONTHLY',
    enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'],
  })
  frequency!: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

  @ApiProperty({
    example: '150000',
  })
  amount!: string;

  @ApiProperty({
    example: 6,
  })
  expectedOccurrences!: number;

  @ApiProperty({
    example: 5,
  })
  executedOccurrences!: number;

  @ApiProperty({
    example: 1,
  })
  missedOccurrences!: number;

  @ApiProperty({
    example: '900000',
  })
  expectedAmount!: string;

  @ApiProperty({
    example: '750000',
  })
  executedAmount!: string;

  @ApiProperty({
    example: '83.333333333333333333',
  })
  completionPercentage!: string;

  @ApiProperty({
    example: 'NEAR_COMPLETE',
    enum: ['ON_TRACK', 'NEAR_COMPLETE', 'UNDERPERFORMING'],
  })
  status!: 'ON_TRACK' | 'NEAR_COMPLETE' | 'UNDERPERFORMING';
}

export class DashboardRecurringPerformanceResponseDto {
  @ApiProperty({
    example: 'IDR',
  })
  currency!: string;

  @ApiProperty({
    type: [DashboardRecurringPerformanceItemDto],
  })
  recurringTransactions!: DashboardRecurringPerformanceItemDto[];

  @ApiProperty({
    example: '900000',
  })
  totalExpectedAmount!: string;

  @ApiProperty({
    example: '750000',
  })
  totalExecutedAmount!: string;

  @ApiProperty({
    example: 6,
  })
  totalExpectedOccurrences!: number;

  @ApiProperty({
    example: 5,
  })
  totalExecutedOccurrences!: number;

  @ApiProperty({
    example: 1,
  })
  totalMissedOccurrences!: number;
}
