import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectBudgetRecommendationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
