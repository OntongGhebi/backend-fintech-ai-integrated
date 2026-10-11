import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class StartTrialDto {
  @ApiProperty({
    example: 'PREMIUM_MONTHLY',
    description: 'Kode paket aktif yang akan digunakan untuk trial.',
  })
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'planCode contains unsupported characters',
  })
  planCode!: string;
}
