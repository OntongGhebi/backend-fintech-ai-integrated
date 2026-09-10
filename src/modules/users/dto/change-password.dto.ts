import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'CurrentPassword123!',
    description: 'The user crrent password',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({
    example: 'NewSecurePassword123!',
    description: 'The new password',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
