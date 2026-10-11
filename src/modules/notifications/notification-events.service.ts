import { Injectable, Logger } from '@nestjs/common';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';

import { NotificationQueueService } from './notifications-queue.service';
import { NotificationsService } from './notifications.service';

export interface RecurringTransactionExecutedEvent {
  userId: string;
  recurringTransactionId: string;
  transactionId: string;
  transactionType: string;
  amount: string;
  description: string | null;
}

@Injectable()
export class NotificationEventsService {
  private readonly logger = new Logger(NotificationEventsService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationQueueService: NotificationQueueService,
  ) {}

  async recurringTransactionExecuted(
    event: RecurringTransactionExecutedEvent,
  ): Promise<void> {
    const message = [
      'Transaksi berulang berhasil dicatat.',
      `Jenis: ${event.transactionType}.`,
      `Jumlah: Rp${event.amount}.`,
      ...(event.description?.trim()
        ? [`Keterangan: ${event.description.trim()}.`]
        : []),
    ].join('\n');

    await this.notificationsService.create({
      userId: event.userId,
      type: 'RECURRING_TRANSACTION_EXECUTED',
      title: 'Transaksi berulang berhasil',
      message,
      channel: NotificationChannel.IN_APP,
    });

    const preferences = await this.notificationsService.getMyPreferences(
      event.userId,
    );

    if (preferences.emailEnabled) {
      await this.createAndEnqueueExternalNotification({
        userId: event.userId,
        type: 'RECURRING_TRANSACTION_EXECUTED',
        title: 'Transaksi berulang berhasil',
        message,
        channel: NotificationChannel.EMAIL,
      });
    }

    if (preferences.telegramEnabled) {
      await this.createAndEnqueueExternalNotification({
        userId: event.userId,
        type: 'RECURRING_TRANSACTION_EXECUTED',
        title: 'Transaksi berulang berhasil',
        message,
        channel: NotificationChannel.TELEGRAM,
      });
    }

    this.logger.log(
      `Recurring transaction event processed: ${event.recurringTransactionId}; transaction: ${event.transactionId}.`,
    );
  }

  private async createAndEnqueueExternalNotification(input: {
    userId: string;
    type: string;
    title: string;
    message: string;
    channel: NotificationChannel.EMAIL | NotificationChannel.TELEGRAM;
  }): Promise<void> {
    try {
      const notification = await this.notificationsService.create({
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        channel: input.channel,
      });

      await this.notificationQueueService.enqueueDelivery(notification.id);
    } catch (error) {
      this.logger.error(
        `Unable to queue ${input.channel} notification for user ${input.userId}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
