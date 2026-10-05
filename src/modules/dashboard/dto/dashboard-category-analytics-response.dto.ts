import { ApiProperty } from '@nestjs/swagger';

export class DashboardCategoryAnalyticsItemDto {
  @ApiProperty({
    example: '11111111-1111-4111-8111-111111111111',
  })
  categoryId!: string;

  @ApiProperty({
    example: 'Food',
  })
  categoryName!: string;

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

export class DashboardCategoryAnalyticsResponseDto {
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
    type: [DashboardCategoryAnalyticsItemDto],
  })
  categories!: DashboardCategoryAnalyticsItemDto[];

  @ApiProperty({
    example: '4000000',
  })
  totalAmount!: string;

  @ApiProperty({
    example: 13,
  })
  transactionCount!: number;
}
