import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';

import { TransactionStatus } from 'src/database/enums/transaction-status.enum';
import { TransactionType } from 'src/database/enums/transaction-type.enum';

@ValidatorConstraint({
  name: 'endDateAfterOrEqualStartDate',
  async: false,
})
class EndDateAfterOrEqualStartDateConstraint implements ValidatorConstraintInterface {
  validate(endDate: unknown, args: ValidationArguments): boolean {
    if (typeof endDate !== 'string' || endDate.length === 0) {
      return true;
    }

    const object = args.object as GetTransactionsQueryDto;

    if (!object.startDate) {
      return true;
    }

    const startTimestamp = Date.parse(object.startDate);
    const endTimestamp = Date.parse(endDate);

    if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
      return true;
    }

    return endTimestamp >= startTimestamp;
  }

  defaultMessage(): string {
    return 'endDate must be greater than or equal to startDate';
  }
}

export class GetTransactionsQueryDto {
  @ApiPropertyOptional({
    enum: TransactionType,
    example: TransactionType.EXPENSE,
    description: 'Filter transactions by transaction type.',
  })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '8f5c4c0d-7d6d-4c8f-9b7d-6a8f4d3e2c1b',
    description: 'Filter transactions by account UUID.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '4b6f8f2a-3e5d-4c91-9a7b-1d2e3f4a5b6c',
    description: 'Filter transactions by category UUID.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    enum: TransactionStatus,
    example: TransactionStatus.ACTIVE,
    default: TransactionStatus.ACTIVE,
    description: 'Filter transactions by transaction status.',
  })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00+07:00',
    description:
      'Inclusive lower bound of transactionDate. Must be a valid ISO 8601 date.',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T23:59:59+07:00',
    description:
      'Inclusive upper bound of transactionDate. Must be greater than or equal to startDate when both are provided.',
  })
  @IsOptional()
  @IsDateString()
  @Validate(EndDateAfterOrEqualStartDateConstraint)
  endDate?: string;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    minimum: 1,
    description: 'Page number. Defaults to 1.',
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
    description: 'Number of transactions per page. Defaults to 20.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
