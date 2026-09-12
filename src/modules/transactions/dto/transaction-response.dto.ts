import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TransactionSource } from 'src/database/enums/transaction-source.enum';
import { TransactionStatus } from 'src/database/enums/transaction-status.enum';
import { TransactionType } from 'src/database/enums/transaction-type.enum';

export class TransactionResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '9c7d6e5f-4a3b-2c1d-0e9f-8a7b6c5d4e3f',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    example: '1f4e7a0b-3c2d-4e5f-8a9b-0c1d2e3f4a5b',
  })
  userId!: string;

  @ApiProperty({
    format: 'uuid',
    example: '8f5c4c0d-7d6d-4c8f-9b7d-6a8f4d3e2c1b',
  })
  accountId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '4b6f8f2a-3e5d-4c91-9a7b-1d2e3f4a5b6c',
    nullable: true,
  })
  categoryId!: string | null;

  @ApiProperty({
    enum: TransactionType,
    example: TransactionType.EXPENSE,
  })
  type!: TransactionType;

  @ApiProperty({
    example: '75000.0000',
    description: 'Transaction amount represented as a decimal string.',
  })
  amount!: string;

  @ApiProperty({
    example: 'IDR',
  })
  currency!: string;

  @ApiPropertyOptional({
    example: 'Lunch at restaurant',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-12T05:30:00.000Z',
  })
  transactionDate!: Date;

  @ApiProperty({
    enum: TransactionSource,
    example: TransactionSource.MANUAL,
  })
  source!: TransactionSource;

  @ApiProperty({
    enum: TransactionStatus,
    example: TransactionStatus.ACTIVE,
  })
  status!: TransactionStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '7e6d5c4b-3a2f-1e0d-9c8b-7a6f5e4d3c2b',
    nullable: true,
    description:
      'Shared identifier between the two transaction sides of a transfer.',
  })
  transferGroupId!: string | null;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-12T05:30:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-12T05:30:00.000Z',
  })
  updatedAt!: Date;
}
