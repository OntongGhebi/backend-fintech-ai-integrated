import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { TransactionType } from 'src/database/enums/transaction-type.enum';

const MAX_TRANSACTION_AMOUNT = Number.parseFloat('999999999999999.9999');

export class CreateTransactionDto {
  @ApiProperty({
    format: 'uuid',
    example: '8f5c4c0d-7d6d-4c8f-9b7d-6a8f4d3e2c1b',
    description: 'ID of the account used by the transaction.',
  })
  @IsUUID()
  accountId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '4b6f8f2a-3e5d-4c91-9a7b-1d2e3f4a5b6c',
    description:
      'ID of the category associated with the transaction. Optional for transfers.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({
    enum: TransactionType,
    example: TransactionType.EXPENSE,
    description: 'Type of the financial transaction.',
  })
  @IsEnum(TransactionType)
  type!: TransactionType;

  @ApiProperty({
    example: 75000,
    description:
      'Transaction amount. Must be greater than 0 and contain at most 4 decimal places.',
    minimum: 0.0001,
  })
  @IsNumber(
    {
      maxDecimalPlaces: 4,
    },
    {
      message: 'amount must be a valid number with up to 4 decimals',
    },
  )
  @Min(0.0001)
  @Max(MAX_TRANSACTION_AMOUNT)
  amount!: number;

  @ApiPropertyOptional({
    example: 'IDR',
    description: 'Transaction currency. Currently only IDR is supported.',
    default: 'IDR',
    minLength: 3,
    maxLength: 3,
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^IDR$/, {
    message: 'currency must be IDR',
  })
  currency?: string;

  @ApiPropertyOptional({
    example: 'Lunch at restaurant',
    description: 'Optional transaction description.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: '2026-09-12T12:30:00+07:00',
    description:
      'Transaction date and time in ISO 8601 format. The application uses Asia/Jakarta as its business timezone.',
  })
  @IsDateString()
  transactionDate!: string;
}
