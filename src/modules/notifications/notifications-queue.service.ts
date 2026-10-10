import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import {
  NOTIFICATION_DELIVERY_JOB,
  NOTIFICATION_JOB_ATTEMPTS,
  NOTIFICATION_JOB_BACKOFF_DELAY_MS,
  NOTIFICATION_JOB_RETENTION,
  NOTIFICATIONS_QUEUE,
} from './notifications.constants';
import { Job, Queue } from 'bullmq';
import { NotificationDeliveryJob } from './types/notification-delivery-job.type';

@Injectable()
export class NotificationQueueService {
  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly notificationQueue: Queue<NotificationDeliveryJob>,
  ) {}

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

    return {
      jobId: String(job.id),
    };
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
