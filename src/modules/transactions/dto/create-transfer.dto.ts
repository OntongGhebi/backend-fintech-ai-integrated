import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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

export class CreateTransferDto {
  @ApiProperty({
    format: 'uuid',
    example: '8f5c4c0d-7d6d-4c8f-9b7d-6a8f4d3e2c1b',
    description: 'ID of the account from which the money is transferred.',
  })
  @IsUUID()
  sourceAccountId!: string;

  @ApiProperty({
    format: 'uuid',
    example: '1f4e7a0b-3c2d-4e5f-8a9b-0c1d2e3f4a5b',
    description: 'ID of the account receiving the transferred money.',
  })
  @IsUUID()
  destinationAccountId!: string;

  @ApiProperty({
    example: 100000,
    description:
      'Transfer amount. Must be greater than 0 and contain at most 4 decimal places.',
    minimum: 0.0001,
  })
  @Type(() => Number)
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
    example: 'Transfer to savings account',
    description: 'Optional transfer description.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: '2026-09-14T20:00:00+07:00',
    description: 'Transfer date and time in ISO 8601 format.',
  })
  @IsDateString()
  transactionDate!: string;
}
