import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './repositories/notifications.repository';
import { QueueModule } from 'src/queue/queue.module';
import { BullModule } from '@nestjs/bullmq';
import { NotificationQueueService } from './notifications-queue.service';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { NotificationDeliveryProcessor } from './processors/notification-delivery.processor';
import { telegramModule } from '../telegram/telegram.module';
import { NotificationEventsService } from './notification-events.service';

const isTestEnvironment = process.env.NODE_ENV === 'test';

class TestNotificationQueueService {
  async enqueueDelivery(notificationId: string): Promise<{ jobId: string }> {
    return { jobId: `test-${notificationId}` };
  }

  async getQueueCounts(): Promise<{
    waiting: number;
    active: number;
    delayed: number;
    completed: number;
    failed: number;
  }> {
    return { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 };
  }
}

@Module({
  imports: [
    QueueModule,
    telegramModule,
    ...(isTestEnvironment
      ? []
      : [
          BullModule.registerQueue({
            name: NOTIFICATIONS_QUEUE,
          }),
        ]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    ...(isTestEnvironment
      ? [
          {
            provide: NotificationQueueService,
            useClass: TestNotificationQueueService,
          },
        ]
      : [NotificationQueueService]),
    NotificationEventsService,
    ...(isTestEnvironment ? [] : [NotificationDeliveryProcessor]),
  ],
  exports: [
    NotificationsRepository,
    NotificationsService,
    NotificationQueueService,
    NotificationEventsService,
    ...(isTestEnvironment ? [] : [NotificationDeliveryProcessor]),
  ],
})
export class NotificationsModule {}
