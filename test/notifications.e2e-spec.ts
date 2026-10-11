import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from '../src/modules/notifications/notifications.controller';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { AccessTokenGuard } from '../src/modules/auth/guards/access-token.guard';
import { NotificationChannel } from '../src/database/enums/notification-channel.enum';
import { NotificationStatus } from '../src/database/enums/notification-status.enum';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';

jest.setTimeout(30000);

describe('Notifications E2E', () => {
  let app: INestApplication;

  const service = {
    getMyPreferences: jest.fn(),
    updateMyPreferences: jest.fn(),
    getUnreadCount: jest.fn(),
    findAllByUserId: jest.fn(),
    markAllAsRead: jest.fn(),
    markAsRead: jest.fn(),
    findOneByUserId: jest.fn(),
  };

  const notificationId = '550e8400-e29b-41d4-a716-446655440000';
  const otherNotificationId = '650e8400-e29b-41d4-a716-446655440001';

  const notification = {
    id: notificationId,
    userId: 'user-1',
    type: 'BUDGET_ALERT',
    title: 'Budget alert',
    message: 'Your budget usage has reached 80%',
    channel: NotificationChannel.IN_APP,
    status: NotificationStatus.UNREAD,
    readAt: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
  };

  const preferences = {
    id: 'preference-1',
    userId: 'user-1',
    telegramEnabled: true,
    emailEnabled: true,
    budgetAlertEnabled: true,
    dailySummaryEnabled: false,
    weeklySummaryEnabled: false,
    monthlySummaryEnabled: false,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => {
            getRequest: () => {
              headers: Record<string, string | undefined>;
              user?: { id: string };
            };
          };
        }) => {
          const req = context.switchToHttp().getRequest();
          const authorization = req.headers.authorization;

          if (!authorization?.startsWith('Bearer ')) {
            throw new UnauthorizedException();
          }

          // Simulasi dua identitas pengguna untuk pengujian ownership.
          req.user = {
            id: authorization === 'Bearer user-2-token' ? 'user-2' : 'user-1',
          };

          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const authenticated = (token = 'user-1-token') => ({
    Authorization: `Bearer ${token}`,
  });

  describe('Authentication', () => {
    it('should reject a request without an access token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .expect(401);

      expect(service.findAllByUserId).not.toHaveBeenCalled();
    });

    it('should reject preferences access without an access token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/notifications/preferences')
        .expect(401);
    });
  });

  describe('GET /api/v1/notifications', () => {
    it('should return a paginated notification list', async () => {
      service.findAllByUserId.mockResolvedValue({
        data: [notification],
        meta: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/notifications?page=1&limit=10')
        .set(authenticated())
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(notificationId);
      expect(response.body.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(service.findAllByUserId).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          page: 1,
          limit: 10,
        }),
      );
    });

    it('should pass notification filters to the service', async () => {
      service.findAllByUserId.mockResolvedValue({
        data: [],
        meta: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
        },
      });

      await request(app.getHttpServer())
        .get(
          '/api/v1/notifications?page=1&limit=10&status=UNREAD&channel=IN_APP',
        )
        .set(authenticated())
        .expect(200);

      expect(service.findAllByUserId).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          status: NotificationStatus.UNREAD,
          channel: NotificationChannel.IN_APP,
        }),
      );
    });

    it('should reject an invalid notification status filter', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/notifications?status=INVALID_STATUS')
        .set(authenticated())
        .expect(400);

      expect(service.findAllByUserId).not.toHaveBeenCalled();
    });

    it('should reject an unknown query parameter', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/notifications?unexpected=value')
        .set(authenticated())
        .expect(400);
    });

    it('should return an empty list when there are no notifications', async () => {
      service.findAllByUserId.mockResolvedValue({
        data: [],
        meta: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/notifications?page=1&limit=10')
        .set(authenticated())
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.meta.total).toBe(0);
    });
  });

  describe('GET /api/v1/notifications/:notificationId', () => {
    it('should return a notification belonging to the current user', async () => {
      service.findOneByUserId.mockResolvedValue(notification);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/notifications/${notificationId}`)
        .set(authenticated())
        .expect(200);

      expect(response.body.id).toBe(notificationId);
      expect(service.findOneByUserId).toHaveBeenCalledWith(
        notificationId,
        'user-1',
      );
    });

    it('should reject an invalid UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/notifications/not-a-uuid')
        .set(authenticated())
        .expect(400);

      expect(service.findOneByUserId).not.toHaveBeenCalled();
    });

    it('should return 404 when the notification does not exist or is not owned by the user', async () => {
      service.findOneByUserId.mockRejectedValue(
        new NotFoundException('Notification not found'),
      );

      await request(app.getHttpServer())
        .get(`/api/v1/notifications/${otherNotificationId}`)
        .set(authenticated())
        .expect(404);

      expect(service.findOneByUserId).toHaveBeenCalledWith(
        otherNotificationId,
        'user-1',
      );
    });

    it('should use the authenticated user identity for ownership checks', async () => {
      service.findOneByUserId.mockResolvedValue({
        ...notification,
        id: otherNotificationId,
        userId: 'user-2',
      });

      await request(app.getHttpServer())
        .get(`/api/v1/notifications/${otherNotificationId}`)
        .set(authenticated('user-2-token'))
        .expect(200);

      expect(service.findOneByUserId).toHaveBeenCalledWith(
        otherNotificationId,
        'user-2',
      );
    });
  });

  describe('GET /api/v1/notifications/unread-count', () => {
    it('should return the unread count for the current user', async () => {
      service.getUnreadCount.mockResolvedValue(3);

      const response = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set(authenticated())
        .expect(200);

      expect(response.body).toEqual({ count: 3 });
      expect(service.getUnreadCount).toHaveBeenCalledWith('user-1');
    });

    it('should return zero when the user has no unread notifications', async () => {
      service.getUnreadCount.mockResolvedValue(0);

      const response = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set(authenticated())
        .expect(200);

      expect(response.body).toEqual({ count: 0 });
    });
  });

  describe('PATCH /api/v1/notifications/:notificationId/read', () => {
    it('should mark a notification as read', async () => {
      const readNotification = {
        ...notification,
        status: NotificationStatus.READ,
        readAt: '2026-10-01T10:05:00.000Z',
      };

      service.markAsRead.mockResolvedValue(readNotification);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .set(authenticated())
        .expect(200);

      expect(response.body.status).toBe(NotificationStatus.READ);
      expect(service.markAsRead).toHaveBeenCalledWith(notificationId, 'user-1');
    });

    it('should reject an invalid notification UUID', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/notifications/invalid-id/read')
        .set(authenticated())
        .expect(400);

      expect(service.markAsRead).not.toHaveBeenCalled();
    });

    it('should return 404 when the notification is unavailable', async () => {
      service.markAsRead.mockRejectedValue(
        new NotFoundException('Notification not found'),
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .set(authenticated())
        .expect(404);
    });

    it('should reject a channel that cannot be marked as read', async () => {
      service.markAsRead.mockRejectedValue(
        new BadRequestException(
          'Only in-app notifications can be marked as read',
        ),
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .set(authenticated())
        .expect(400);
    });
  });

  describe('PATCH /api/v1/notifications/read-all', () => {
    it('should return the number of notifications updated', async () => {
      service.markAllAsRead.mockResolvedValue({ updatedCount: 5 });

      const response = await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set(authenticated())
        .expect(200);

      expect(response.body).toEqual({ updatedCount: 5 });
      expect(service.markAllAsRead).toHaveBeenCalledWith('user-1');
    });

    it('should return zero when there are no unread notifications', async () => {
      service.markAllAsRead.mockResolvedValue({ updatedCount: 0 });

      const response = await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set(authenticated())
        .expect(200);

      expect(response.body).toEqual({ updatedCount: 0 });
    });

    it('should reject an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .expect(401);

      expect(service.markAllAsRead).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/notifications/preferences', () => {
    it('should return the current user preferences', async () => {
      service.getMyPreferences.mockResolvedValue(preferences);

      const response = await request(app.getHttpServer())
        .get('/api/v1/notifications/preferences')
        .set(authenticated())
        .expect(200);

      expect(response.body.userId).toBe('user-1');
      expect(response.body.emailEnabled).toBe(true);
      expect(response.body.telegramEnabled).toBe(true);
      expect(service.getMyPreferences).toHaveBeenCalledWith('user-1');
    });
  });

  describe('PATCH /api/v1/notifications/preferences', () => {
    it('should update notification preferences', async () => {
      service.updateMyPreferences.mockResolvedValue({
        ...preferences,
        emailEnabled: false,
      });

      const response = await request(app.getHttpServer())
        .patch('/api/v1/notifications/preferences')
        .set(authenticated())
        .send({ emailEnabled: false })
        .expect(200);

      expect(response.body.emailEnabled).toBe(false);
      expect(service.updateMyPreferences).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          emailEnabled: false,
        }),
      );
    });

    it('should reject an empty preference update', async () => {
      service.updateMyPreferences.mockRejectedValue(
        new BadRequestException(
          'At least one notification preference must be provided',
        ),
      );

      await request(app.getHttpServer())
        .patch('/api/v1/notifications/preferences')
        .set(authenticated())
        .send({})
        .expect(400);

      expect(service.updateMyPreferences).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({}),
      );
    });

    it('should reject an unknown preference property', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/notifications/preferences')
        .set(authenticated())
        .send({ unknownPreference: true })
        .expect(400);

      expect(service.updateMyPreferences).not.toHaveBeenCalled();
    });

    it('should reject an unauthenticated preference update', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/notifications/preferences')
        .send({ emailEnabled: false })
        .expect(401);

      expect(service.updateMyPreferences).not.toHaveBeenCalled();
    });
  });
});
