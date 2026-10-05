import { ApiProperty } from '@nestjs/swagger';

export class DashboardAccountAnalyticsItemDto {
  @ApiProperty({
    example: '11111111-1111-4111-8111-111111111111',
  })
  accountId!: string;

  @ApiProperty({
    example: 'BCA',
  })
  accountName!: string;

  @ApiProperty({
    example: '2500000',
  })
  totalAmount!: string;

  @ApiProperty({
    example: 8,
  })
  transactionCount!: number;

  @ApiProperty({
    example: '62.5',
  })
  percentage!: string;
}

export class DashboardAccountAnalyticsResponseDto {
  @ApiProperty({
    example: 'IDR',
  })
  currency!: string;

  @ApiProperty({
    example: 'EXPENSE',
    enum: ['INCOME', 'EXPENSE'],
  })
  type!: 'INCOME' | 'EXPENSE';

  @ApiProperty({
    type: [DashboardAccountAnalyticsItemDto],
  })
  accounts!: DashboardAccountAnalyticsItemDto[];

  @ApiProperty({
    example: '4000000',
  })
  totalAmount!: string;

  @ApiProperty({
    example: 13,
  })
  transactionCount!: number;
}
