import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EmailVerificationService } from '../src/modules/auth/services/email-verification.service';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(30000);

describe('Recurring Transactions E2E', () => {
  let app: INestApplication;

  let userAAccessToken: string;
  let userBAccessToken: string;

  let userAId: string;
  let userBId: string;

  let accountId: string;
  let categoryId: string;

  let recurringTransactionId: string;

  let emailVerificationService: EmailVerificationService;

  const userAEmail = `recurring-a-${randomUUID()}@example.com`;
  const userBEmail = `recurring-b-${randomUUID()}@example.com`;

  const password = 'Password123!';

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
        name: 'Recurring User A',
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
        name: 'Recurring User B',
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
      })
      .expect(200);

    userAAccessToken = userALogin.body.accessToken;

    const userBLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: userBEmail,
        password,
      })
      .expect(200);

    userBAccessToken = userBLogin.body.accessToken;

    const accountResponse = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${userAAccessToken}`)
      .send({
        name: 'Recurring Test Bank',
        type: 'BANK',
        openingBalance: 5000000,
        currency: 'IDR',
      })
      .expect(201);

    accountId = accountResponse.body.id;

    const categoryResponse = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${userAAccessToken}`)
      .send({
        name: 'Recurring Expense',
        type: 'EXPENSE',
      })
      .expect(201);

    categoryId = categoryResponse.body.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/recurring-transactions', () => {
    it('should create a recurring transaction', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/recurring-transactions')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          accountId,
          categoryId,
          type: 'EXPENSE',
          amount: '150000',
          description: 'Monthly internet subscription',
          frequency: 'MONTHLY',
          startDate: '2026-09-01',
          endDate: '2027-09-01',
        })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          userId: userAId,
          accountId,
          type: 'EXPENSE',
          amount: '150000',
          description: 'Monthly internet subscription',
          frequency: 'MONTHLY',
          isActive: true,
          lastRunAt: null,
        }),
      );

      expect(response.body.categoryId).toBeNull();

      expect(response.body.id).toEqual(expect.any(String));

      expect(response.body.nextRunAt).toEqual(expect.any(String));

      recurringTransactionId = response.body.id;
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/recurring-transactions')
        .send({
          accountId,
          type: 'EXPENSE',
          amount: '100000',
          frequency: 'MONTHLY',
          startDate: '2026-09-01',
        })
        .expect(401);
    });

    it('should reject invalid amount', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/recurring-transactions')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          accountId,
          type: 'EXPENSE',
          amount: 'invalid',
          frequency: 'MONTHLY',
          startDate: '2026-09-01',
        })
        .expect(400);
    });

    it('should reject invalid frequency', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/recurring-transactions')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          accountId,
          type: 'EXPENSE',
          amount: '100000',
          frequency: 'INVALID',
          startDate: '2026-09-01',
        })
        .expect(400);
    });

    it('should reject endDate before startDate', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/recurring-transactions')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          accountId,
          type: 'EXPENSE',
          amount: '100000',
          frequency: 'MONTHLY',
          startDate: '2026-10-01',
          endDate: '2026-09-01',
        })
        .expect(400);
    });

    it('should reject another user account', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/recurring-transactions')
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .send({
          accountId,
          type: 'EXPENSE',
          amount: '100000',
          frequency: 'MONTHLY',
          startDate: '2026-09-01',
        })
        .expect(404);
    });
  });

  describe('GET /api/v1/recurring-transactions', () => {
    it('should return the authenticated user recurring transactions', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/recurring-transactions')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: recurringTransactionId,
            userId: userAId,
            accountId,
          }),
        ]),
      );

      expect(
        response.body.every(
          (item: { userId: string }) => item.userId === userAId,
        ),
      ).toBe(true);
    });

    it('should filter by type', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/recurring-transactions?type=EXPENSE')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(
        response.body.every(
          (item: { type: string }) => item.type === 'EXPENSE',
        ),
      ).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/recurring-transactions')
        .expect(401);
    });
  });

  describe('GET /api/v1/recurring-transactions/:id', () => {
    it('should return the owned recurring transaction', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/recurring-transactions/${recurringTransactionId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: recurringTransactionId,
          userId: userAId,
          accountId,
        }),
      );
    });

    it('should not expose another user recurring transaction', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/recurring-transactions/${recurringTransactionId}`)
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .expect(404);
    });

    it('should return 404 for a nonexistent recurring transaction', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/recurring-transactions/${randomUUID()}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/recurring-transactions/:id', () => {
    it('should update the recurring transaction', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/recurring-transactions/${recurringTransactionId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          amount: '175000',
          description: 'Updated monthly subscription',
          frequency: 'MONTHLY',
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: recurringTransactionId,
          userId: userAId,
          amount: '175000',
          description: 'Updated monthly subscription',
          frequency: 'MONTHLY',
        }),
      );
    });

    it('should not allow another user to update it', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/recurring-transactions/${recurringTransactionId}`)
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .send({
          amount: '999999',
        })
        .expect(404);
    });
  });

  describe('PATCH /api/v1/recurring-transactions/:id/enabled', () => {
    it('should disable a recurring transaction', async () => {
      const response = await request(app.getHttpServer())
        .patch(
          `/api/v1/recurring-transactions/${recurringTransactionId}/enabled`,
        )
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          isActive: false,
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: recurringTransactionId,
          isActive: false,
        }),
      );
    });

    it('should reject execution while disabled', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/recurring-transactions/${recurringTransactionId}/execute`,
        )
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(400);
    });

    it('should re-enable the recurring transaction', async () => {
      const response = await request(app.getHttpServer())
        .patch(
          `/api/v1/recurring-transactions/${recurringTransactionId}/enabled`,
        )
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          isActive: true,
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: recurringTransactionId,
          isActive: true,
        }),
      );
    });
  });

  describe('POST /api/v1/recurring-transactions/:id/execute', () => {
    it('should reject execution when the recurring transaction is not due yet', async () => {
      const response = await request(app.getHttpServer())
        .post(
          `/api/v1/recurring-transactions/${recurringTransactionId}/execute`,
        )
        .set('Authorization', `Bearer ${userAAccessToken}`);

      expect(response.status).toBe(400);
    });

    it('should not allow another user to execute it', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/recurring-transactions/${recurringTransactionId}/execute`,
        )
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .expect(404);
    });
  });

  describe('POST /api/v1/recurring-transactions/:id/execute - due transaction', () => {
    let dueRecurringTransactionId: string;

    let firstTransactionId: string;
    let firstTransactionDate: string;

    let secondTransactionId: string;
    let secondTransactionDate: string;

    it('should create a due recurring transaction for execution testing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/recurring-transactions')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          accountId,
          categoryId,
          type: 'EXPENSE',
          amount: '25000',
          description: 'Due recurring expense',
          frequency: 'DAILY',
          startDate: '2026-09-20',
        })
        .expect(201);

      dueRecurringTransactionId = response.body.id;

      expect(new Date(response.body.nextRunAt).getTime()).toBeLessThanOrEqual(
        Date.now(),
      );
    });

    it('should generate the first actual transaction', async () => {
      const response = await request(app.getHttpServer())
        .post(
          `/api/v1/recurring-transactions/${dueRecurringTransactionId}/execute`,
        )
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          alreadyExecuted: false,
          transaction: expect.objectContaining({
            userId: userAId,
            accountId,
            type: 'EXPENSE',
            amount: '25000',
            currency: 'IDR',
            source: 'SYSTEM',
            status: 'ACTIVE',
          }),
          recurringTransaction: expect.objectContaining({
            id: dueRecurringTransactionId,
            lastRunAt: expect.any(String),
            isActive: true,
            nextRunAt: expect.any(String),
          }),
        }),
      );

      expect(response.body.transaction.id).toEqual(expect.any(String));

      expect(response.body.transaction.transactionDate).toEqual(
        expect.any(String),
      );

      firstTransactionId = response.body.transaction.id;

      firstTransactionDate = response.body.transaction.transactionDate;

      expect(
        new Date(response.body.recurringTransaction.nextRunAt).getTime(),
      ).toBeGreaterThan(
        new Date(response.body.recurringTransaction.lastRunAt).getTime(),
      );
    });

    it('should generate the next occurrence independently', async () => {
      const response = await request(app.getHttpServer())
        .post(
          `/api/v1/recurring-transactions/${dueRecurringTransactionId}/execute`,
        )
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          alreadyExecuted: false,
          transaction: expect.objectContaining({
            userId: userAId,
            accountId,
            type: 'EXPENSE',
            amount: '25000',
            currency: 'IDR',
            source: 'SYSTEM',
            status: 'ACTIVE',
          }),
          recurringTransaction: expect.objectContaining({
            id: dueRecurringTransactionId,
            lastRunAt: expect.any(String),
            isActive: true,
            nextRunAt: expect.any(String),
          }),
        }),
      );

      secondTransactionId = response.body.transaction.id;

      secondTransactionDate = response.body.transaction.transactionDate;

      expect(secondTransactionId).not.toBe(firstTransactionId);

      expect(secondTransactionDate).not.toBe(firstTransactionDate);

      expect(new Date(secondTransactionDate).getTime()).toBeGreaterThan(
        new Date(firstTransactionDate).getTime(),
      );
    });
  });

  describe('DELETE /api/v1/recurring-transactions/:id', () => {
    it('should not allow another user to delete it', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/recurring-transactions/${recurringTransactionId}`)
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .expect(404);
    });

    it('should delete the recurring transaction', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/recurring-transactions/${recurringTransactionId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Recurring transaction deleted successfully',
      });
    });

    it('should not return the deleted recurring transaction', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/recurring-transactions/${recurringTransactionId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(404);
    });

    it('should not return the deleted recurring transaction in list', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/recurring-transactions')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(
        response.body.some(
          (item: { id: string }) => item.id === recurringTransactionId,
        ),
      ).toBe(false);
    });
  });
});
