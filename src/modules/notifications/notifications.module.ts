import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './repositories/notifications.repository';
import { QueueModule } from 'src/queue/queue.module';
import { BullModule } from '@nestjs/bullmq';
import { NotificationQueueService } from './notifications-queue.service';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';

@Module({
  imports: [
    QueueModule,
    BullModule.registerQueue({
      name: NOTIFICATIONS_QUEUE,
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    NotificationQueueService,
  ],
  exports: [
    NotificationsRepository,
    NotificationsService,
    NotificationQueueService,
  ],
})
export class NotificationsModule {}
