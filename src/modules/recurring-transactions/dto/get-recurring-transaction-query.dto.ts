import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

import { RecurringFrequency } from 'src/database/enums/recurring-frequency.enum';
import { TransactionType } from 'src/database/enums/transaction-type.enum';

export class GetRecurringTransactionsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter recurring transactions by transaction type.',
    enum: TransactionType,
    example: TransactionType.EXPENSE,
  })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({
    description: 'Filter recurring transactions by frequency.',
    enum: RecurringFrequency,
    example: RecurringFrequency.MONTHLY,
  })
  @IsOptional()
  @IsEnum(RecurringFrequency)
  frequency?: RecurringFrequency;

  @ApiPropertyOptional({
    description: 'Filter recurring transactions by active state.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
