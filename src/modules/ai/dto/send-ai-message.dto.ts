import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class SendAIMessageDto {
  @ApiProperty({
    description: 'Pesan yang akan dikirim kepada AI',
    example: 'Bantu analisis pengeluaran saya bulan ini.',
    minLength: 1,
    maxLength: 8000,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;
}
