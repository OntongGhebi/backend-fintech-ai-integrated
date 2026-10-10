import { Injectable } from '@nestjs/common';

import { PrismaService } from 'src/database/prisma/prisma.service';
import { NotificationChannel } from 'src/database/enums/notification-channel.enum';
import { NotificationStatus } from 'src/database/enums/notification-status.enum';

import { GetNotificationsOptions } from '../types/notification.types';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Parameters<PrismaService['notification']['create']>[0]['data'],
  ) {
    return this.prisma.notification.create({ data });
  }

  async findByIdAndUserId(notificationId: string, userId: string) {
    return this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });
  }

  async findManyByUserId(userId: string, options: GetNotificationsOptions) {
    const skip = (options.page - 1) * options.limit;

    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(options.status !== undefined ? { status: options.status } : {}),
        ...(options.channel !== undefined ? { channel: options.channel } : {}),
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      skip,
      take: options.limit,
    });
  }

  async countByUserId(
    userId: string,
    filters: {
      status?: NotificationStatus;
      channel?: NotificationChannel;
    } = {},
  ): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        ...(filters.status !== undefined ? { status: filters.status } : {}),
        ...(filters.channel !== undefined ? { channel: filters.channel } : {}),
      },
    });
  }

  async countUnreadByUserId(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        status: NotificationStatus.UNREAD,
        channel: NotificationChannel.IN_APP,
      },
    });
  }

  async markAsRead(notificationId: string, userId: string, readAt: Date) {
    return this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.UNREAD,
      },
      data: {
        status: NotificationStatus.READ,
        readAt,
      },
    });
  }

  async markAllAsRead(userId: string, readAt: Date): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.UNREAD,
      },
      data: {
        status: NotificationStatus.READ,
        readAt,
      },
    });

    return result.count;
  }
}
