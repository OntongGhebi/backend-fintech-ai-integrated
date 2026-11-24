import { ApiProperty } from '@nestjs/swagger';

export class PaymentHistoryPlanDto {
  @ApiProperty({
    example: 'PREMIUM_MONTHLY',
  })
  code!: string;

  @ApiProperty({
    example: 'Premium Monthly',
  })
  name!: string;
}

export class PaymentHistorySubscriptionDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    enum: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'PAUSED'],
    example: 'ACTIVE',
  })
  status!: string;

  @ApiProperty({
    enum: ['MONTHLY', 'YEARLY'],
    example: 'MONTHLY',
  })
  billingInterval!: string;

  @ApiProperty({
    type: PaymentHistoryPlanDto,
  })
  plan!: PaymentHistoryPlanDto;
}

export class PaymentHistoryItemDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    type: String,
    example: '99000.0000',
    description: 'Nominal pembayaran dalam format decimal string.',
  })
  amount!: string;

  @ApiProperty({
    example: 'IDR',
  })
  currency!: string;

  @ApiProperty({
    enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELED'],
    example: 'PAID',
  })
  status!: string;

  @ApiProperty({
    example: 'midtrans',
  })
  provider!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  paidAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  updatedAt!: Date;

  @ApiProperty({
    type: PaymentHistorySubscriptionDto,
  })
  subscription!: PaymentHistorySubscriptionDto;
}

export class PaymentHistoryMetaDto {
  @ApiProperty({
    example: 1,
  })
  page!: number;

  @ApiProperty({
    example: 20,
  })
  limit!: number;

  @ApiProperty({
    example: 45,
  })
  total!: number;

  @ApiProperty({
    example: 3,
  })
  totalPages!: number;

  @ApiProperty({
    example: true,
  })
  hasNextPage!: boolean;

  @ApiProperty({
    example: false,
  })
  hasPreviousPage!: boolean;
}

export class PaymentHistoryResponseDto {
  @ApiProperty({
    type: [PaymentHistoryItemDto],
  })
  data!: PaymentHistoryItemDto[];

  @ApiProperty({
    type: PaymentHistoryMetaDto,
  })
  meta!: PaymentHistoryMetaDto;
}
