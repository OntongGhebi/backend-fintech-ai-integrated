import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { EmailVerificationService } from '../src/modules/auth/services/email-verification.service';

jest.setTimeout(30000);

describe('Transactions E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emailVerificationService: EmailVerificationService;

  let accessToken: string;
  let secondUserAccessToken: string;

  let accountId: string;
  let secondAccountId: string;
  let secondUserAccountId: string;

  let expenseCategoryId: string;
  let incomeCategoryId: string;

  let transactionId: string;
  let transferGroupId: string;

  const testUserEmail = `transactions-e2e-${Date.now()}@example.com`;

  const secondUserEmail = `transactions-e2e-second-${Date.now()}@example.com`;

  const password = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api/v1');

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    prisma = app.get(PrismaService);
    emailVerificationService = app.get(EmailVerificationService);

    /*
     * Register first user.
     */
    const firstUserResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: testUserEmail,
        password,
        name: 'Transactions E2E User',
      })
      .expect(201);

    const firstUserId = firstUserResponse.body.id as string;
    const firstVerificationToken =
      await emailVerificationService.createToken(firstUserId);

    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: firstVerificationToken })
      .expect(200);

    /*
     * NOTE:
     * Email verification is part of the existing Auth E2E flow.
     * The test environment must provide the same verification
     * mechanism used by the existing auth E2E tests.
     *
     * If your current auth E2E helper already exposes a verified
     * registration/login helper, replace the registration/login
     * section here with that helper.
     */

    /*
     * Register second user.
     */
    const secondUserResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: secondUserEmail,
        password,
        name: 'Transactions E2E Second User',
      })
      .expect(201);

    const secondUserId = secondUserResponse.body.id as string;
    const secondVerificationToken =
      await emailVerificationService.createToken(secondUserId);

    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: secondVerificationToken })
      .expect(200);

    const [expenseCategory, incomeCategory] = await Promise.all([
      prisma.category.create({
        data: {
          userId: firstUserId,
          name: 'E2E Food',
          type: 'EXPENSE',
        },
      }),
      prisma.category.create({
        data: {
          userId: firstUserId,
          name: 'E2E Salary',
          type: 'INCOME',
        },
      }),
    ]);

    expenseCategoryId = expenseCategory.id;
    incomeCategoryId = incomeCategory.id;
  });

  afterAll(async () => {
    await app.close();
  });

  /*
   * ---------------------------------------------------------
   * Authentication
   * ---------------------------------------------------------
   *
   * These tests assume the E2E environment allows the test
   * users to become ACTIVE/verified using the same mechanism
   * already used by auth.e2e-spec.ts.
   *
   * If the existing project uses a verification-token helper,
   * call that helper before login.
   */
  describe('Authentication setup', () => {
    it('should login the first user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password,
        });

      /*
       * Keep the assertion flexible with the existing auth
       * response shape.
       */
      expect([200, 201]).toContain(response.status);

      accessToken =
        response.body.accessToken ?? response.body.data?.accessToken;

      expect(accessToken).toBeDefined();
    });

    it('should login the second user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: secondUserEmail,
          password,
        });

      expect([200, 201]).toContain(response.status);

      secondUserAccessToken =
        response.body.accessToken ?? response.body.data?.accessToken;

      expect(secondUserAccessToken).toBeDefined();
    });
  });

  /*
   * ---------------------------------------------------------
   * Accounts
   * ---------------------------------------------------------
   */
  describe('Test data - Accounts', () => {
    it('should create the first account', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Transaction Main Account',
          type: 'BANK',
          openingBalance: 1000000,
          currency: 'IDR',
        })
        .expect(201);

      accountId = response.body.id;

      expect(accountId).toBeDefined();
      expect(response.body.currency).toBe('IDR');
    });

    it('should create the second account', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Transaction Savings Account',
          type: 'BANK',
          openingBalance: 500000,
          currency: 'IDR',
        })
        .expect(201);

      secondAccountId = response.body.id;

      expect(secondAccountId).toBeDefined();
      expect(secondAccountId).not.toBe(accountId);
    });

    it('should create an account for the second user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${secondUserAccessToken}`)
        .send({
          name: 'Second User Account',
          type: 'BANK',
          openingBalance: 250000,
          currency: 'IDR',
        })
        .expect(201);

      secondUserAccountId = response.body.id;

      expect(secondUserAccountId).toBeDefined();
    });
  });

  /*
   * ---------------------------------------------------------
   * Categories
   * ---------------------------------------------------------
   *
   * This section assumes the Categories module already exposes
   * the corresponding endpoint used by the project.
   */
  describe('Test data - Categories', () => {
    it('should create an expense category', async () => {
      expect(expenseCategoryId).toBeDefined();
    });

    it('should create an income category', async () => {
      expect(incomeCategoryId).toBeDefined();
    });
  });

  /*
   * ---------------------------------------------------------
   * POST /transactions
   * ---------------------------------------------------------
   */
  describe('POST /api/v1/transactions', () => {
    it('should create an expense transaction', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          accountId,
          categoryId: expenseCategoryId,
          type: 'EXPENSE',
          amount: 75000,
          currency: 'IDR',
          description: 'Lunch',
          transactionDate: '2026-09-15T10:00:00+07:00',
        })
        .expect(201);

      transactionId = response.body.id;

      expect(transactionId).toBeDefined();
      expect(response.body.userId).toBeDefined();
      expect(response.body.accountId).toBe(accountId);
      expect(response.body.categoryId).toBe(expenseCategoryId);
      expect(response.body.type).toBe('EXPENSE');
      expect(response.body.amount).toBe('75000');
      expect(response.body.currency).toBe('IDR');
      expect(response.body.source).toBe('MANUAL');
      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.transferGroupId).toBeNull();
    });

    it('should create an income transaction', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          accountId,
          categoryId: incomeCategoryId,
          type: 'INCOME',
          amount: 5000000,
          description: 'Salary',
          transactionDate: '2026-09-15T09:00:00+07:00',
        })
        .expect(201);

      expect(response.body.type).toBe('INCOME');
      expect(response.body.amount).toBe('5000000');
      expect(response.body.categoryId).toBe(incomeCategoryId);
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .send({
          accountId,
          type: 'EXPENSE',
          amount: 10000,
          transactionDate: '2026-09-15T10:00:00+07:00',
        })
        .expect(401);
    });

    it('should reject invalid account UUID', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          accountId: 'invalid-uuid',
          type: 'EXPENSE',
          amount: 10000,
          transactionDate: '2026-09-15T10:00:00+07:00',
        })
        .expect(400);
    });

    it('should reject invalid amount', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          accountId,
          type: 'EXPENSE',
          amount: 0,
          transactionDate: '2026-09-15T10:00:00+07:00',
        })
        .expect(400);
    });

    it('should reject transfer transaction with category', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          accountId,
          categoryId: expenseCategoryId,
          type: 'TRANSFER',
          amount: 100000,
          transactionDate: '2026-09-15T10:00:00+07:00',
        })
        .expect(400);
    });

    it('should reject transaction using another user account', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          accountId: secondUserAccountId,
          type: 'EXPENSE',
          amount: 10000,
          transactionDate: '2026-09-15T10:00:00+07:00',
        })
        .expect(404);
    });
  });

  /*
   * ---------------------------------------------------------
   * GET /transactions
   * ---------------------------------------------------------
   */
  describe('GET /api/v1/transactions', () => {
    it('should return transactions owned by the authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toBeInstanceOf(Array);

      expect(response.body.meta).toEqual(
        expect.objectContaining({
          page: expect.any(Number),
          limit: expect.any(Number),
          total: expect.any(Number),
          totalPages: expect.any(Number),
        }),
      );

      expect(
        response.body.data.some(
          (item: { id: string }) => item.id === transactionId,
        ),
      ).toBe(true);
    });

    it('should filter transactions by type', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .query({
          type: 'EXPENSE',
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(
        response.body.data.every(
          (item: { type: string }) => item.type === 'EXPENSE',
        ),
      ).toBe(true);
    });

    it('should filter transactions by account', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .query({
          accountId,
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(
        response.body.data.every(
          (item: { accountId: string }) => item.accountId === accountId,
        ),
      ).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .query({
          page: 1,
          limit: 1,
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(1);
      expect(response.body.data.length).toBeLessThanOrEqual(1);
    });

    it('should reject invalid pagination values', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .query({
          page: 0,
          limit: 101,
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should reject invalid date range', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .query({
          startDate: '2026-09-20T00:00:00+07:00',
          endDate: '2026-09-10T00:00:00+07:00',
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .expect(401);
    });
  });

  /*
   * ---------------------------------------------------------
   * GET /transactions/:id
   * ---------------------------------------------------------
   */
  describe('GET /api/v1/transactions/:id', () => {
    it('should return transaction detail', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(transactionId);
      expect(response.body.accountId).toBe(accountId);
    });

    it('should reject invalid transaction UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/transactions/not-a-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should reject access to another user transaction', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${secondUserAccessToken}`)
        .expect(404);
    });
  });

  /*
   * ---------------------------------------------------------
   * PATCH /transactions/:id
   * ---------------------------------------------------------
   */
  describe('PATCH /api/v1/transactions/:id', () => {
    it('should update transaction successfully', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 85000,
          description: 'Updated lunch',
        })
        .expect(200);

      expect(response.body.id).toBe(transactionId);
      expect(response.body.amount).toBe('85000');
      expect(response.body.description).toBe('Updated lunch');
    });

    it('should reject update from another user', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${secondUserAccessToken}`)
        .send({
          amount: 90000,
        })
        .expect(404);
    });

    it('should reject invalid update amount', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 0,
        })
        .expect(400);
    });

    it('should reject empty update body', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });
  });

  /*
   * ---------------------------------------------------------
   * POST /transactions/transfer
   * ---------------------------------------------------------
   */
  describe('POST /api/v1/transactions/transfer', () => {
    it('should create a transfer with two transaction records', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sourceAccountId: accountId,
          destinationAccountId: secondAccountId,
          amount: 100000,
          description: 'Transfer to savings',
          transactionDate: '2026-09-15T20:00:00+07:00',
        })
        .expect(201);

      transferGroupId = response.body.transferGroupId;

      expect(transferGroupId).toBeDefined();

      expect(response.body.transactions).toHaveLength(2);

      const [source, destination] = response.body.transactions;

      expect(source.type).toBe('TRANSFER');
      expect(destination.type).toBe('TRANSFER');

      expect(source.accountId).toBe(accountId);

      expect(destination.accountId).toBe(secondAccountId);

      expect(source.categoryId).toBeNull();
      expect(destination.categoryId).toBeNull();

      expect(source.amount).toBe(destination.amount);

      expect(source.transferGroupId).toBe(transferGroupId);

      expect(destination.transferGroupId).toBe(transferGroupId);
    });

    it('should reject transfer between the same account', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sourceAccountId: accountId,
          destinationAccountId: accountId,
          amount: 100000,
          transactionDate: '2026-09-15T20:00:00+07:00',
        })
        .expect(400);
    });

    it('should reject transfer using another user account', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sourceAccountId: accountId,
          destinationAccountId: secondUserAccountId,
          amount: 100000,
          transactionDate: '2026-09-15T20:00:00+07:00',
        })
        .expect(404);
    });

    it('should reject invalid transfer amount', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sourceAccountId: accountId,
          destinationAccountId: secondAccountId,
          amount: 0,
          transactionDate: '2026-09-15T20:00:00+07:00',
        })
        .expect(400);
    });

    it('should reject invalid source account UUID', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sourceAccountId: 'invalid-uuid',
          destinationAccountId: secondAccountId,
          amount: 100000,
          transactionDate: '2026-09-15T20:00:00+07:00',
        })
        .expect(400);
    });

    it('should reject unauthenticated transfer', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions/transfer')
        .send({
          sourceAccountId: accountId,
          destinationAccountId: secondAccountId,
          amount: 100000,
          transactionDate: '2026-09-15T20:00:00+07:00',
        })
        .expect(401);
    });
  });

  /*
   * ---------------------------------------------------------
   * DELETE /transactions/:id
   * ---------------------------------------------------------
   */
  describe('DELETE /api/v1/transactions/:id', () => {
    it('should void a transaction successfully', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Transaction voided successfully',
      });
    });

    it('should reject voiding the same transaction twice', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should reject voiding another user transaction', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${secondUserAccessToken}`)
        .expect(404);
    });

    it('should reject invalid transaction UUID', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/transactions/not-a-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });

  /*
   * ---------------------------------------------------------
   * Transfer detail verification
   * ---------------------------------------------------------
   */
  describe('Transfer integrity', () => {
    it('should expose both sides of the transfer using the same transferGroupId', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .query({
          status: 'ACTIVE',
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const transferTransactions = response.body.data.filter(
        (item: { transferGroupId: string | null }) =>
          item.transferGroupId === transferGroupId,
      );

      expect(transferTransactions.length).toBe(2);

      expect(
        transferTransactions.every(
          (item: { type: string }) => item.type === 'TRANSFER',
        ),
      ).toBe(true);

      expect(
        transferTransactions.every(
          (item: { categoryId: string | null }) => item.categoryId === null,
        ),
      ).toBe(true);
    });
  });
});
