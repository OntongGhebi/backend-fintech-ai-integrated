import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CategoryType } from 'src/database/enums/category-type.enum';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Category name',
    example: 'Food',
    minLength: 1,
    maxLength: 100,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({
    description: 'Category type',
    enum: CategoryType,
    example: CategoryType.EXPENSE,
  })
  @IsEnum(CategoryType)
  type!: CategoryType;

  @ApiPropertyOptional({
    description: 'Optional icon identifier',
    example: 'utensils',
    maxLength: 50,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional({
    description: 'Optional color in hexadecimal format',
    example: '#FF5733',
    maxLength: 20,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a valid hexadecimal color such as #FF5733',
  })
  color?: string;

  @ApiPropertyOptional({
    description: 'System flag is controlled by the server',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;
}
