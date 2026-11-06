import { IsDateString, Matches } from 'class-validator';

export class DeferBudgetRecommendationDto {
  @IsDateString()
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/,
    {
      message: 'deferredUntil must be an ISO 8601 timestamp with timezone',
    },
  )
  deferredUntil!: string;
}
