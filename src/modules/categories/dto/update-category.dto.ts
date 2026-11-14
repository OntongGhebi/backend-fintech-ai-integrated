import { OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { CreateCategoryDto } from './create-category.dto';

export class UpdateCategoryDto extends PartialType(
  OmitType(CreateCategoryDto, ['isSystem'] as const),
) {
  @IsOptional()
  @IsUUID()
  declare parentId?: string | null;
}
