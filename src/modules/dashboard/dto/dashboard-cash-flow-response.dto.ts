import { ApiProperty } from '@nestjs/swagger';

export class DashboardCashFlowItemDto {
  @ApiProperty({
    example: '2026-09',
  })
  period!: string;

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
}

export class DashboardCashFlowResponseDto {
  @ApiProperty({
    example: 'IDR',
  })
  currency!: string;

  @ApiProperty({
    example: '2026-09-01T00:00:00.000Z',
  })
  startDate!: string;

  @ApiProperty({
    example: '2026-09-30T23:59:59.999Z',
  })
  endDate!: string;

  @ApiProperty({
    example: 'MONTH',
    enum: ['DAY', 'WEEK', 'MONTH', 'YEAR'],
  })
  period!: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

  @ApiProperty({
    type: [DashboardCashFlowItemDto],
  })
  cashFlows!: DashboardCashFlowItemDto[];

  @ApiProperty({
    example: '5000000',
  })
  totalIncome!: string;

  @ApiProperty({
    example: '1750000',
  })
  totalExpense!: string;

  @ApiProperty({
    example: '3250000',
  })
  totalNetCashFlow!: string;

  @ApiProperty({
    example: 8,
  })
  totalTransactionCount!: number;
}
