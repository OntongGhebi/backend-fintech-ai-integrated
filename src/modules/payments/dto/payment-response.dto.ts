import { ApiProperty } from '@nestjs/swagger';

export class PaymentSubscriptionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  planCode!: string;

  @ApiProperty()
  planName!: string;

  @ApiProperty({ enum: ['MONTHLY', 'YEARLY'] })
  billingInterval!: string;
}

export class PaymentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  subscriptionId!: string;

  @ApiProperty({
    example: '99000.0000',
    description:
      'Nominal pembayaran dalam bentuk string untuk menjaga presisi decimal.',
  })
  amount!: string;

  @ApiProperty({ example: 'IDR' })
  currency!: string;

  @ApiProperty({
    enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELED'],
  })
  status!: string;

  @ApiProperty({ example: 'manual', description: 'Provider pembayaran.' })
  provider!: string;

  @ApiProperty({ nullable: true, type: String })
  providerPaymentId!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  paidAt!: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  failedAt!: Date | null;

  @ApiProperty({ type: PaymentSubscriptionResponseDto })
  subscription!: PaymentSubscriptionResponseDto;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
