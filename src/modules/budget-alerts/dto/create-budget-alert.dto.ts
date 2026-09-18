import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Max, Min } from 'class-validator';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';

export class CreateBudgetAlertDto {
  @ApiProperty({
    description: 'Percentage of budget usage that triggers the alert',
    example: 80,
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  thresholdPercentage!: number;

  @ApiProperty({
    description: 'Notification channel used when the threshold is reached',
    enum: NotificationChannel,
    example: NotificationChannel.TELEGRAM,
  })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;
}
