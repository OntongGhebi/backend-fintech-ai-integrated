import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { CategoryType } from 'src/database/enums/category-type.enum';

export class GetCategoriesQueryDto {
  @ApiPropertyOptional({
    description: 'Filter categories by category type',
    enum: CategoryType,
    example: CategoryType.EXPENSE,
  })
  @IsOptional()
  @IsEnum(CategoryType)
  type?: CategoryType;
}
