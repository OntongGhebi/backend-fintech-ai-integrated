import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';
import { NotificationStatus } from 'src/database/enums/notification-status.enum';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { EmailService } from 'src/integrations/email/email.service';
import { TelegramService } from 'src/modules/telegram/services/telegram.service';

import {
  NOTIFICATION_DELIVERY_JOB,
  NOTIFICATION_JOB_ATTEMPTS,
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
  ) {
    super();
  }

  async process(job: Job<NotificationDeliveryJob>): Promise<void> {
    if (job.name !== NOTIFICATION_DELIVERY_JOB) {
      throw new UnprocessableEntityException(
        `Unsupported notification job: ${job.name}`,
      );
    }

    const { notificationId } = job.data;

    if (!notificationId) {
      throw new UnprocessableEntityException('Notification ID is required.');
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
              orderBy: {
                createdAt: 'asc',
              },
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

    if (
      (notification.channel as NotificationChannel) ===
      NotificationChannel.IN_APP
    ) {
      this.logger.debug(
        `Notification ${notificationId} requires no external delivery.`,
      );
      return;
    }

    if (
      (notification.status as NotificationStatus) === NotificationStatus.SENT
    ) {
      this.logger.debug(
        `Notification ${notificationId} was already delivered.`,
      );
      return;
    }

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

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
        },
      });

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

      if (shouldStopRetrying) {
        try {
          await this.prisma.notification.update({
            where: { id: notification.id },
            data: {
              status: NotificationStatus.FAILED,
            },
          });
        } catch (statusError) {
          this.logger.error(
            `Unable to persist FAILED status for ${notification.id}.`,
            statusError instanceof Error
              ? statusError.stack
              : String(statusError),
          );
        }
      }

      if (isPermanentError) {
        job.discard();
      }

      if (!(error instanceof ServiceUnavailableException)) {
        this.logger.warn(
          `Unexpected delivery error for ${notification.id}; BullMQ retry policy will determine the next attempt.`,
        );
      }

      throw error;
    }
  }
}
