import { ApiProperty } from '@nestjs/swagger';

export class NotificationPreferencesResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: true })
  telegramEnabled!: boolean;

  @ApiProperty({ example: true })
  emailEnabled!: boolean;

  @ApiProperty({ example: true })
  budgetAlertEnabled!: boolean;

  @ApiProperty({ example: false })
  dailySummaryEnabled!: boolean;

  @ApiProperty({ example: false })
  weeklySummaryEnabled!: boolean;

  @ApiProperty({ example: false })
  monthlySummaryEnabled!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
