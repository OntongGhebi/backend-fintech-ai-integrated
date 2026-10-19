import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EmailVerificationService } from '../src/modules/auth/services/email-verification.service';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(60000);

describe('Reports E2E', () => {
  let app: INestApplication;

  let userAAccessToken: string;
  let userBAccessToken: string;

  let userAId: string;

  let userAAccountId: string;
  let userBAccountId: string;

  let userAExpenseCategoryId: string;
  let userAIncomeCategoryId: string;

  let userATransactionId: string;
  let userBTransactionId: string;

  let emailVerificationService: EmailVerificationService;

  const userAEmail = `reports-a-${randomUUID()}@example.com`;
  const userBEmail = `reports-b-${randomUUID()}@example.com`;

  const password = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createE2EApp(moduleFixture.createNestApplication());

    emailVerificationService = app.get(EmailVerificationService);

    /*
     * ============================================================
     * USER A
     * ============================================================
     */

    const userARegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: userAEmail,
        password,
        name: 'Reports User A',
      })
      .expect(201);

    userAId = userARegister.body.id;

    const userAToken = await emailVerificationService.createToken(userAId);

    await emailVerificationService.verifyEmail(userAToken);

    /*
     * ============================================================
     * USER B
     * ============================================================
     */

    const userBRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: userBEmail,
        password,
        name: 'Reports User B',
      })
      .expect(201);

    const userBId = userBRegister.body.id;

    const userBToken = await emailVerificationService.createToken(userBId);

    await emailVerificationService.verifyEmail(userBToken);

    /*
     * ============================================================
     * LOGIN
     * ============================================================
     */

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

    /*
     * ============================================================
     * USER A ACCOUNT
     * ============================================================
     */

    const userAAccount = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${userAAccessToken}`)
      .send({
        name: 'Reports User A Bank',
        type: 'BANK',
        openingBalance: 10000000,
        currency: 'IDR',
      })
      .expect(201);

    userAAccountId = userAAccount.body.id;

    /*
     * ============================================================
     * USER B ACCOUNT
     * ============================================================
     */

    const userBAccount = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${userBAccessToken}`)
      .send({
        name: 'Reports User B Bank',
        type: 'BANK',
        openingBalance: 5000000,
        currency: 'IDR',
      })
      .expect(201);

    userBAccountId = userBAccount.body.id;

    /*
     * ============================================================
     * USER A EXPENSE CATEGORY
     * ============================================================
     */

    const expenseCategory = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${userAAccessToken}`)
      .send({
        name: 'Reports Expense',
        type: 'EXPENSE',
      })
      .expect(201);

    userAExpenseCategoryId = expenseCategory.body.data.id;

    /*
     * ============================================================
     * USER A INCOME CATEGORY
     * ============================================================
     */

    const incomeCategory = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${userAAccessToken}`)
      .send({
        name: 'Reports Income',
        type: 'INCOME',
      })
      .expect(201);

    userAIncomeCategoryId = incomeCategory.body.data.id;

    /*
     * ============================================================
     * USER A EXPENSE TRANSACTION
     * ============================================================
     */

    const expenseTransaction = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${userAAccessToken}`)
      .send({
        accountId: userAAccountId,
        categoryId: userAExpenseCategoryId,
        type: 'EXPENSE',
        amount: '150000',
        description: 'Reports expense transaction',
        transactionDate: '2026-10-01T10:00:00.000Z',
      })
      .expect(201);

    userATransactionId = expenseTransaction.body.id;

    /*
     * ============================================================
     * USER A INCOME TRANSACTION
     * ============================================================
     */

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${userAAccessToken}`)
      .send({
        accountId: userAAccountId,
        categoryId: userAIncomeCategoryId,
        type: 'INCOME',
        amount: '500000',
        description: 'Reports income transaction',
        transactionDate: '2026-10-02T10:00:00.000Z',
      })
      .expect(201);

    /*
     * ============================================================
     * USER A SECOND EXPENSE
     * ============================================================
     */

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${userAAccessToken}`)
      .send({
        accountId: userAAccountId,
        categoryId: userAExpenseCategoryId,
        type: 'EXPENSE',
        amount: '75000',
        description: 'Reports second expense',
        transactionDate: '2026-10-03T10:00:00.000Z',
      })
      .expect(201);

    /*
     * ============================================================
     * USER B TRANSACTION
     * ============================================================
     */

    const userBTransaction = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${userBAccessToken}`)
      .send({
        accountId: userBAccountId,
        type: 'EXPENSE',
        amount: '999999',
        description: 'User B private transaction',
        transactionDate: '2026-10-01T10:00:00.000Z',
      })
      .expect(201);

    userBTransactionId = userBTransaction.body.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  /*
   * ============================================================
   * GET /api/v1/reports/financial
   * ============================================================
   */

  describe('GET /api/v1/reports/financial', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .expect(401);
    });

    it('should return the financial report', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          reportType: 'FINANCIAL',
          currency: 'IDR',
          summary: expect.any(Object),
          income: expect.any(Object),
          expense: expect.any(Object),
          categoryAnalytics: expect.any(Object),
          accountAnalytics: expect.any(Object),
          budgetPerformance: expect.any(Object),
          recurringPerformance: expect.any(Object),
          monthlyFinancialSummary: expect.objectContaining({
            currency: 'IDR',
            months: expect.any(Array),
            totalIncome: expect.any(String),
            totalExpense: expect.any(String),
            totalNetCashFlow: expect.any(String),
            totalTransactionCount: expect.any(Number),
          }),
          cashFlow: expect.any(Object),
          transactions: expect.any(Object),
        }),
      );
    });

    it('should return paginated transaction data', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .query({
          page: 1,
          limit: 2,
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body.transactions).toEqual(
        expect.objectContaining({
          data: expect.any(Array),
          meta: expect.objectContaining({
            page: 1,
            limit: 2,
            total: expect.any(Number),
            totalPages: expect.any(Number),
            hasNextPage: expect.any(Boolean),
            hasPreviousPage: expect.any(Boolean),
          }),
        }),
      );

      expect(response.body.transactions.data.length).toBeLessThanOrEqual(2);
    });

    it('should filter transactions by type', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .query({
          type: 'EXPENSE',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body.transactions.data.length).toBeGreaterThan(0);

      expect(
        response.body.transactions.data.every(
          (transaction: { type: string }) => transaction.type === 'EXPENSE',
        ),
      ).toBe(true);
    });

    it('should filter transactions by account', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .query({
          accountId: userAAccountId,
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(
        response.body.transactions.data.every(
          (transaction: { accountId: string }) =>
            transaction.accountId === userAAccountId,
        ),
      ).toBe(true);
    });

    it('should filter transactions by category', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .query({
          categoryId: userAExpenseCategoryId,
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body.transactions.data.length).toBeGreaterThan(0);

      expect(
        response.body.transactions.data.every(
          (transaction: { categoryId: string }) =>
            transaction.categoryId === userAExpenseCategoryId,
        ),
      ).toBe(true);
    });

    it('should filter transactions by date range', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .query({
          startDate: '2026-10-02',
          endDate: '2026-10-02',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(
        response.body.transactions.data.every(
          (transaction: { transactionDate: string }) => {
            const date = new Date(transaction.transactionDate);

            return (
              date >= new Date('2026-10-02T00:00:00.000Z') &&
              date <= new Date('2026-10-02T23:59:59.999Z')
            );
          },
        ),
      ).toBe(true);
    });

    it('should reject invalid UUID filter', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .query({
          accountId: 'invalid-account-id',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(400);
    });

    it('should reject invalid page', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .query({
          page: 0,
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(400);
    });

    it('should reject limit above maximum', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .query({
          limit: 101,
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(400);
    });

    it('should not expose another user transaction', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      const transactionIds = response.body.transactions.data.map(
        (transaction: { id: string }) => transaction.id,
      );

      expect(transactionIds).not.toContain(userBTransactionId);
    });

    it('should reject startDate after endDate', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .query({
          startDate: '2026-10-10',
          endDate: '2026-10-01',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(400);
    });

    it('should support pagination across multiple pages', async () => {
      const firstPage = await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .query({
          page: 1,
          limit: 1,
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      const secondPage = await request(app.getHttpServer())
        .get('/api/v1/reports/financial')
        .query({
          page: 2,
          limit: 1,
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(firstPage.body.transactions.meta.page).toBe(1);

      expect(secondPage.body.transactions.meta.page).toBe(2);

      if (
        firstPage.body.transactions.data.length > 0 &&
        secondPage.body.transactions.data.length > 0
      ) {
        expect(firstPage.body.transactions.data[0].id).not.toBe(
          secondPage.body.transactions.data[0].id,
        );
      }
    });
  });

  /*
   * ============================================================
   * GET /api/v1/reports/financial/export
   * ============================================================
   */

  describe('GET /api/v1/reports/financial/export', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/financial/export')
        .expect(401);
    });

    it('should export the financial report as CSV', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reports/financial/export')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');

      expect(response.headers['content-disposition']).toContain('attachment');

      expect(response.headers['content-disposition']).toContain(
        'financial-report.csv',
      );

      expect(response.text).toContain('Transaction ID');

      expect(response.text).toContain('Transaction Date');

      expect(response.text).toContain('Type');

      expect(response.text).toContain('Amount');

      expect(response.text).toContain('Currency');
    });

    it('should export only transactions belonging to the authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reports/financial/export')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.text).not.toContain(userBTransactionId);
    });

    it('should apply report filters during export', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reports/financial/export')
        .query({
          type: 'EXPENSE',
          categoryId: userAExpenseCategoryId,
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.text).toContain(userATransactionId);

      expect(response.text).not.toContain(userBTransactionId);
    });

    it('should ignore pagination parameters during export', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reports/financial/export')
        .query({
          page: 1,
          limit: 1,
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      const lines = response.text.trim().split('\n');

      /*
       * Header + at least the three User A
       * transactions.
       */
      expect(lines.length).toBeGreaterThanOrEqual(4);
    });

    it('should reject invalid report filters', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/financial/export')
        .query({
          categoryId: 'invalid-category-id',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(400);
    });
  });
});
