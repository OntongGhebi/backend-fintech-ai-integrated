import { Test, TestingModule } from '@nestjs/testing';
import { Job, UnrecoverableError } from 'bullmq';
import { UnprocessableEntityException } from '@nestjs/common';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';
import { NotificationStatus } from 'src/database/enums/notification-status.enum';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { EmailService } from 'src/integrations/email/email.service';
import { TelegramService } from 'src/modules/telegram/services/telegram.service';

import {
  NOTIFICATION_DELIVERY_JOB,
  NOTIFICATION_JOB_ATTEMPTS,
} from '../notifications.constants';
import { NotificationDeliveryJob } from '../types/notification-delivery-job.type';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';

describe('NotificationDeliveryProcessor', () => {
  let processor: NotificationDeliveryProcessor;

  const prisma = {
    notification: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const emailService = {
    sendNotificationEmail: jest.fn(),
  };

  const telegramService = {
    sendMessage: jest.fn(),
  };

  const notification = {
    id: 'notification-1',
    userId: 'user-1',
    channel: NotificationChannel.EMAIL,
    status: NotificationStatus.FAILED,
    title: 'Budget alert',
    message: 'Your budget is almost exhausted.',
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      telegramAccounts: [
        {
          telegramUserId: '123456789',
          isVerified: true,
          unlinkedAt: null,
        },
      ],
    },
  };

  const createJob = (
    overrides: {
      name?: string;
      notificationId?: string;
      attemptsMade?: number;
      attempts?: number;
    } = {},
  ): Job<NotificationDeliveryJob> =>
    ({
      name: overrides.name ?? NOTIFICATION_DELIVERY_JOB,
      data: {
        notificationId: overrides.notificationId ?? 'notification-1',
      },
      attemptsMade: overrides.attemptsMade ?? 0,
      opts: {
        attempts: overrides.attempts ?? NOTIFICATION_JOB_ATTEMPTS,
      },
    }) as unknown as Job<NotificationDeliveryJob>;

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.notification.findUnique.mockResolvedValue({
      ...notification,
      user: {
        ...notification.user,
        telegramAccounts: [...notification.user.telegramAccounts],
      },
    });

    prisma.notification.update.mockResolvedValue({});
    emailService.sendNotificationEmail.mockResolvedValue(undefined);
    telegramService.sendMessage.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDeliveryProcessor,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: EmailService,
          useValue: emailService,
        },
        {
          provide: TelegramService,
          useValue: telegramService,
        },
      ],
    }).compile();

    processor = module.get(NotificationDeliveryProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should reject an unsupported job name', async () => {
    const job = createJob({ name: 'unsupported-job' });

    await expect(processor.process(job)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    expect(prisma.notification.findUnique).not.toHaveBeenCalled();
  });

  it('should reject a job without a notification ID', async () => {
    const job = createJob({ notificationId: '' });

    await expect(processor.process(job)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    expect(prisma.notification.findUnique).not.toHaveBeenCalled();
  });

  it('should ignore a notification that no longer exists', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce(null);

    await expect(processor.process(createJob())).resolves.toBeUndefined();

    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('should not externally deliver an in-app notification', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce({
      ...notification,
      channel: NotificationChannel.IN_APP,
    });

    await processor.process(createJob());

    expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
    expect(telegramService.sendMessage).not.toHaveBeenCalled();
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('should not send a notification that is already SENT', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce({
      ...notification,
      status: NotificationStatus.SENT,
    });

    await processor.process(createJob());

    expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
    expect(telegramService.sendMessage).not.toHaveBeenCalled();
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('should send an email and update the status to SENT', async () => {
    await processor.process(createJob());

    expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
      'user@example.com',
      'Test User',
      'Budget alert',
      'Your budget is almost exhausted.',
    );

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: { status: NotificationStatus.SENT },
    });

    expect(telegramService.sendMessage).not.toHaveBeenCalled();
  });

  it('should retry a temporary provider failure before the final attempt', async () => {
    const providerError = new Error('Temporary email provider failure');

    emailService.sendNotificationEmail.mockRejectedValueOnce(providerError);

    const job = createJob({
      attemptsMade: 0,
      attempts: 3,
    });

    await expect(processor.process(job)).rejects.toThrow(
      'Temporary email provider failure',
    );

    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('should mark the notification FAILED after the final failed attempt', async () => {
    const providerError = new Error('Email provider unavailable');

    emailService.sendNotificationEmail.mockRejectedValueOnce(providerError);

    const job = createJob({
      attemptsMade: 2,
      attempts: 3,
    });

    await expect(processor.process(job)).rejects.toThrow(
      'Email provider unavailable',
    );

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: { status: NotificationStatus.FAILED },
    });
  });

  it('should stop retrying when a permanent delivery error occurs', async () => {
    const permanentError = new UnprocessableEntityException(
      'Invalid notification destination',
    );

    emailService.sendNotificationEmail.mockRejectedValueOnce(permanentError);

    const job = createJob({
      attemptsMade: 0,
      attempts: 3,
    });

    await expect(processor.process(job)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: { status: NotificationStatus.FAILED },
    });
  });

  it('should send Telegram notifications through the existing Telegram service', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce({
      ...notification,
      channel: NotificationChannel.TELEGRAM,
    });

    await processor.process(createJob());

    expect(telegramService.sendMessage).toHaveBeenCalledWith({
      chatId: '123456789',
      text: 'Budget alert\n\nYour budget is almost exhausted.',
    });

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: { status: NotificationStatus.SENT },
    });

    expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('should mark the notification FAILED if no verified Telegram account exists', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce({
      ...notification,
      channel: NotificationChannel.TELEGRAM,
      user: {
        ...notification.user,
        telegramAccounts: [],
      },
    });

    const job = createJob();

    await expect(processor.process(job)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: { status: NotificationStatus.FAILED },
    });

    expect(telegramService.sendMessage).not.toHaveBeenCalled();
  });

  it('should not mark a notification SENT if persisting the success status fails', async () => {
    prisma.notification.update.mockRejectedValueOnce(
      new Error('Database write failed'),
    );

    await expect(processor.process(createJob())).rejects.toThrow(
      'Database write failed',
    );

    expect(emailService.sendNotificationEmail).toHaveBeenCalledTimes(1);
  });
});
