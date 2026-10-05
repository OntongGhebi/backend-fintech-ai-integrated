import { ApiProperty } from '@nestjs/swagger';

export class DashboardIncomeAnalyticsResponseDto {
  @ApiProperty({
    example: 'IDR',
    description: 'Currency used by the income analytics.',
  })
  currency!: string;

  @ApiProperty({
    example: '7500000',
    description:
      'Total amount of active income transactions within the selected period.',
  })
  totalIncome!: string;

  @ApiProperty({
    example: 6,
    description:
      'Number of active income transactions within the selected period.',
  })
  transactionCount!: number;

  @ApiProperty({
    example: '1250000',
    description:
      'Average amount per income transaction within the selected period.',
  })
  averageIncome!: string;
}
