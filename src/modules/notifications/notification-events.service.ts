import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { TransactionType } from 'src/database/enums/transaction-type.enum';
import { Prisma } from '../../../generated/prisma/client.js';

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
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Mengevaluasi alert anggaran setelah transaksi pengeluaran tersimpan.
   * Kegagalan notifikasi tidak boleh menggagalkan transaksi yang sudah tersimpan.
   */
  async budgetExpenseCreated(event: {
    userId: string;
    transactionId: string;
    type: TransactionType;
    amount: string | number;
    categoryId: string | null;
    transactionDate: Date;
  }): Promise<void> {
    if (event.type !== TransactionType.EXPENSE) {
      return;
    }

    try {
      const preferences = await this.notificationsService.getMyPreferences(
        event.userId,
      );

      if (!preferences.budgetAlertEnabled) {
        return;
      }

      const transactionDate = new Date(event.transactionDate);

      const dateOnly = new Date(
        Date.UTC(
          transactionDate.getUTCFullYear(),
          transactionDate.getUTCMonth(),
          transactionDate.getUTCDate(),
        ),
      );

      const budgets = await this.prisma.budget.findMany({
        where: {
          userId: event.userId,
          status: 'ACTIVE',
          deletedAt: null,
          startDate: { lte: dateOnly },
          AND: [
            {
              OR: [{ endDate: null }, { endDate: { gte: dateOnly } }],
            },
            {
              OR: [
                { categoryId: null },
                ...(event.categoryId ? [{ categoryId: event.categoryId }] : []),
              ],
            },
          ],
        },
        include: {
          alerts: {
            where: { isEnabled: true },
          },
        },
      });

      const amount = new Prisma.Decimal(event.amount);

      for (const budget of budgets) {
        if (budget.amount.lessThanOrEqualTo(0)) {
          continue;
        }

        const transactionWhere = {
          userId: event.userId,
          type: 'EXPENSE' as const,
          status: 'ACTIVE' as const,
          deletedAt: null,
          transactionDate: {
            gte: new Date(budget.startDate),
            ...(budget.endDate
              ? {
                  lt: new Date(
                    new Date(budget.endDate).getTime() + 24 * 60 * 60 * 1000,
                  ),
                }
              : {}),
          },
          ...(budget.categoryId ? { categoryId: budget.categoryId } : {}),
        };

        const aggregate = await this.prisma.transaction.aggregate({
          where: transactionWhere,
          _sum: { amount: true },
        });

        // Transaksi baru sudah termasuk dalam jumlah sesudah transaksi.
        const actualAfter = new Prisma.Decimal(aggregate._sum.amount ?? 0);
        const actualBefore = actualAfter.minus(amount);

        const beforePercentage = actualBefore.div(budget.amount).mul(100);

        const afterPercentage = actualAfter.div(budget.amount).mul(100);

        const crossedAlerts = budget.alerts.filter(
          (alert) =>
            beforePercentage.lessThan(alert.thresholdPercentage) &&
            afterPercentage.greaterThanOrEqualTo(alert.thresholdPercentage),
        );

        if (crossedAlerts.length === 0) {
          continue;
        }

        const crossedThresholds = [
          ...new Set(crossedAlerts.map((alert) => alert.thresholdPercentage)),
        ].sort((a, b) => a - b);

        const thresholdText = crossedThresholds
          .map((value) => `${value}%`)
          .join(', ');

        const usage = afterPercentage.toDecimalPlaces(2).toString();

        const message =
          `Anggaran "${budget.name}" telah mencapai ${usage}% pemakaian ` +
          `(Rp${actualAfter.toFixed(0)} dari Rp${budget.amount.toFixed(0)}). ` +
          `Ambang terlampaui: ${thresholdText}.`;

        const title = `Peringatan anggaran: ${budget.name}`;

        const hasInAppAlert = crossedAlerts.some(
          (alert) =>
            String(alert.channel) === String(NotificationChannel.IN_APP),
        );

        if (hasInAppAlert) {
          await this.notificationsService.create({
            userId: event.userId,
            type: 'BUDGET_ALERT',
            title,
            message,
            channel: NotificationChannel.IN_APP,
          });
        }

        const hasEmailAlert = crossedAlerts.some(
          (alert) =>
            String(alert.channel) === String(NotificationChannel.EMAIL),
        );

        if (preferences.emailEnabled && hasEmailAlert) {
          await this.createAndEnqueueExternalNotification({
            userId: event.userId,
            type: 'BUDGET_ALERT',
            title,
            message,
            channel: NotificationChannel.EMAIL,
          });
        }

        const hasTelegramAlert = crossedAlerts.some(
          (alert) =>
            String(alert.channel) === String(NotificationChannel.TELEGRAM),
        );

        if (preferences.telegramEnabled && hasTelegramAlert) {
          await this.createAndEnqueueExternalNotification({
            userId: event.userId,
            type: 'BUDGET_ALERT',
            title,
            message,
            channel: NotificationChannel.TELEGRAM,
          });
        }
      }

      this.logger.log(
        `Budget alerts evaluated for expense transaction ${event.transactionId}.`,
      );
    } catch (error) {
      this.logger.error(
        `Unable to evaluate budget alerts for transaction ${event.transactionId}; transaction remains saved.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

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
