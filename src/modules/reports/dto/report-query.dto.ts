import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ReportQueryDto {
  @ApiPropertyOptional({
    description: 'Start date of the report period',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date of the report period',
    example: '2026-09-30T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
