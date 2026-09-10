import { ApiProperty } from '@nestjs/swagger';

export class UserPreferenceResponseDto {
  @ApiProperty({
    example: 'IDR',
    description: 'Default currency used the user',
  })
  currency!: string;
  @ApiProperty({
    example: 'Asia/Jakarta',
    description: 'User timezone',
  })
  timezone!: string;
  @ApiProperty({
    example: 'id-ID',
    description: 'User locale',
  })
  locale!: string;
  @ApiProperty({
    example: 1,
    description: 'Day the user considers the start of the week.',
  })
  weekStartsOn!: number;
}

export class UserProfileResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    example: 'user@example.com',
  })
  email!: string;
  @ApiProperty({
    example: 'Ghebi Armando',
  })
  name!: string;
  @ApiProperty({
    example: true,
  })
  emailVerifiedAt!: boolean;
  @ApiProperty({
    example: 'ACTIVE',
  })
  status!: string;
  @ApiProperty({
    example: '2026-09-10T05:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-09-10T05:00:00.000Z',
  })
  updatedAt!: Date;
  @ApiProperty({
    type: UserPreferenceResponseDto,
  })
  preferences!: UserPreferenceResponseDto;
}
