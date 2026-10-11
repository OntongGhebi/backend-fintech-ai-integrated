import { ApiProperty } from '@nestjs/swagger';

export class SubscriptionPlanResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'PREMIUM_MONTHLY' })
  code!: string;

  @ApiProperty({ example: 'Premium Monthly' })
  name!: string;

  @ApiProperty({ example: '99000.0000' })
  price!: string;

  @ApiProperty({ example: 'IDR' })
  currency!: string;

  @ApiProperty({ enum: ['MONTHLY', 'YEARLY'] })
  billingInterval!: string;
}
