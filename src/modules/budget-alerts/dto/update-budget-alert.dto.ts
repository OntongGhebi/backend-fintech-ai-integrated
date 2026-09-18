import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';

export class UpdateBudgetAlertDto {
  @ApiPropertyOptional({
    description: 'Percentage of budget usage that triggers the alert',
    example: 90,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  thresholdPercentage?: number;

  @ApiPropertyOptional({
    description: 'Notification channel used when the threshold is reached',
    enum: NotificationChannel,
    example: NotificationChannel.TELEGRAM,
  })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({
    description: 'Whether the budget alert is enabled',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
