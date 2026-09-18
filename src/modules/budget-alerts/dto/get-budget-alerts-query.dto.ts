import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';

export class GetBudgetAlertsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter alerts by notification channel',
    enum: NotificationChannel,
    example: NotificationChannel.TELEGRAM,
  })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({
    description: 'Filter alerts by enabled state',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
