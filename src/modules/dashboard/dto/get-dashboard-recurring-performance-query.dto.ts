import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class GetDashboardRecurringPerformanceQueryDto {
  @ApiPropertyOptional({
    example: '2026-04-01T00:00:00+07:00',
    description: 'Start of the analytics period.',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T23:59:59+07:00',
    description: 'End of the analytics period.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
