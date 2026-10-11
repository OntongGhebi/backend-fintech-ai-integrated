import { ApiProperty } from '@nestjs/swagger';
import { PlanFeatureResponseDto } from './plan-feature-response.dto';

export class PlanResponseDto {
  @ApiProperty({ example: '11111111-1111-4111-8111-111111111111' })
  id!: string;

  @ApiProperty({ example: 'PREMIUM_MONTHLY' })
  code!: string;

  @ApiProperty({ example: 'Premium Monthly' })
  name!: string;

  @ApiProperty({
    example: 'Unlock advanced financial insights.',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    example: '99000.0000',
    description: 'Harga paket dalam IDR, dikirim sebagai string.',
  })
  price!: string;

  @ApiProperty({ example: 'IDR' })
  currency!: string;

  @ApiProperty({ example: 'MONTHLY', enum: ['MONTHLY', 'YEARLY'] })
  billingInterval!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ type: [PlanFeatureResponseDto] })
  features!: PlanFeatureResponseDto[];
}
