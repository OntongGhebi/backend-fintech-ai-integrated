import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user-decorator';

import { GetNotificationsQueryDto } from './dto/get-notification-query.dto';
import { NotificationListResponseDto } from './dto/notification-list-response.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@ApiTags('Notifications')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread in-app notification count',
    description:
      'Returns the number of unread in-app notifications belonging to the authenticated user.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        count: 3,
      },
    },
  })
  async getUnreadCount(
    @CurrentUser('id') userId: string,
  ): Promise<{ count: number }> {
    const count = await this.notificationsService.getUnreadCount(userId);

    return { count };
  }

  @Get()
  @ApiOperation({
    summary: 'List notifications',
    description:
      'Returns paginated notifications belonging to the authenticated user. Supports filtering by status and channel.',
  })
  @ApiOkResponse({
    type: NotificationListResponseDto,
    description: 'Notifications retrieved successfully.',
  })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: GetNotificationsQueryDto,
  ): Promise<NotificationListResponseDto> {
    const result = await this.notificationsService.findAllByUserId(userId, {
      status: query.status,
      channel: query.channel,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: result.data.map((notification) => ({
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        channel: notification.channel as NotificationResponseDto['channel'],
        status: notification.status as NotificationResponseDto['status'],
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      })),
      meta: result.meta,
    };
  }

  @Get(':notificationId')
  @ApiOperation({
    summary: 'Get notification details',
    description:
      'Returns a notification only if it belongs to the authenticated user.',
  })
  @ApiParam({
    name: 'notificationId',
    description: 'Notification UUID.',
    example: '9c7d6e5f-4a3b-2c1d-0e9f-8a7b6c5d4e3f',
  })
  @ApiOkResponse({
    type: NotificationResponseDto,
    description: 'Notification retrieved successfully.',
  })
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('notificationId', new ParseUUIDPipe({ version: '4' }))
    notificationId: string,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notificationsService.findOneByUserId(
      notificationId,
      userId,
    );

    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      channel: notification.channel as NotificationResponseDto['channel'],
      status: notification.status as NotificationResponseDto['status'],
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
  }
}
