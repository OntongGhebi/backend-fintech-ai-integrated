import { ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { Type } from 'class-transformer';

import {
  REPORT_DEFAULT_LIMIT,
  REPORT_DEFAULT_PAGE,
  REPORT_MAX_LIMIT,
} from '../report.constants';

export class ReportQueryDto {
  @ApiPropertyOptional({
    description: 'Start date of the report period.',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date of the report period.',
    example: '2026-09-30T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description:
      'Filter transactions by transaction type. TRANSFER is not supported for financial reporting.',
    example: 'EXPENSE',
    enum: ['INCOME', 'EXPENSE'],
  })
  @IsOptional()
  @IsIn(['INCOME', 'EXPENSE'])
  type?: 'INCOME' | 'EXPENSE';

  @ApiPropertyOptional({
    description: 'Filter transactions by financial account ID.',
    example: '11111111-1111-4111-8111-111111111111',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({
    description: 'Filter transactions by category ID.',
    example: '22222222-2222-4222-8222-222222222222',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Page number.',
    example: REPORT_DEFAULT_PAGE,
    default: REPORT_DEFAULT_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = REPORT_DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: 'Number of transactions per page.',
    example: REPORT_DEFAULT_LIMIT,
    default: REPORT_DEFAULT_LIMIT,
    maximum: REPORT_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(REPORT_MAX_LIMIT)
  limit?: number = REPORT_DEFAULT_LIMIT;
}
