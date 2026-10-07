import { ApiProperty } from '@nestjs/swagger';

export class DashboardMonthlyFinancialSummaryItemDto {
  @ApiProperty({
    example: '2026-09',
  })
  month!: string;

  @ApiProperty({
    example: '5000000',
  })
  income!: string;

  @ApiProperty({
    example: '1750000',
  })
  expense!: string;

  @ApiProperty({
    example: '3250000',
  })
  netCashFlow!: string;

  @ApiProperty({
    example: 8,
  })
  transactionCount!: number;

  @ApiProperty({
    example: '65',
  })
  savingsRate!: string;
}

export class DashboardMonthlyFinancialSummaryResponseDto {
  @ApiProperty({
    example: 'IDR',
  })
  currency!: string;

  @ApiProperty({
    example: '2026-01-01T00:00:00.000Z',
  })
  startDate!: string;

  @ApiProperty({
    example: '2026-12-31T23:59:59.999Z',
  })
  endDate!: string;

  @ApiProperty({
    type: [DashboardMonthlyFinancialSummaryItemDto],
  })
  months!: DashboardMonthlyFinancialSummaryItemDto[];

  @ApiProperty({
    example: '60000000',
  })
  totalIncome!: string;

  @ApiProperty({
    example: '30000000',
  })
  totalExpense!: string;

  @ApiProperty({
    example: '30000000',
  })
  totalNetCashFlow!: string;

  @ApiProperty({
    example: 120,
  })
  totalTransactionCount!: number;

  @ApiProperty({
    example: '5000000',
  })
  averageMonthlyIncome!: string;

  @ApiProperty({
    example: '2500000',
  })
  averageMonthlyExpense!: string;
}
