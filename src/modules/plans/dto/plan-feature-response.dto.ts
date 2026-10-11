import { ApiProperty } from '@nestjs/swagger';

export class PlanFeatureResponseDto {
  @ApiProperty({ example: 'AI_INSIGHTS' })
  featureCode!: string;

  @ApiProperty({ example: true })
  enabled!: boolean;

  @ApiProperty({ example: 100, nullable: true })
  limitValue!: number | null;

  @ApiProperty({
    example: 'MONTHLY',
    enum: ['DAILY', 'MONTHLY', 'YEARLY', 'LIFETIME'],
    nullable: true,
  })
  limitPeriod!: string | null;
}
