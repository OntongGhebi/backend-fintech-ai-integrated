import { ApiProperty } from '@nestjs/swagger';

export class UserPreferencesResponseDto {
  @ApiProperty({
    example: 'IDR',
    description: 'Default currency used by the user.',
  })
  currency!: string;

  @ApiProperty({
    example: 'Asia/Jakarta',
    description: 'User timezone.',
  })
  timezone!: string;

  @ApiProperty({
    example: 'id-ID',
    description: 'User locale.',
  })
  locale!: string;

  @ApiProperty({
    example: 1,
    description:
      'Day considered as the first day of the week. 0 = Sunday, 1 = Monday, ..., 6 = Saturday.',
  })
  weekStartsOn!: number;
}
