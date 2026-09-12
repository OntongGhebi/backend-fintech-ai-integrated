import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { TransactionStatus } from 'src/database/enums/transaction-status.enum';
import { TransactionType } from 'src/database/enums/transaction-type.enum';

export class GetTransactionsQueryDto {
  @ApiPropertyOptional({
    enum: TransactionType,
    example: TransactionType.EXPENSE,
  })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '8f5c4c0d-7d6d-4c8f-9b7d-6a8f4d3e2c1b',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '4b6f8f2a-3e5d-4c91-9a7b-1d2e3f4a5b6c',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    enum: TransactionStatus,
    example: TransactionStatus.ACTIVE,
    default: TransactionStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00+07:00',
    description: 'Return transactions on or after this date.',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T23:59:59+07:00',
    description: 'Return transactions on or before this date.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
