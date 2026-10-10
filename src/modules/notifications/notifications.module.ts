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

@Module({
  imports: [
    QueueModule,
    telegramModule,
    BullModule.registerQueue({
      name: NOTIFICATIONS_QUEUE,
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    NotificationQueueService,
    NotificationDeliveryProcessor,
  ],
  exports: [
    NotificationsRepository,
    NotificationsService,
    NotificationQueueService,
    NotificationDeliveryProcessor,
  ],
})
export class NotificationsModule {}
