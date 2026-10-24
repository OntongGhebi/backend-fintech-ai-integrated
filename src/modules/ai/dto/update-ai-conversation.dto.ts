import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateAIConversationDto {
  @ApiProperty({
    description: 'Judul baru percakapan',
    example: 'Evaluasi keuangan Oktober',
    minLength: 1,
    maxLength: 255,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;
}
