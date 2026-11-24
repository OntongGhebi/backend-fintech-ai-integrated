import { ApiProperty } from '@nestjs/swagger';

import {
  NOTIFICATION_DEFAULT_LIMIT,
  NOTIFICATION_DEFAULT_PAGE,
  NOTIFICATION_MAX_LIMIT,
} from '../notifications.constants';

import { NotificationResponseDto } from './notification-response.dto';

export class NotificationListMetaDto {
  @ApiProperty({
    example: NOTIFICATION_DEFAULT_PAGE,
    minimum: 1,
    description: 'Current 1-based page number.',
  })
  page!: number;

  @ApiProperty({
    example: NOTIFICATION_DEFAULT_LIMIT,
    minimum: 1,
    maximum: NOTIFICATION_MAX_LIMIT,
    description: 'Number of notifications returned per page.',
  })
  limit!: number;

  @ApiProperty({
    example: 35,
    minimum: 0,
    description: 'Total notifications matching the applied filters.',
  })
  total!: number;

  @ApiProperty({
    example: 2,
    minimum: 0,
    description:
      'Total pages calculated from total matching notifications and limit.',
  })
  totalPages!: number;
}

export class NotificationListResponseDto {
  @ApiProperty({
    type: NotificationResponseDto,
    isArray: true,
    description: 'Notifications belonging to the authenticated user.',
  })
  data!: NotificationResponseDto[];

  @ApiProperty({
    type: NotificationListMetaDto,
    description: 'Pagination metadata for the notification list.',
  })
  meta!: NotificationListMetaDto;
}
