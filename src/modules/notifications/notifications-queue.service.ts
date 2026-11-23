import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

import {
  NOTIFICATION_DELIVERY_JOB,
  NOTIFICATION_JOB_ATTEMPTS,
  NOTIFICATION_JOB_BACKOFF_DELAY_MS,
  NOTIFICATION_JOB_RETENTION,
  NOTIFICATION_RECOVERY_INTERVAL_MS,
  NOTIFICATION_RECOVERY_JOB,
  NOTIFICATIONS_QUEUE,
} from './notifications.constants';
import { NotificationDeliveryJob } from './types/notification-delivery-job.type';

@Injectable()
export class NotificationQueueService implements OnModuleInit {
  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly notificationQueue: Queue<NotificationDeliveryJob>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.notificationQueue.upsertJobScheduler(
      NOTIFICATION_RECOVERY_JOB,
      {
        every: NOTIFICATION_RECOVERY_INTERVAL_MS,
      },
      {
        name: NOTIFICATION_RECOVERY_JOB,
        data: {},
        opts: {
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
    );
  }

  async enqueueDelivery(notificationId: string): Promise<{ jobId: string }> {
    const job: Job<NotificationDeliveryJob> = await this.notificationQueue.add(
      NOTIFICATION_DELIVERY_JOB,
      { notificationId },
      {
        jobId: `notification-delivery-${notificationId}`,
        attempts: NOTIFICATION_JOB_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: NOTIFICATION_JOB_BACKOFF_DELAY_MS,
        },
        removeOnComplete: NOTIFICATION_JOB_RETENTION.completed,
        removeOnFail: NOTIFICATION_JOB_RETENTION.failed,
      },
    );

    return { jobId: String(job.id) };
  }

  async getQueueCounts() {
    return this.notificationQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed',
    );
  }
}
