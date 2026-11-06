import { IsIn, IsOptional, Matches } from 'class-validator';

export class ListBudgetRecommendationsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;

  @IsOptional()
  @IsIn(['PENDING', 'ACCEPTED', 'REJECTED', 'DEFERRED', 'APPLIED', 'EVALUATED'])
  status?:
    'PENDING' | 'ACCEPTED' | 'REJECTED' | 'DEFERRED' | 'APPLIED' | 'EVALUATED';
}
