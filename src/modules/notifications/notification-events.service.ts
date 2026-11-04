import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { TransactionType } from 'src/database/enums/transaction-type.enum';
import { Prisma } from '../../../generated/prisma/client.js';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';

import { NotificationQueueService } from './notifications-queue.service';
import { NotificationsService } from './notifications.service';
import {
  getBudgetMonthRange,
  getZonedDateBoundary,
  getZonedNextDateBoundary,
} from '../budgets/utils/budget-month.util';

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
    if (event.type !== TransactionType.EXPENSE) return;

    try {
      const preferences = await this.notificationsService.getMyPreferences(
        event.userId,
      );
      if (!preferences.budgetAlertEnabled) return;

      const userPreference = await this.prisma.userPreference.findUnique({
        where: { userId: event.userId },
        select: { timezone: true },
      });
      const timezone = userPreference?.timezone ?? 'Asia/Jakarta';
      const transactionDate = new Date(event.transactionDate);
      const month = getBudgetMonthRange(transactionDate, timezone);

      const budgets = await this.prisma.budget.findMany({
        where: {
          userId: event.userId,
          status: 'ACTIVE',
          deletedAt: null,
          startDate: { lte: month.periodEndDate },
          AND: [
            {
              OR: [{ endDate: null }, { endDate: { gte: month.periodStart } }],
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
          allocations: {
            where: { periodStart: month.periodStart },
            take: 1,
          },
          alerts: { where: { isEnabled: true } },
        },
      });

      const transactionAmount = new Prisma.Decimal(event.amount);

      for (const budget of budgets) {
        const allocation = budget.allocations[0];
        if (!allocation || allocation.amount.lessThanOrEqualTo(0)) continue;

        // Respect configured budget boundaries while evaluating only the
        // allocation month containing the newly-created expense.
        const budgetStart = getZonedDateBoundary(budget.startDate, timezone);
        const budgetEndExclusive = budget.endDate
          ? getZonedNextDateBoundary(budget.endDate, timezone)
          : month.end;
        const rangeStart =
          budgetStart > month.start ? budgetStart : month.start;
        const rangeEnd =
          budgetEndExclusive < month.end ? budgetEndExclusive : month.end;

        // Do not evaluate a budget for a transaction outside its configured
        // lifetime, even when the budget overlaps another part of this month.
        if (
          rangeStart >= rangeEnd ||
          transactionDate < rangeStart ||
          transactionDate >= rangeEnd
        )
          continue;

        const aggregate = await this.prisma.transaction.aggregate({
          where: {
            userId: event.userId,
            type: 'EXPENSE',
            status: 'ACTIVE',
            deletedAt: null,
            currency: 'IDR',
            transactionDate: { gte: rangeStart, lt: rangeEnd },
            ...(budget.categoryId ? { categoryId: budget.categoryId } : {}),
          },
          _sum: { amount: true },
        });

        // The new transaction is already included in the aggregate.
        const actualAfter = new Prisma.Decimal(aggregate._sum.amount ?? 0);
        const actualBefore = actualAfter.minus(transactionAmount);
        const allocationAmount = new Prisma.Decimal(allocation.amount);
        const beforePercentage = actualBefore.div(allocationAmount).mul(100);
        const afterPercentage = actualAfter.div(allocationAmount).mul(100);

        const crossedAlerts = budget.alerts.filter(
          (alert) =>
            beforePercentage.lessThan(alert.thresholdPercentage) &&
            afterPercentage.greaterThanOrEqualTo(alert.thresholdPercentage),
        );
        if (crossedAlerts.length === 0) continue;

        const crossedThresholds: number[] = Array.from(
          new Set<number>(
            crossedAlerts.map((alert) => alert.thresholdPercentage),
          ),
        ).sort((a, b) => a - b);
        const thresholdText = crossedThresholds
          .map((value) => `${value}%`)
          .join(', ');
        const usage = afterPercentage.toDecimalPlaces(2).toString();
        const monthLabel = new Intl.DateTimeFormat('id-ID', {
          month: 'long',
          year: 'numeric',
          timeZone: timezone,
        }).format(transactionDate);

        const title = `Peringatan anggaran: ${budget.name}`;
        const message =
          `Anggaran "${budget.name}" untuk ${monthLabel} telah mencapai ${usage}% pemakaian ` +
          `(Rp${actualAfter.toFixed(0)} dari Rp${allocationAmount.toFixed(0)}). ` +
          `Ambang terlampaui: ${thresholdText}.`;

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
        `Monthly budget alerts evaluated for expense transaction ${event.transactionId}.`,
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
