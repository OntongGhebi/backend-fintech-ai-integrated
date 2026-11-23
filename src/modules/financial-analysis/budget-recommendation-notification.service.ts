import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';

import { NotificationQueueService } from '../notifications/notifications-queue.service';
import { NotificationsService } from '../notifications/notifications.service';

export type BudgetRecommendationNotificationStatus =
  'ACCEPTED' | 'REJECTED' | 'DEFERRED' | 'APPLIED' | 'EVALUATED';

export interface BudgetRecommendationNotificationInput {
  userId: string;
  recommendationId: string;
  budgetName: string | null;
  targetMonth: Date;
  status: BudgetRecommendationNotificationStatus;
  currentAllocation: string;
  proposedAllocation: string;
  deferredUntil?: Date | null;
}

interface NotificationContent {
  title: string;
  message: string;
}

interface ExternalNotificationInput {
  userId: string;
  type: string;
  content: NotificationContent;
  channel: NotificationChannel.EMAIL | NotificationChannel.TELEGRAM;
  idempotencyKey: string;
  data: Prisma.InputJsonValue;
}

@Injectable()
export class BudgetRecommendationNotificationService {
  private readonly logger = new Logger(
    BudgetRecommendationNotificationService.name,
  );

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationQueueService: NotificationQueueService,
  ) {}

  async notifyLifecycleChanged(
    input: BudgetRecommendationNotificationInput,
  ): Promise<void> {
    const content = this.buildContent(input);
    const type = `BUDGET_RECOMMENDATION_${input.status}`;

    const detailData = {
      recommendationId: input.recommendationId,
      budgetName: input.budgetName,
      targetMonth: input.targetMonth.toISOString(),
      status: input.status,
      currentAllocation: input.currentAllocation,
      proposedAllocation: input.proposedAllocation,
      deferredUntil: input.deferredUntil?.toISOString() ?? null,
      currency: 'IDR',
    };

    const idempotencyBase = `budget-recommendation:${input.recommendationId}:${input.status}`;

    try {
      await this.notificationsService.create({
        userId: input.userId,
        type,
        title: content.title,
        message: content.message,
        channel: NotificationChannel.IN_APP,
        idempotencyKey: `${idempotencyBase}:IN_APP`,
        data: detailData,
      });
    } catch (error) {
      this.logNotificationError('IN_APP', input.recommendationId, error);
    }

    let preferences: Awaited<
      ReturnType<NotificationsService['getMyPreferences']>
    >;

    try {
      preferences = await this.notificationsService.getMyPreferences(
        input.userId,
      );
    } catch (error) {
      this.logNotificationError('PREFERENCES', input.recommendationId, error);
      return;
    }

    if (preferences.emailEnabled) {
      await this.createExternalNotification({
        userId: input.userId,
        type,
        content,
        channel: NotificationChannel.EMAIL,
        idempotencyKey: `${idempotencyBase}:EMAIL`,
        data: detailData,
      });
    }

    if (preferences.telegramEnabled) {
      await this.createExternalNotification({
        userId: input.userId,
        type,
        content,
        channel: NotificationChannel.TELEGRAM,
        idempotencyKey: `${idempotencyBase}:TELEGRAM`,
        data: detailData,
      });
    }
  }

  private buildContent(
    input: BudgetRecommendationNotificationInput,
  ): NotificationContent {
    const budgetName = input.budgetName?.trim() || 'Anggaran';

    const monthLabel = new Intl.DateTimeFormat('id-ID', {
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    }).format(input.targetMonth);

    const currentAllocation = this.formatRupiah(input.currentAllocation);
    const proposedAllocation = this.formatRupiah(input.proposedAllocation);

    switch (input.status) {
      case 'ACCEPTED':
        return {
          title: 'Rekomendasi anggaran disetujui',
          message:
            `Rekomendasi untuk ${budgetName} pada ${monthLabel} telah disetujui. ` +
            `Alokasi saat ini ${currentAllocation} dan usulan alokasi ${proposedAllocation}. ` +
            'Anggaran belum berubah sampai rekomendasi diterapkan.',
        };

      case 'REJECTED':
        return {
          title: 'Rekomendasi anggaran ditolak',
          message:
            `Rekomendasi untuk ${budgetName} pada ${monthLabel} telah ditolak. ` +
            'Alokasi anggaran tidak mengalami perubahan.',
        };

      case 'DEFERRED': {
        const deferredDate = input.deferredUntil
          ? new Intl.DateTimeFormat('id-ID', {
              dateStyle: 'long',
              timeZone: 'Asia/Jakarta',
            }).format(input.deferredUntil)
          : null;

        return {
          title: 'Rekomendasi anggaran ditunda',
          message: deferredDate
            ? `Rekomendasi untuk ${budgetName} pada ${monthLabel} ditunda hingga ${deferredDate}.`
            : `Rekomendasi untuk ${budgetName} pada ${monthLabel} telah ditunda.`,
        };
      }

      case 'APPLIED':
        return {
          title: 'Rekomendasi anggaran diterapkan',
          message:
            `Rekomendasi untuk ${budgetName} pada ${monthLabel} berhasil diterapkan. ` +
            `Alokasi anggaran berubah dari ${currentAllocation} menjadi ${proposedAllocation}.`,
        };

      case 'EVALUATED':
        return {
          title: 'Evaluasi rekomendasi selesai',
          message:
            `Evaluasi rekomendasi anggaran ${budgetName} untuk ${monthLabel} telah selesai. ` +
            'Lihat halaman Financial Well-being untuk mengetahui hasil evaluasinya.',
        };
    }
  }

  private async createExternalNotification(
    input: ExternalNotificationInput,
  ): Promise<void> {
    try {
      const notification = await this.notificationsService.create({
        userId: input.userId,
        type: input.type,
        title: input.content.title,
        message: input.content.message,
        channel: input.channel,
        idempotencyKey: input.idempotencyKey,
        data: input.data,
      });

      await this.notificationQueueService.enqueueDelivery(notification.id);
    } catch (error) {
      this.logNotificationError(input.channel, input.type, error);
    }
  }

  private formatRupiah(value: string): string {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
      return `Rp${value}`;
    }

    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    })
      .format(amount)
      .replace(/\s/g, '');
  }

  private logNotificationError(
    channel: string,
    reference: string,
    error: unknown,
  ): void {
    const message = error instanceof Error ? error.message : String(error);

    this.logger.error(
      `Failed to create ${channel} notification (${reference}): ${message}`,
    );
  }
}
