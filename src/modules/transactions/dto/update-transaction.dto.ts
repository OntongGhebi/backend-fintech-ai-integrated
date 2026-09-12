import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MAX_TRANSACTION_AMOUNT = Number.parseFloat('999999999999999.9999');

export class UpdateTransactionDto {
  @ApiPropertyOptional({
    format: 'uuid',
    example: '8f5c4c0d-7d6d-4c8f-9b7d-6a8f4d3e2c1b',
    description: 'Updated account ID.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '4b6f8f2a-3e5d-4c91-9a7b-1d2e3f4a5b6c',
    description: 'Updated category ID.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    example: 125000,
    description:
      'Updated transaction amount. Must be greater than 0 and contain at most 4 decimal places.',
    minimum: 0.0001,
  })
  @IsOptional()
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
  amount?: number;

  @ApiPropertyOptional({
    example: 'Updated transaction description',
    description: 'Updated transaction description.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: '2026-09-12T13:00:00+07:00',
    description: 'Updated transaction date and time in ISO 8601 format.',
  })
  @IsOptional()
  @IsDateString()
  transactionDate?: string;
}
