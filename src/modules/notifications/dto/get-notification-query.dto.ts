import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';
import { NotificationStatus } from 'src/database/enums/notification-status.enum';

import {
  NOTIFICATION_DEFAULT_LIMIT,
  NOTIFICATION_DEFAULT_PAGE,
  NOTIFICATION_MAX_LIMIT,
} from '../notifications.constants';

export class GetNotificationsQueryDto {
  @ApiPropertyOptional({
    enum: NotificationStatus,
    example: NotificationStatus.UNREAD,
    description: 'Filter notifications by status.',
  })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({
    enum: NotificationChannel,
    example: NotificationChannel.IN_APP,
    description: 'Filter notifications by delivery channel.',
  })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({
    example: NOTIFICATION_DEFAULT_PAGE,
    default: NOTIFICATION_DEFAULT_PAGE,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = NOTIFICATION_DEFAULT_PAGE;

  @ApiPropertyOptional({
    example: NOTIFICATION_DEFAULT_LIMIT,
    default: NOTIFICATION_DEFAULT_LIMIT,
    minimum: 1,
    maximum: NOTIFICATION_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATION_MAX_LIMIT)
  limit: number = NOTIFICATION_DEFAULT_LIMIT;
}
