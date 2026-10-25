import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { EmailVerificationService } from './../src/modules/auth/services/email-verification.service';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(60000);

describe('Budget Alerts E2E', () => {
  let app: INestApplication;

  let userAAccessToken: string;
  let userBAccessToken: string;

  let userAId: string;
  let userBId: string;

  let budgetAId: string;
  let budgetBId: string;

  let alertId: string;

  let emailVerificationService: EmailVerificationService;

  const userAEmail = `budget-alert-a-${randomUUID()}@example.com`;
  const userBEmail = `budget-alert-b-${randomUUID()}@example.com`;

  const password = 'Password123!';

  const createBudget = async (accessToken: string, name: string) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/budgets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name,
        amount: '1500000',
        period: 'MONTHLY',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      })
      .expect(201);

    return response.body.id as string;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createE2EApp(moduleFixture.createNestApplication());

    emailVerificationService = app.get(EmailVerificationService);

    const userARegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: userAEmail,
        password,
        name: 'Budget Alert User A',
      })
      .expect(201);

    userAId = userARegister.body.id;

    const userAToken = await emailVerificationService.createToken(userAId);

    await emailVerificationService.verifyEmail(userAToken);

    const userBRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: userBEmail,
        password,
        name: 'Budget Alert User B',
      })
      .expect(201);

    userBId = userBRegister.body.id;

    const userBToken = await emailVerificationService.createToken(userBId);

    await emailVerificationService.verifyEmail(userBToken);

    const userALogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: userAEmail,
        password,
      });

    if (userALogin.status !== 200) {
      throw new Error(
        `User A login failed during Budget Alerts E2E setup: ${JSON.stringify(
          userALogin.body,
        )}`,
      );
    }

    userAAccessToken = userALogin.body.accessToken;

    const userBLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: userBEmail,
        password,
      });

    if (userBLogin.status !== 200) {
      throw new Error(
        `User B login failed during Budget Alerts E2E setup: ${JSON.stringify(
          userBLogin.body,
        )}`,
      );
    }

    userBAccessToken = userBLogin.body.accessToken;

    budgetAId = await createBudget(userAAccessToken, 'Budget Alert Test A');

    budgetBId = await createBudget(userBAccessToken, 'Budget Alert Test B');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/budgets/:budgetId/alerts', () => {
    it('should create a budget alert', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/budgets/${budgetAId}/alerts`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          thresholdPercentage: 80,
          channel: 'TELEGRAM',
        })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          budgetId: budgetAId,
          thresholdPercentage: 80,
          channel: 'TELEGRAM',
          isEnabled: true,
        }),
      );

      expect(response.body.id).toEqual(expect.any(String));

      alertId = response.body.id;
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/budgets/${budgetAId}/alerts`)
        .send({
          thresholdPercentage: 80,
          channel: 'TELEGRAM',
        })
        .expect(401);
    });

    it('should reject an invalid threshold below 1', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/budgets/${budgetAId}/alerts`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          thresholdPercentage: 0,
          channel: 'TELEGRAM',
        })
        .expect(400);
    });

    it('should reject an invalid threshold above 100', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/budgets/${budgetAId}/alerts`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          thresholdPercentage: 101,
          channel: 'TELEGRAM',
        })
        .expect(400);
    });

    it('should reject an invalid notification channel', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/budgets/${budgetAId}/alerts`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          thresholdPercentage: 80,
          channel: 'INVALID',
        })
        .expect(400);
    });

    it('should not allow creating an alert for another user budget', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/budgets/${budgetBId}/alerts`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          thresholdPercentage: 80,
          channel: 'TELEGRAM',
        })
        .expect(404);
    });
  });

  describe('GET /api/v1/budget-alerts', () => {
    it('should return alerts belonging to the authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/budget-alerts')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: alertId,
            budgetId: budgetAId,
          }),
        ]),
      );

      expect(
        response.body.every(
          (alert: { budget: { userId: string } }) =>
            alert.budget.userId === userAId,
        ),
      ).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/budget-alerts')
        .expect(401);
    });

    it('should filter alerts by channel', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/budget-alerts')
        .query({
          channel: 'TELEGRAM',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(
        response.body.every(
          (alert: { channel: string }) => alert.channel === 'TELEGRAM',
        ),
      ).toBe(true);
    });

    it('should filter alerts by enabled state', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/budget-alerts')
        .query({
          isEnabled: true,
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(
        response.body.every(
          (alert: { isEnabled: boolean }) => alert.isEnabled === true,
        ),
      ).toBe(true);
    });

    it('should not expose another user budget alerts', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/budget-alerts')
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .expect(200);

      expect(
        response.body.some((alert: { id: string }) => alert.id === alertId),
      ).toBe(false);
    });
  });

  describe('GET /api/v1/budgets/:budgetId/alerts', () => {
    it('should return alerts for the authenticated user budget', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/budgets/${budgetAId}/alerts`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: alertId,
            budgetId: budgetAId,
          }),
        ]),
      );
    });

    it('should not expose alerts from another user budget', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/budgets/${budgetBId}/alerts`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(404);
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/budgets/${budgetAId}/alerts`)
        .expect(401);
    });
  });

  describe('GET /api/v1/budget-alerts/:alertId', () => {
    it('should return the alert owned by the authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/budget-alerts/${alertId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: alertId,
          budgetId: budgetAId,
          thresholdPercentage: 80,
          channel: 'TELEGRAM',
          isEnabled: true,
        }),
      );
    });

    it('should not expose another user alert', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/budget-alerts/${alertId}`)
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .expect(404);
    });

    it('should return 404 for a nonexistent alert', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/budget-alerts/${randomUUID()}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(404);
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/budget-alerts/${alertId}`)
        .expect(401);
    });
  });

  describe('PATCH /api/v1/budget-alerts/:alertId', () => {
    it('should update the alert', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/budget-alerts/${alertId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          thresholdPercentage: 90,
          channel: 'EMAIL',
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: alertId,
          thresholdPercentage: 90,
          channel: 'EMAIL',
          isEnabled: true,
        }),
      );
    });

    it('should update multiple fields', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/budget-alerts/${alertId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          thresholdPercentage: 95,
          channel: 'TELEGRAM',
          isEnabled: false,
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: alertId,
          thresholdPercentage: 95,
          channel: 'TELEGRAM',
          isEnabled: false,
        }),
      );
    });

    it('should reject an invalid threshold', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/budget-alerts/${alertId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          thresholdPercentage: 101,
        })
        .expect(400);
    });

    it('should not allow another user to update the alert', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/budget-alerts/${alertId}`)
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .send({
          thresholdPercentage: 50,
        })
        .expect(404);
    });
  });

  describe('PATCH /api/v1/budget-alerts/:alertId/enabled', () => {
    it('should enable the alert', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/budget-alerts/${alertId}/enabled`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          isEnabled: true,
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: alertId,
          isEnabled: true,
        }),
      );
    });

    it('should disable the alert', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/budget-alerts/${alertId}/enabled`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          isEnabled: false,
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: alertId,
          isEnabled: false,
        }),
      );
    });

    it('should reject the request when isEnabled is missing', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/budget-alerts/${alertId}/enabled`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({})
        .expect(400);
    });

    it('should not allow another user to change the enabled state', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/budget-alerts/${alertId}/enabled`)
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .send({
          isEnabled: true,
        })
        .expect(404);
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/budget-alerts/${alertId}/enabled`)
        .send({
          isEnabled: true,
        })
        .expect(401);
    });
  });

  describe('DELETE /api/v1/budget-alerts/:alertId', () => {
    it('should not allow another user to delete the alert', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/budget-alerts/${alertId}`)
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .expect(404);
    });

    it('should delete the alert', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/budget-alerts/${alertId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Budget alert deleted successfully',
      });
    });

    it('should not return the deleted alert by id', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/budget-alerts/${alertId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(404);
    });

    it('should not return the deleted alert in the list', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/budget-alerts')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(
        response.body.some((alert: { id: string }) => alert.id === alertId),
      ).toBe(false);
    });

    it('should not allow deleting the alert again', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/budget-alerts/${alertId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(404);
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/budget-alerts/${alertId}`)
        .expect(401);
    });
  });
});
