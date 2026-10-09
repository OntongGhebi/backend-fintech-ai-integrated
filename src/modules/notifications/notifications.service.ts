import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationsRepository } from './repositories/notifications.repository';
import { CreateNotificationInput } from './types/create-notification-input.type';
import { Notification } from '../../../generated/prisma/client';
import { NotificationChannel } from 'src/database/enums/notification-channel.enum';
import { NotificationStatus } from 'src/database/enums/notification-status.enum';
import {
  GetNotificationsOptions,
  PaginatedNotifications,
} from './types/notification.types';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    const status =
      input.status ??
      (input.channel === NotificationChannel.IN_APP
        ? NotificationStatus.UNREAD
        : NotificationStatus.FAILED);

    return this.notificationsRepository.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      channel: input.channel,
      status,
    });
  }

  async findAllByUserId(
    userId: string,
    options: GetNotificationsOptions,
  ): Promise<PaginatedNotifications<Notification>> {
    const [data, total] = await Promise.all([
      this.notificationsRepository.findManyByUserId(userId, options),
      this.notificationsRepository.countByUserId(userId, {
        status: options.status,
        channel: options.channel,
      }),
    ]);

    return {
      data,
      meta: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(total / options.limit),
      },
    };
  }

  async findOneByUserId(
    notificationId: string,
    userId: string,
  ): Promise<Notification> {
    const notification = await this.notificationsRepository.findByIdAndUserId(
      notificationId,
      userId,
    );

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationsRepository.countUnreadByUserId(userId);
  }
}
