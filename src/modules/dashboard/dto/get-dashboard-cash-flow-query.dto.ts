import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

import type { DashboardCashFlowPeriod } from '../types/dashboard.types';

export class GetDashboardCashFlowQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00+07:00',
    description: 'Start date of the cash flow analysis period.',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T23:59:59+07:00',
    description: 'End date of the cash flow analysis period.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    example: 'MONTH',
    enum: ['DAY', 'WEEK', 'MONTH', 'YEAR'],
    default: 'MONTH',
    description: 'Time bucket used to aggregate cash flow.',
  })
  @IsOptional()
  @IsEnum(['DAY', 'WEEK', 'MONTH', 'YEAR'])
  period?: DashboardCashFlowPeriod;
}
