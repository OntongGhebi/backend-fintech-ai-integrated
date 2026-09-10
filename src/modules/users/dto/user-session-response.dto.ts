import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserSessionResponseDto {
  @ApiProperty({
    description: 'Unique session identifier',
    format: 'uuid',
  })
  id!: string;

  @ApiPropertyOptional({
    description: 'IP address used when the session was created',
    nullable: true,
    example: '127.0.0.1',
  })
  ipAddress!: string | null;

  @ApiPropertyOptional({
    description: 'User agent used when the session was created',
    nullable: true,
    example: 'Mozilla/5.0',
  })
  userAgent!: string | null;

  @ApiProperty({
    description: 'Session creation timestamp',
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiPropertyOptional({
    description: 'Last time the refresh session was used',
    nullable: true,
    example: 'date-time',
  })
  lastUsedAt!: Date | null;

  @ApiProperty({
    description: 'Session expiration timestamp',
    format: 'date-time',
  })
  expiresAt!: Date;

  @ApiPropertyOptional({
    description: 'Session revocation timestamp',
    nullable: true,
    example: 'date-time',
  })
  revokedAt!: Date | null;
}
