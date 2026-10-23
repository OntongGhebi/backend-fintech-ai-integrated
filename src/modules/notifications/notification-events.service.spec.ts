import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../../generated/prisma/client.js';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';
import { PrismaService } from 'src/database/prisma/prisma.service';

import { NotificationQueueService } from './notifications-queue.service';
import { NotificationsService } from './notifications.service';
import { NotificationEventsService } from './notification-events.service';

describe('NotificationEventsService', () => {
  let service: NotificationEventsService;

  const notificationsServiceMock = {
    create: jest.fn(),
    getMyPreferences: jest.fn(),
  };

  const notificationQueueServiceMock = {
    enqueueDelivery: jest.fn(),
  };

  const prismaMock = {
    budget: { findMany: jest.fn() },
    transaction: { aggregate: jest.fn() },
  };

  const event = {
    userId: 'user-1',
    recurringTransactionId: 'recurring-1',
    transactionId: 'transaction-1',
    transactionType: 'EXPENSE',
    amount: '150000',
    description: 'Monthly subscription',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    notificationsServiceMock.create.mockImplementation(
      async (input: { channel: NotificationChannel }) => ({
        id: `notification-${input.channel.toLowerCase()}`,
        ...input,
      }),
    );

    notificationsServiceMock.getMyPreferences.mockResolvedValue({
      emailEnabled: true,
      telegramEnabled: true,
      budgetAlertEnabled: true,
    });

    prismaMock.budget.findMany.mockResolvedValue([]);
    prismaMock.transaction.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

    notificationQueueServiceMock.enqueueDelivery.mockResolvedValue({
      jobId: 'notification-job-1',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEventsService,
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
        {
          provide: NotificationQueueService,
          useValue: notificationQueueServiceMock,
        },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(NotificationEventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create in-app and enqueue enabled external channels', async () => {
    await service.recurringTransactionExecuted(event);

    expect(notificationsServiceMock.create).toHaveBeenCalledTimes(3);

    expect(notificationsServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'RECURRING_TRANSACTION_EXECUTED',
        channel: NotificationChannel.IN_APP,
      }),
    );

    expect(notificationQueueServiceMock.enqueueDelivery).toHaveBeenCalledTimes(
      2,
    );

    expect(notificationQueueServiceMock.enqueueDelivery).toHaveBeenCalledWith(
      `notification-${NotificationChannel.EMAIL.toLowerCase()}`,
    );

    expect(notificationQueueServiceMock.enqueueDelivery).toHaveBeenCalledWith(
      `notification-${NotificationChannel.TELEGRAM.toLowerCase()}`,
    );
  });

  it('should respect disabled email and Telegram preferences', async () => {
    notificationsServiceMock.getMyPreferences.mockResolvedValue({
      emailEnabled: false,
      telegramEnabled: false,
    });

    await service.recurringTransactionExecuted(event);

    expect(notificationsServiceMock.create).toHaveBeenCalledTimes(1);

    expect(notificationsServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: NotificationChannel.IN_APP,
      }),
    );

    expect(notificationQueueServiceMock.enqueueDelivery).not.toHaveBeenCalled();
  });

  it('should still enqueue Telegram if email queueing fails', async () => {
    notificationQueueServiceMock.enqueueDelivery
      .mockRejectedValueOnce(new Error('Email queue unavailable'))
      .mockResolvedValueOnce({ jobId: 'telegram-job' });

    await expect(
      service.recurringTransactionExecuted(event),
    ).resolves.toBeUndefined();

    expect(notificationQueueServiceMock.enqueueDelivery).toHaveBeenCalledTimes(
      2,
    );
  });

  it('should omit the description when it is empty', async () => {
    await service.recurringTransactionExecuted({
      ...event,
      description: '  ',
    });

    const inAppInput = notificationsServiceMock.create.mock.calls[0][0];

    expect(inAppInput.message).not.toContain('Keterangan:');
  });

  describe('budgetExpenseCreated', () => {
    const budget = {
      id: 'budget-1',
      userId: 'user-1',
      name: 'Monthly food',
      amount: new Prisma.Decimal(1000),
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-10-31T00:00:00.000Z'),
      categoryId: null,
      alerts: [
        {
          id: 'alert-app',
          thresholdPercentage: 90,
          channel: NotificationChannel.IN_APP,
          isEnabled: true,
        },
        {
          id: 'alert-email',
          thresholdPercentage: 90,
          channel: NotificationChannel.EMAIL,
          isEnabled: true,
        },
      ],
    };
    const expenseEvent = {
      userId: 'user-1',
      transactionId: 'transaction-budget-1',
      type: 'EXPENSE',
      amount: '80',
      categoryId: null,
      transactionDate: new Date('2026-10-23T10:00:00.000Z'),
    };

    beforeEach(() => {
      prismaMock.budget.findMany.mockResolvedValue([budget]);
      prismaMock.transaction.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(930) },
      });
      notificationsServiceMock.getMyPreferences.mockResolvedValue({
        budgetAlertEnabled: true,
        emailEnabled: true,
        telegramEnabled: true,
      });
    });

    it('should notify in-app and queue email when usage crosses 90 percent', async () => {
      await service.budgetExpenseCreated(expenseEvent);

      expect(notificationsServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BUDGET_ALERT',
          channel: NotificationChannel.IN_APP,
        }),
      );
      expect(notificationsServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BUDGET_ALERT',
          channel: NotificationChannel.EMAIL,
        }),
      );
      expect(notificationQueueServiceMock.enqueueDelivery).toHaveBeenCalledWith(
        `notification-${NotificationChannel.EMAIL.toLowerCase()}`,
      );
    });

    it('should not repeat an alert if usage was already above the threshold', async () => {
      prismaMock.transaction.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(960) },
      });
      await service.budgetExpenseCreated({ ...expenseEvent, amount: '30' });
      expect(notificationsServiceMock.create).not.toHaveBeenCalled();
      expect(
        notificationQueueServiceMock.enqueueDelivery,
      ).not.toHaveBeenCalled();
    });

    it('should not alert when the threshold is not crossed', async () => {
      prismaMock.transaction.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(850) },
      });
      await service.budgetExpenseCreated({ ...expenseEvent, amount: '10' });
      expect(notificationsServiceMock.create).not.toHaveBeenCalled();
    });

    it('should not trigger a 95 percent alert when usage rises from 85 to 93 percent', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        {
          ...budget,
          alerts: [
            {
              id: 'alert-app-95',
              thresholdPercentage: 95,
              channel: NotificationChannel.IN_APP,
              isEnabled: true,
            },
            {
              id: 'alert-email-95',
              thresholdPercentage: 95,
              channel: NotificationChannel.EMAIL,
              isEnabled: true,
            },
          ],
        },
      ]);
      prismaMock.transaction.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(930) },
      });

      await service.budgetExpenseCreated({ ...expenseEvent, amount: '80' });

      expect(notificationsServiceMock.create).not.toHaveBeenCalled();
      expect(
        notificationQueueServiceMock.enqueueDelivery,
      ).not.toHaveBeenCalled();
    });

    it('should respect budgetAlertEnabled preference', async () => {
      notificationsServiceMock.getMyPreferences.mockResolvedValue({
        budgetAlertEnabled: false,
        emailEnabled: true,
        telegramEnabled: true,
      });
      await service.budgetExpenseCreated(expenseEvent);
      expect(prismaMock.budget.findMany).not.toHaveBeenCalled();
      expect(notificationsServiceMock.create).not.toHaveBeenCalled();
    });

    it('should send in-app notification without email when email preference is disabled', async () => {
      notificationsServiceMock.getMyPreferences.mockResolvedValue({
        budgetAlertEnabled: true,
        emailEnabled: false,
        telegramEnabled: false,
      });
      await service.budgetExpenseCreated(expenseEvent);
      expect(notificationsServiceMock.create).toHaveBeenCalledTimes(1);
      expect(notificationsServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ channel: NotificationChannel.IN_APP }),
      );
      expect(
        notificationQueueServiceMock.enqueueDelivery,
      ).not.toHaveBeenCalled();
    });

    it('should ignore non-expense transactions', async () => {
      await service.budgetExpenseCreated({ ...expenseEvent, type: 'INCOME' });
      expect(prismaMock.budget.findMany).not.toHaveBeenCalled();
      expect(notificationsServiceMock.getMyPreferences).not.toHaveBeenCalled();
    });

    it('should isolate database/evaluation errors from the caller', async () => {
      prismaMock.budget.findMany.mockRejectedValue(
        new Error('database unavailable'),
      );
      await expect(
        service.budgetExpenseCreated(expenseEvent),
      ).resolves.toBeUndefined();
    });
  });
});
