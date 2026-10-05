import { ApiProperty } from '@nestjs/swagger';

export class DashboardSummaryResponseDto {
  @ApiProperty({
    example: 'IDR',
  })
  currency!: string;

  @ApiProperty({
    example: '5000000',
    description: 'Total active income transactions within the selected period.',
  })
  totalIncome!: string;

  @ApiProperty({
    example: '1750000',
    description:
      'Total active expense transactions within the selected period.',
  })
  totalExpense!: string;

  @ApiProperty({
    example: '3250000',
    description: 'Total income minus total expense. Transfers are excluded.',
  })
  netCashFlow!: string;

  @ApiProperty({
    example: 8,
    description:
      'Total number of active transactions within the selected period.',
  })
  transactionCount!: number;
}
