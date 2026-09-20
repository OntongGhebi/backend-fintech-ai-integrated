/* eslint-disable @typescript-eslint/no-unsafe-return */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isEnabled?: boolean;
}
