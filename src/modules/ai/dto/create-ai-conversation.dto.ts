import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAIConversationDto {
  @ApiPropertyOptional({
    description: 'Judul awal percakapan AI',
    example: 'Analisis pengeluaran bulanan',
    maxLength: 255,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;
}
