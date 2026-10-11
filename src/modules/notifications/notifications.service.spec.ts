import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';
import { NotificationStatus } from 'src/database/enums/notification-status.enum';
import { Notification } from '../../../generated/prisma/client';

import {
  NotificationsRepository,
  UpdateNotificationPreferencesInput,
} from './repositories/notifications.repository';
import { NotificationsService } from './notifications.service';
import { CreateNotificationInput } from './types/create-notification-input.type';
import { GetNotificationsOptions } from './types/notification.types';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const repository = {
    create: jest.fn(),
    findManyByUserId: jest.fn(),
    countByUserId: jest.fn(),
    findByIdAndUserId: jest.fn(),
    countUnreadByUserId: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    getOrCreatePreferences: jest.fn(),
    updatePreferences: jest.fn(),
  };

  const createNotification = (
    overrides: Partial<Notification> = {},
  ): Notification =>
    ({
      id: 'notification-1',
      userId: 'user-1',
      type: 'BUDGET_ALERT',
      title: 'Budget alert',
      message: 'Budget usage has reached 80%',
      channel: NotificationChannel.IN_APP,
      status: NotificationStatus.UNREAD,
      readAt: null,
      createdAt: new Date('2026-10-01T10:00:00.000Z'),
      ...overrides,
    }) as Notification;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: NotificationsRepository,
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('create', () => {
    const baseInput: CreateNotificationInput = {
      userId: 'user-1',
      type: 'BUDGET_ALERT',
      title: 'Budget alert',
      message: 'Budget usage has reached 80%',
      channel: NotificationChannel.IN_APP,
    };

    it('should create an in-app notification with UNREAD status by default', async () => {
      const expected = createNotification();

      repository.create.mockResolvedValue(expected);

      const result = await service.create(baseInput);

      expect(repository.create).toHaveBeenCalledWith({
        ...baseInput,
        status: NotificationStatus.UNREAD,
      });
      expect(result).toEqual(expected);
    });

    it('should default an email notification to FAILED until delivery', async () => {
      const input: CreateNotificationInput = {
        ...baseInput,
        channel: NotificationChannel.EMAIL,
      };

      const expected = createNotification({
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.FAILED,
      });

      repository.create.mockResolvedValue(expected);

      const result = await service.create(input);

      expect(repository.create).toHaveBeenCalledWith({
        ...input,
        status: NotificationStatus.FAILED,
      });
      expect(result).toEqual(expected);
    });

    it('should default a Telegram notification to FAILED until delivery', async () => {
      const input: CreateNotificationInput = {
        ...baseInput,
        channel: NotificationChannel.TELEGRAM,
      };

      repository.create.mockResolvedValue(
        createNotification({
          channel: NotificationChannel.TELEGRAM,
          status: NotificationStatus.FAILED,
        }),
      );

      await service.create(input);

      expect(repository.create).toHaveBeenCalledWith({
        ...input,
        status: NotificationStatus.FAILED,
      });
    });

    it('should respect an explicitly supplied status', async () => {
      const input: CreateNotificationInput = {
        ...baseInput,
        status: NotificationStatus.READ,
      };

      const expected = createNotification({
        status: NotificationStatus.READ,
      });

      repository.create.mockResolvedValue(expected);

      await service.create(input);

      expect(repository.create).toHaveBeenCalledWith({
        ...input,
        status: NotificationStatus.READ,
      });
    });

    it('should propagate repository errors', async () => {
      const error = new Error('Database unavailable');

      repository.create.mockRejectedValue(error);

      await expect(service.create(baseInput)).rejects.toThrow(error);
    });
  });

  describe('findAllByUserId', () => {
    const options: GetNotificationsOptions = {
      page: 2,
      limit: 10,
    };

    it('should return paginated notifications and metadata', async () => {
      const notifications = [
        createNotification({ id: 'notification-1' }),
        createNotification({ id: 'notification-2' }),
      ];

      repository.findManyByUserId.mockResolvedValue(notifications);
      repository.countByUserId.mockResolvedValue(25);

      const result = await service.findAllByUserId('user-1', options);

      expect(repository.findManyByUserId).toHaveBeenCalledWith(
        'user-1',
        options,
      );
      expect(repository.countByUserId).toHaveBeenCalledWith('user-1', {
        status: undefined,
        channel: undefined,
      });

      expect(result).toEqual({
        data: notifications,
        meta: {
          page: 2,
          limit: 10,
          total: 25,
          totalPages: 3,
        },
      });
    });

    it('should pass status and channel filters to the count query', async () => {
      const filteredOptions: GetNotificationsOptions = {
        page: 1,
        limit: 20,
        status: NotificationStatus.UNREAD,
        channel: NotificationChannel.IN_APP,
      };

      repository.findManyByUserId.mockResolvedValue([]);
      repository.countByUserId.mockResolvedValue(0);

      await service.findAllByUserId('user-1', filteredOptions);

      expect(repository.findManyByUserId).toHaveBeenCalledWith(
        'user-1',
        filteredOptions,
      );
      expect(repository.countByUserId).toHaveBeenCalledWith('user-1', {
        status: NotificationStatus.UNREAD,
        channel: NotificationChannel.IN_APP,
      });
    });

    it('should return zero total pages when there are no notifications', async () => {
      repository.findManyByUserId.mockResolvedValue([]);
      repository.countByUserId.mockResolvedValue(0);

      const result = await service.findAllByUserId('user-1', options);

      expect(result).toEqual({
        data: [],
        meta: {
          page: 2,
          limit: 10,
          total: 0,
          totalPages: 0,
        },
      });
    });

    it('should round total pages up when the total is not divisible by the limit', async () => {
      repository.findManyByUserId.mockResolvedValue([]);
      repository.countByUserId.mockResolvedValue(21);

      const result = await service.findAllByUserId('user-1', options);

      expect(result.meta.totalPages).toBe(3);
    });

    it('should propagate errors from the repository', async () => {
      repository.findManyByUserId.mockRejectedValue(
        new Error('Failed to retrieve notifications'),
      );

      repository.countByUserId.mockResolvedValue(0);

      await expect(service.findAllByUserId('user-1', options)).rejects.toThrow(
        'Failed to retrieve notifications',
      );
    });
  });

  describe('findOneByUserId', () => {
    it('should return a notification belonging to the specified user', async () => {
      const notification = createNotification();

      repository.findByIdAndUserId.mockResolvedValue(notification);

      const result = await service.findOneByUserId('notification-1', 'user-1');

      expect(repository.findByIdAndUserId).toHaveBeenCalledWith(
        'notification-1',
        'user-1',
      );
      expect(result).toEqual(notification);
    });

    it('should throw NotFoundException when the notification does not exist or is not owned by the user', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.findOneByUserId('notification-1', 'user-2'),
      ).rejects.toThrow(new NotFoundException('Notification not found'));

      expect(repository.findByIdAndUserId).toHaveBeenCalledWith(
        'notification-1',
        'user-2',
      );
    });

    it('should propagate repository errors', async () => {
      repository.findByIdAndUserId.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(
        service.findOneByUserId('notification-1', 'user-1'),
      ).rejects.toThrow('Database unavailable');
    });
  });

  describe('getUnreadCount', () => {
    it('should return the unread notification count', async () => {
      repository.countUnreadByUserId.mockResolvedValue(5);

      await expect(service.getUnreadCount('user-1')).resolves.toBe(5);

      expect(repository.countUnreadByUserId).toHaveBeenCalledWith('user-1');
    });

    it('should return zero when there are no unread notifications', async () => {
      repository.countUnreadByUserId.mockResolvedValue(0);

      await expect(service.getUnreadCount('user-1')).resolves.toBe(0);
    });

    it('should propagate repository errors', async () => {
      repository.countUnreadByUserId.mockRejectedValue(
        new Error('Count failed'),
      );

      await expect(service.getUnreadCount('user-1')).rejects.toThrow(
        'Count failed',
      );
    });
  });

  describe('markAsRead', () => {
    it('should mark an unread in-app notification as read', async () => {
      const unreadNotification = createNotification({
        status: NotificationStatus.UNREAD,
      });

      const readNotification = createNotification({
        status: NotificationStatus.READ,
        readAt: new Date('2026-10-01T10:05:00.000Z'),
      });

      repository.findByIdAndUserId
        .mockResolvedValueOnce(unreadNotification)
        .mockResolvedValueOnce(readNotification);

      repository.markAsRead.mockResolvedValue(readNotification);

      const result = await service.markAsRead('notification-1', 'user-1');

      expect(repository.markAsRead).toHaveBeenCalledTimes(1);
      expect(repository.markAsRead).toHaveBeenCalledWith(
        'notification-1',
        'user-1',
        expect.any(Date),
      );
      expect(repository.findByIdAndUserId).toHaveBeenCalledTimes(2);
      expect(result).toEqual(readNotification);
    });

    it('should not update an in-app notification that is already read', async () => {
      const readNotification = createNotification({
        status: NotificationStatus.READ,
      });

      repository.findByIdAndUserId.mockResolvedValue(readNotification);

      const result = await service.markAsRead('notification-1', 'user-1');

      expect(repository.markAsRead).not.toHaveBeenCalled();
      expect(repository.findByIdAndUserId).toHaveBeenCalledTimes(2);
      expect(result).toEqual(readNotification);
    });

    it('should reject attempts to mark an email notification as read', async () => {
      repository.findByIdAndUserId.mockResolvedValue(
        createNotification({
          channel: NotificationChannel.EMAIL,
          status: NotificationStatus.SENT,
        }),
      );

      await expect(
        service.markAsRead('notification-1', 'user-1'),
      ).rejects.toThrow(
        new BadRequestException(
          'Only in-app notifications can be marked as read',
        ),
      );

      expect(repository.markAsRead).not.toHaveBeenCalled();
    });

    it('should reject attempts to mark a Telegram notification as read', async () => {
      repository.findByIdAndUserId.mockResolvedValue(
        createNotification({
          channel: NotificationChannel.TELEGRAM,
          status: NotificationStatus.SENT,
        }),
      );

      await expect(
        service.markAsRead('notification-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);

      expect(repository.markAsRead).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the notification is unavailable', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.markAsRead('notification-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);

      expect(repository.markAsRead).not.toHaveBeenCalled();
    });

    it('should propagate errors from the repository update', async () => {
      repository.findByIdAndUserId.mockResolvedValue(
        createNotification({ status: NotificationStatus.UNREAD }),
      );

      repository.markAsRead.mockRejectedValue(
        new Error('Unable to update notification'),
      );

      await expect(
        service.markAsRead('notification-1', 'user-1'),
      ).rejects.toThrow('Unable to update notification');
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all eligible notifications as read and return the updated count', async () => {
      repository.markAllAsRead.mockResolvedValue(4);

      const result = await service.markAllAsRead('user-1');

      expect(repository.markAllAsRead).toHaveBeenCalledWith(
        'user-1',
        expect.any(Date),
      );
      expect(result).toEqual({ updatedCount: 4 });
    });

    it('should return zero when no notifications were updated', async () => {
      repository.markAllAsRead.mockResolvedValue(0);

      await expect(service.markAllAsRead('user-1')).resolves.toEqual({
        updatedCount: 0,
      });
    });

    it('should propagate repository errors', async () => {
      repository.markAllAsRead.mockRejectedValue(
        new Error('Bulk update failed'),
      );

      await expect(service.markAllAsRead('user-1')).rejects.toThrow(
        'Bulk update failed',
      );
    });
  });

  describe('getMyPreferences', () => {
    it('should return the notification preferences for the specified user', async () => {
      const preferences = {
        userId: 'user-1',
        emailEnabled: true,
        telegramEnabled: true,
        budgetAlertEnabled: true,
      };

      repository.getOrCreatePreferences.mockResolvedValue(preferences);

      const result = await service.getMyPreferences('user-1');

      expect(repository.getOrCreatePreferences).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(preferences);
    });

    it('should propagate repository errors', async () => {
      repository.getOrCreatePreferences.mockRejectedValue(
        new Error('Unable to retrieve preferences'),
      );

      await expect(service.getMyPreferences('user-1')).rejects.toThrow(
        'Unable to retrieve preferences',
      );
    });
  });

  describe('updateMyPreferences', () => {
    it('should update the provided preferences', async () => {
      const input: UpdateNotificationPreferencesInput = {
        emailEnabled: false,
        telegramEnabled: true,
      };

      const updatedPreferences = {
        userId: 'user-1',
        emailEnabled: false,
        telegramEnabled: true,
      };

      repository.updatePreferences.mockResolvedValue(updatedPreferences);

      const result = await service.updateMyPreferences('user-1', input);

      expect(repository.updatePreferences).toHaveBeenCalledWith(
        'user-1',
        input,
      );
      expect(result).toEqual(updatedPreferences);
    });

    it('should reject an empty preference update', async () => {
      const input = {} as UpdateNotificationPreferencesInput;

      await expect(
        service.updateMyPreferences('user-1', input),
      ).rejects.toThrow(
        new BadRequestException(
          'At least one notification preference must be provided',
        ),
      );

      expect(repository.updatePreferences).not.toHaveBeenCalled();
    });

    it('should reject an update when all provided values are undefined', async () => {
      const input = {
        emailEnabled: undefined,
        telegramEnabled: undefined,
      } as UpdateNotificationPreferencesInput;

      await expect(
        service.updateMyPreferences('user-1', input),
      ).rejects.toThrow(BadRequestException);

      expect(repository.updatePreferences).not.toHaveBeenCalled();
    });

    it('should accept false as a valid preference value', async () => {
      const input: UpdateNotificationPreferencesInput = {
        emailEnabled: false,
      };

      repository.updatePreferences.mockResolvedValue({
        userId: 'user-1',
        emailEnabled: false,
      });

      await service.updateMyPreferences('user-1', input);

      expect(repository.updatePreferences).toHaveBeenCalledWith(
        'user-1',
        input,
      );
    });

    it('should propagate repository errors', async () => {
      const input: UpdateNotificationPreferencesInput = {
        emailEnabled: false,
      };

      repository.updatePreferences.mockRejectedValue(
        new Error('Unable to update preferences'),
      );

      await expect(
        service.updateMyPreferences('user-1', input),
      ).rejects.toThrow('Unable to update preferences');
    });
  });
});
