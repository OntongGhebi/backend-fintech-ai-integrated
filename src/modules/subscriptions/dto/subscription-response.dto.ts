import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlanResponseDto } from './subscription-plan-response.dto';

export class SubscriptionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  planId!: string;

  @ApiProperty({
    enum: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'PAUSED'],
  })
  status!: string;

  @ApiProperty({ enum: ['MONTHLY', 'YEARLY'] })
  billingInterval!: string;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  trialStartedAt!: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  trialEndsAt!: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  currentPeriodStart!: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  currentPeriodEnd!: Date | null;

  @ApiProperty()
  cancelAtPeriodEnd!: boolean;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  canceledAt!: Date | null;

  @ApiProperty({ type: SubscriptionPlanResponseDto })
  plan!: SubscriptionPlanResponseDto;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
