import { Test, TestingModule } from '@nestjs/testing';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';

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
    });

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
});
