import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsDecimal,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

import { RecurringFrequency } from 'src/database/enums/recurring-frequency.enum';
import { TransactionType } from 'src/database/enums/transaction-type.enum';

export class UpdateRecurringTransactionDto {
  @ApiPropertyOptional({
    description:
      'Account UUID where the recurring transaction will be recorded.',
    example: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
  })
  @IsOptional()
  @IsUUID('4')
  accountId?: string;

  @ApiPropertyOptional({
    description:
      'Category UUID associated with the recurring transaction. Send null to remove the category.',
    example: '7f4c9a2d-5b81-4d36-9e27-1a6c8b3d4f50',
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string | null;

  @ApiPropertyOptional({
    description: 'Recurring transaction type.',
    enum: TransactionType,
    example: TransactionType.EXPENSE,
  })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({
    description:
      'Recurring transaction amount in IDR. Maximum 4 decimal places are supported.',
    example: '1750000',
    pattern: '^\\d+(\\.\\d{1,4})?$',
  })
  @IsOptional()
  @IsDecimal(
    {
      decimal_digits: '0,4',
      force_decimal: false,
      locale: 'en-US',
    },
    {
      message: 'amount must be a valid decimal with up to 4 decimal places',
    },
  )
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'amount must be a positive decimal with up to 4 decimal places',
  })
  amount?: string;

  @ApiPropertyOptional({
    description:
      'Optional description of the recurring transaction. Send null to remove the description.',
    example: 'Monthly internet subscription',
    maxLength: 500,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Frequency at which the transaction should be generated.',
    enum: RecurringFrequency,
    example: RecurringFrequency.MONTHLY,
  })
  @IsOptional()
  @IsEnum(RecurringFrequency)
  frequency?: RecurringFrequency;

  @ApiPropertyOptional({
    description:
      'Date when the recurring transaction starts. ISO 8601 date format.',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'Date when the recurring transaction ends. Send null to remove the end date.',
    example: '2027-09-30',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}
