import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QueueModule } from 'src/queue/queue.module';

import { BudgetsModule } from '../budgets/budgets.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { telegramModule } from '../telegram/telegram.module';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './repositories/notifications.repository';
import { NotificationQueueService } from './notifications-queue.service';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { NotificationDeliveryProcessor } from './processors/notification-delivery.processor';
import { NotificationEventsService } from './notification-events.service';

const isTestEnvironment = process.env.NODE_ENV === 'test';

class TestNotificationQueueService {
  enqueueDelivery(notificationId: string): Promise<{ jobId: string }> {
    return Promise.resolve({
      jobId: `test-${notificationId}`,
    });
  }

  getQueueCounts(): Promise<{
    waiting: number;
    active: number;
    delayed: number;
    completed: number;
    failed: number;
  }> {
    return Promise.resolve({
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
    });
  }
}

@Module({
  imports: [
    QueueModule,
    BudgetsModule,
    forwardRef(() => telegramModule),
    forwardRef(() => TransactionsModule),
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
