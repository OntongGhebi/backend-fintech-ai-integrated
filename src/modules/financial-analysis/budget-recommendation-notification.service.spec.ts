import { NotificationChannel } from 'src/database/enums/notification-channel.enum';

import {
  BudgetRecommendationNotificationService,
  BudgetRecommendationNotificationInput,
} from './budget-recommendation-notification.service';

describe('BudgetRecommendationNotificationService', () => {
  let service: BudgetRecommendationNotificationService;

  let notificationsService: {
    create: jest.Mock;
    getMyPreferences: jest.Mock;
  };

  let notificationQueueService: {
    enqueueDelivery: jest.Mock;
  };

  const baseInput: BudgetRecommendationNotificationInput = {
    userId: 'user-1',
    recommendationId: 'recommendation-1',
    budgetName: 'Monthly Food',
    targetMonth: new Date('2026-12-01T00:00:00.000Z'),
    status: 'ACCEPTED',
    currentAllocation: '500000',
    proposedAllocation: '600000',
  };

  beforeEach(() => {
    notificationsService = {
      create: jest.fn().mockImplementation(async (input) => ({
        id: `notification-${String(input.channel).toLowerCase()}`,
        ...input,
      })),
      getMyPreferences: jest.fn().mockResolvedValue({
        emailEnabled: false,
        telegramEnabled: false,
      }),
    };

    notificationQueueService = {
      enqueueDelivery: jest.fn().mockResolvedValue({
        jobId: 'job-1',
      }),
    };

    service = new BudgetRecommendationNotificationService(
      notificationsService as any,
      notificationQueueService as any,
    );
  });

  describe('in-app notifications', () => {
    it('creates an in-app notification for ACCEPTED status', async () => {
      await service.notifyLifecycleChanged(baseInput);

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: baseInput.userId,
          type: 'BUDGET_RECOMMENDATION_ACCEPTED',
          title: 'Rekomendasi anggaran disetujui',
          channel: NotificationChannel.IN_APP,
        }),
      );
    });

    it('clarifies that accepting a recommendation does not apply the allocation', async () => {
      await service.notifyLifecycleChanged(baseInput);

      const notification = notificationsService.create.mock.calls[0][0];

      expect(notification.message).toContain(
        'Anggaran belum berubah sampai rekomendasi diterapkan.',
      );
      expect(notification.message).toContain('Rp500.000');
      expect(notification.message).toContain('Rp600.000');
    });

    it('creates an in-app notification for REJECTED status', async () => {
      await service.notifyLifecycleChanged({
        ...baseInput,
        status: 'REJECTED',
      });

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BUDGET_RECOMMENDATION_REJECTED',
          title: 'Rekomendasi anggaran ditolak',
          channel: NotificationChannel.IN_APP,
        }),
      );
    });

    it('creates an in-app notification for DEFERRED status with the defer date', async () => {
      await service.notifyLifecycleChanged({
        ...baseInput,
        status: 'DEFERRED',
        deferredUntil: new Date('2026-11-25T00:00:00.000Z'),
      });

      const notification = notificationsService.create.mock.calls[0][0];

      expect(notification).toMatchObject({
        type: 'BUDGET_RECOMMENDATION_DEFERRED',
        title: 'Rekomendasi anggaran ditunda',
        channel: NotificationChannel.IN_APP,
      });

      expect(notification.message).toContain('25 November 2026');
    });

    it('creates an in-app notification for APPLIED status with the allocation change', async () => {
      await service.notifyLifecycleChanged({
        ...baseInput,
        status: 'APPLIED',
      });

      const notification = notificationsService.create.mock.calls[0][0];

      expect(notification).toMatchObject({
        type: 'BUDGET_RECOMMENDATION_APPLIED',
        title: 'Rekomendasi anggaran diterapkan',
        channel: NotificationChannel.IN_APP,
      });

      expect(notification.message).toContain('Rp500.000');
      expect(notification.message).toContain('Rp600.000');
    });

    it('creates an in-app notification for EVALUATED status', async () => {
      await service.notifyLifecycleChanged({
        ...baseInput,
        status: 'EVALUATED',
      });

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BUDGET_RECOMMENDATION_EVALUATED',
          title: 'Evaluasi rekomendasi selesai',
          channel: NotificationChannel.IN_APP,
        }),
      );
    });

    it('uses a fallback budget name when the name is null', async () => {
      await service.notifyLifecycleChanged({
        ...baseInput,
        budgetName: null,
      });

      const notification = notificationsService.create.mock.calls[0][0];

      expect(notification.message).toContain('Anggaran');
    });
  });

  describe('external notification preferences', () => {
    it('creates email and Telegram notifications when both channels are enabled', async () => {
      notificationsService.getMyPreferences.mockResolvedValue({
        emailEnabled: true,
        telegramEnabled: true,
      });

      await service.notifyLifecycleChanged(baseInput);

      expect(notificationsService.create).toHaveBeenCalledTimes(3);

      expect(notificationsService.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          channel: NotificationChannel.EMAIL,
        }),
      );

      expect(notificationsService.create).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          channel: NotificationChannel.TELEGRAM,
        }),
      );

      expect(notificationQueueService.enqueueDelivery).toHaveBeenCalledTimes(2);

      expect(notificationQueueService.enqueueDelivery).toHaveBeenNthCalledWith(
        1,
        'notification-email',
      );

      expect(notificationQueueService.enqueueDelivery).toHaveBeenNthCalledWith(
        2,
        'notification-telegram',
      );
    });

    it('does not create external notifications when both channels are disabled', async () => {
      await service.notifyLifecycleChanged(baseInput);

      expect(notificationsService.create).toHaveBeenCalledTimes(1);

      expect(notificationQueueService.enqueueDelivery).not.toHaveBeenCalled();
    });

    it('creates only an email notification when only email is enabled', async () => {
      notificationsService.getMyPreferences.mockResolvedValue({
        emailEnabled: true,
        telegramEnabled: false,
      });

      await service.notifyLifecycleChanged(baseInput);

      expect(notificationsService.create).toHaveBeenCalledTimes(2);

      expect(notificationsService.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          channel: NotificationChannel.EMAIL,
        }),
      );

      expect(notificationQueueService.enqueueDelivery).toHaveBeenCalledTimes(1);
    });

    it('creates only a Telegram notification when only Telegram is enabled', async () => {
      notificationsService.getMyPreferences.mockResolvedValue({
        emailEnabled: false,
        telegramEnabled: true,
      });

      await service.notifyLifecycleChanged(baseInput);

      expect(notificationsService.create).toHaveBeenCalledTimes(2);

      expect(notificationsService.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          channel: NotificationChannel.TELEGRAM,
        }),
      );

      expect(notificationQueueService.enqueueDelivery).toHaveBeenCalledTimes(1);
    });

    it('continues with Telegram when email notification creation fails', async () => {
      notificationsService.getMyPreferences.mockResolvedValue({
        emailEnabled: true,
        telegramEnabled: true,
      });

      notificationsService.create
        .mockResolvedValueOnce({
          id: 'in-app-notification',
        })
        .mockRejectedValueOnce(new Error('Email creation failed'))
        .mockResolvedValueOnce({
          id: 'telegram-notification',
        });

      await expect(
        service.notifyLifecycleChanged(baseInput),
      ).resolves.toBeUndefined();

      expect(notificationsService.create).toHaveBeenCalledTimes(3);

      expect(notificationQueueService.enqueueDelivery).toHaveBeenCalledWith(
        'telegram-notification',
      );
    });

    it('continues with Telegram when email queue delivery fails', async () => {
      notificationsService.getMyPreferences.mockResolvedValue({
        emailEnabled: true,
        telegramEnabled: true,
      });

      notificationQueueService.enqueueDelivery
        .mockRejectedValueOnce(new Error('Email queue failed'))
        .mockResolvedValueOnce({
          jobId: 'telegram-job',
        });

      await expect(
        service.notifyLifecycleChanged(baseInput),
      ).resolves.toBeUndefined();

      expect(notificationQueueService.enqueueDelivery).toHaveBeenCalledTimes(2);
    });
  });

  describe('failure handling', () => {
    it('does not throw when external notification creation fails', async () => {
      notificationsService.getMyPreferences.mockResolvedValue({
        emailEnabled: true,
        telegramEnabled: false,
      });

      notificationsService.create
        .mockResolvedValueOnce({
          id: 'in-app-notification',
        })
        .mockRejectedValueOnce(new Error('Email service unavailable'));

      await expect(
        service.notifyLifecycleChanged(baseInput),
      ).resolves.toBeUndefined();
    });

    it('does not throw when preference retrieval fails', async () => {
      notificationsService.getMyPreferences.mockRejectedValue(
        new Error('Preference service unavailable'),
      );

      await expect(
        service.notifyLifecycleChanged(baseInput),
      ).resolves.toBeUndefined();

      expect(notificationsService.create).toHaveBeenCalledTimes(1);

      expect(notificationQueueService.enqueueDelivery).not.toHaveBeenCalled();
    });

    it('does not throw when in-app notification creation fails', async () => {
      notificationsService.create.mockRejectedValueOnce(
        new Error('In-app notification failed'),
      );

      await expect(
        service.notifyLifecycleChanged(baseInput),
      ).resolves.toBeUndefined();

      expect(notificationsService.getMyPreferences).toHaveBeenCalledWith(
        baseInput.userId,
      );
    });

    it('does not throw when queue delivery fails', async () => {
      notificationsService.getMyPreferences.mockResolvedValue({
        emailEnabled: true,
        telegramEnabled: false,
      });

      notificationQueueService.enqueueDelivery.mockRejectedValue(
        new Error('Queue unavailable'),
      );

      await expect(
        service.notifyLifecycleChanged(baseInput),
      ).resolves.toBeUndefined();
    });
  });
});
