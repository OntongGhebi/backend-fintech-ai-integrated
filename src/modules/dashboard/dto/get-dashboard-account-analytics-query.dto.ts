import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

import { TransactionType } from 'src/database/enums/transaction-type.enum';

export class GetDashboardAccountAnalyticsQueryDto {
  @ApiPropertyOptional({
    enum: [TransactionType.INCOME, TransactionType.EXPENSE],
    example: TransactionType.EXPENSE,
    description:
      'Transaction type used for account analytics. TRANSFER is not supported.',
  })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00+07:00',
    description: 'Return account analytics on or after this date.',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T23:59:59+07:00',
    description: 'Return account analytics on or before this date.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
