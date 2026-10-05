import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class GetDashboardSummaryQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00+07:00',
    description:
      'Return financial summary for transactions on or after this date.',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T23:59:59+07:00',
    description:
      'Return financial summary for transactions on or before this date.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
