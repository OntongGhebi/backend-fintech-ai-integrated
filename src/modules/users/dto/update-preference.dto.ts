import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({
    example: 'IDR',
    description: 'Default currency user by the user.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({
    example: 'Asia/Jakarta',
    description: 'User timezone.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({
    example: 'id-ID',
    description: 'User locale.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  locale?: string;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Day considered as the first dat of the week. 0 = Sunday, 1 = Monday, ...., 6 = Saturday.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekStartsOn?: number;
}
