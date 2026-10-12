import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreatePaymentCheckoutDto {
  @ApiProperty({
    description: 'ID subscription milik pengguna yang akan dibayar',
    format: 'uuid',
    example: 'e1d4a1f0-1111-4444-8888-123456789abc',
  })
  @IsUUID()
  subscriptionId!: string;
}
