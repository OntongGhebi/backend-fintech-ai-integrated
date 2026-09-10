import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'Ghebi Armando',
    description: 'User display name.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'new-email@example.com',
    description:
      'New email address. Changing email requires email verification again.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;
}
