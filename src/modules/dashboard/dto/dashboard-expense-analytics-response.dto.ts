import { ApiProperty } from '@nestjs/swagger';

export class DashboardExpenseAnalyticsResponseDto {
  @ApiProperty({
    example: 'IDR',
    description: 'Currency used by the expense analytics.',
  })
  currency!: string;

  @ApiProperty({
    example: '3750000',
    description:
      'Total amount of active expense transactions within the selected period.',
  })
  totalExpense!: string;

  @ApiProperty({
    example: 10,
    description:
      'Number of active expense transactions within the selected period.',
  })
  transactionCount!: number;

  @ApiProperty({
    example: '375000',
    description:
      'Average amount per expense transaction within the selected period.',
  })
  averageExpense!: string;
}
