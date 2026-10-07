import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class GetDashboardMonthlyFinancialSummaryQueryDto {
  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00+07:00',
    description: 'Start date of the monthly financial summary period.',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59+07:00',
    description: 'End date of the monthly financial summary period.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
