import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';
import { NotificationStatus } from 'src/database/enums/notification-status.enum';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { EmailService } from 'src/integrations/email/email.service';
import { TelegramService } from 'src/modules/telegram/services/telegram.service';

import { NotificationQueueService } from '../notifications-queue.service';
import {
  NOTIFICATION_DELIVERY_JOB,
  NOTIFICATION_JOB_ATTEMPTS,
  NOTIFICATION_PROCESSING_LEASE_MS,
  NOTIFICATION_RECOVERY_JOB,
  NOTIFICATIONS_QUEUE,
} from '../notifications.constants';
import { NotificationDeliveryJob } from '../types/notification-delivery-job.type';

@Processor(NOTIFICATIONS_QUEUE)
@Injectable()
export class NotificationDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDeliveryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly telegramService: TelegramService,
    private readonly notificationQueueService: NotificationQueueService,
  ) {
    super();
  }

  async process(job: Job<NotificationDeliveryJob>): Promise<void> {
    if (job.name === NOTIFICATION_RECOVERY_JOB) {
      await this.recoverPendingDeliveries();
      return;
    }

    if (job.name !== NOTIFICATION_DELIVERY_JOB) {
      throw new UnprocessableEntityException(
        `Unsupported notification job: ${job.name}`,
      );
    }

    const notificationId = job.data.notificationId;

    if (!notificationId) {
      throw new UnprocessableEntityException('Notification ID is required.');
    }

    const now = new Date();
    const staleBefore = new Date(
      now.getTime() - NOTIFICATION_PROCESSING_LEASE_MS,
    );

    const claim = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        channel: {
          in: [NotificationChannel.EMAIL, NotificationChannel.TELEGRAM],
        },
        OR: [
          { status: NotificationStatus.PENDING },
          {
            status: NotificationStatus.PROCESSING,
            processingStartedAt: { lt: staleBefore },
          },
        ],
      },
      data: {
        status: NotificationStatus.PROCESSING,
        processingStartedAt: now,
      },
    });

    if (claim.count !== 1) {
      this.logger.debug(
        `Notification ${notificationId} is not claimable; another worker may be processing it or it has already been delivered.`,
      );
      return;
    }

    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        user: {
          include: {
            telegramAccounts: {
              where: {
                isVerified: true,
                unlinkedAt: null,
              },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!notification) {
      this.logger.warn(`Notification ${notificationId} no longer exists.`);
      return;
    }

    const claimedAt = now;

    const persistStatus = async (status: NotificationStatus) => {
      await this.prisma.notification.updateMany({
        where: {
          id: notification.id,
          status: NotificationStatus.PROCESSING,
          processingStartedAt: claimedAt,
        },
        data: {
          status,
          processingStartedAt: null,
        },
      });
    };

    const maxAttempts = Math.max(
      1,
      job.opts.attempts ?? NOTIFICATION_JOB_ATTEMPTS,
    );

    try {
      switch (notification.channel as NotificationChannel) {
        case NotificationChannel.EMAIL:
          await this.emailService.sendNotificationEmail(
            notification.user.email,
            notification.user.name,
            notification.title,
            notification.message,
          );
          break;

        case NotificationChannel.TELEGRAM: {
          const telegramAccount = notification.user.telegramAccounts[0];

          if (!telegramAccount) {
            throw new UnprocessableEntityException(
              'No verified Telegram account is linked to this user.',
            );
          }

          await this.telegramService.sendMessage({
            chatId: telegramAccount.telegramUserId.toString(),
            text: `${notification.title}\n\n${notification.message}`,
          });
          break;
        }

        default:
          throw new UnprocessableEntityException(
            `Unsupported notification channel: ${notification.channel}`,
          );
      }

      await persistStatus(NotificationStatus.SENT);

      this.logger.log(
        `Notification ${notification.id} delivered through ${notification.channel}.`,
      );
    } catch (error) {
      const isPermanentError = error instanceof UnprocessableEntityException;
      const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
      const shouldStopRetrying = isPermanentError || isFinalAttempt;

      this.logger.error(
        [
          `Notification delivery failed: ${notification.id}.`,
          `Channel: ${notification.channel}.`,
          `Attempt: ${job.attemptsMade + 1}/${maxAttempts}.`,
          `Final failure: ${shouldStopRetrying}.`,
        ].join(' '),
        error instanceof Error ? error.stack : String(error),
      );

      try {
        await persistStatus(
          shouldStopRetrying
            ? NotificationStatus.FAILED
            : NotificationStatus.PENDING,
        );
      } catch (statusError) {
        this.logger.error(
          `Unable to persist delivery status for ${notification.id}.`,
          statusError instanceof Error
            ? statusError.stack
            : String(statusError),
        );
      }

      if (isPermanentError) {
        throw new UnrecoverableError(
          error instanceof Error ? error.message : String(error),
        );
      }

      if (!(error instanceof ServiceUnavailableException)) {
        this.logger.warn(
          `Unexpected delivery error for ${notification.id}; BullMQ retry policy will determine the next attempt.`,
        );
      }

      throw error;
    }
  }

  private async recoverPendingDeliveries(): Promise<void> {
    const staleBefore = new Date(Date.now() - NOTIFICATION_PROCESSING_LEASE_MS);

    const recoverable = await this.prisma.notification.findMany({
      where: {
        channel: {
          in: [NotificationChannel.EMAIL, NotificationChannel.TELEGRAM],
        },
        OR: [
          { status: NotificationStatus.PENDING },
          {
            status: NotificationStatus.PROCESSING,
            processingStartedAt: { lt: staleBefore },
          },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    for (const notification of recoverable) {
      try {
        await this.notificationQueueService.enqueueDelivery(notification.id);
      } catch (error) {
        this.logger.error(
          `Unable to recover notification ${notification.id}.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
