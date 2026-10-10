import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user-decorator';

import { NotificationsService } from './notifications.service';
import { GetNotificationsQueryDto } from './dto/get-notification-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationListResponseDto } from './dto/notification-list-response.dto';
import { NotificationPreferencesResponseDto } from './dto/notification-preferences-response.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('preferences')
  @ApiOperation({
    summary: 'Get current user notification preferences',
  })
  @ApiOkResponse({
    type: NotificationPreferencesResponseDto,
  })
  async getMyPreferences(
    @CurrentUser('id') userId: string,
  ): Promise<NotificationPreferencesResponseDto> {
    const preferences =
      await this.notificationsService.getMyPreferences(userId);

    return Object.assign(new NotificationPreferencesResponseDto(), preferences);
  }

  @Patch('preferences')
  @ApiOperation({
    summary: 'Update current user notification preferences',
  })
  @ApiOkResponse({
    type: NotificationPreferencesResponseDto,
  })
  async updateMyPreferences(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    const preferences = await this.notificationsService.updateMyPreferences(
      userId,
      dto,
    );

    return Object.assign(new NotificationPreferencesResponseDto(), preferences);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get current user unread notification count',
  })
  @ApiOkResponse({
    schema: {
      example: { count: 3 },
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
    summary: 'Get current user notifications',
  })
  @ApiOkResponse({
    type: NotificationListResponseDto,
  })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: GetNotificationsQueryDto,
  ): Promise<NotificationListResponseDto> {
    const result = await this.notificationsService.findAllByUserId(
      userId,
      query,
    );

    return Object.assign(new NotificationListResponseDto(), {
      ...result,
      data: result.data.map((notification) =>
        Object.assign(new NotificationResponseDto(), notification),
      ),
    });
  }

  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark all current user in-app notifications as read',
  })
  @ApiOkResponse({
    schema: {
      example: { updatedCount: 5 },
    },
  })
  async markAllAsRead(
    @CurrentUser('id') userId: string,
  ): Promise<{ updatedCount: number }> {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Patch(':notificationId/read')
  @ApiOperation({
    summary: 'Mark a notification as read',
  })
  @ApiOkResponse({
    type: NotificationResponseDto,
  })
  async markAsRead(
    @CurrentUser('id') userId: string,
    @Param('notificationId', new ParseUUIDPipe({ version: '4' }))
    notificationId: string,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notificationsService.markAsRead(
      notificationId,
      userId,
    );

    return Object.assign(new NotificationResponseDto(), notification);
  }

  @Get(':notificationId')
  @ApiOperation({
    summary: 'Get a notification by ID',
  })
  @ApiOkResponse({
    type: NotificationResponseDto,
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

    return Object.assign(new NotificationResponseDto(), notification);
  }
}
