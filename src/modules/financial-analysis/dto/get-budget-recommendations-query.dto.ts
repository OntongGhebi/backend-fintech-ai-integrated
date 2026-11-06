import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class GetBudgetRecommendationsQueryDto {
  @ApiPropertyOptional({
    example: '2026-12',
    description:
      'Target month in YYYY-MM format. Defaults to the next calendar month.',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must use YYYY-MM format',
  })
  month?: string;
}
