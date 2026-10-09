import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EmailVerificationService } from '../src/modules/auth/services/email-verification.service';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(30000);

describe('Dashboard E2E', () => {
  let app: INestApplication;

  let userAAccessToken: string;
  let userBAccessToken: string;

  let userAAccountId: string;
  let userBAccountId: string;

  let userAExpenseCategoryId: string;
  let userAIncomeCategoryId: string;
  let userBIncomeCategoryId: string;

  const userAEmail = `dashboard-a-${randomUUID()}@example.com`;
  const userBEmail = `dashboard-b-${randomUUID()}@example.com`;

  const password = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createE2EApp(moduleFixture.createNestApplication());

    const emailVerificationService = app.get(EmailVerificationService);

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
        name: 'Dashboard User A',
      })
      .expect(201);

    const userAId = userARegister.body.id;

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
        name: 'Dashboard User B',
      })
      .expect(201);

    const userBId = userBRegister.body.id;

    const userBToken = await emailVerificationService.createToken(userBId);

    await emailVerificationService.verifyEmail(userBToken);

    /*
     * ============================================================
     * LOGIN USER A
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

    /*
     * ============================================================
     * LOGIN USER B
     * ============================================================
     */

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
        name: 'Dashboard User A Bank',
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
        name: 'Dashboard User B Bank',
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
        name: 'Dashboard Expense',
        type: 'EXPENSE',
      })
      .expect(201);

    userAExpenseCategoryId = expenseCategory.body.id;

    /*
     * ============================================================
     * USER A INCOME CATEGORY
     * ============================================================
     */

    const incomeCategory = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${userAAccessToken}`)
      .send({
        name: 'Dashboard Income',
        type: 'INCOME',
      })
      .expect(201);

    userAIncomeCategoryId = incomeCategory.body.id;

    const userBIncomeCategory = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${userBAccessToken}`)
      .send({
        name: 'Dashboard User B Income',
        type: 'INCOME',
      })
      .expect(201);

    userBIncomeCategoryId = userBIncomeCategory.body.id;

    /*
     * ============================================================
     * USER A EXPENSE
     * ============================================================
     */

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${userAAccessToken}`)
      .send({
        accountId: userAAccountId,
        categoryId: userAExpenseCategoryId,
        type: 'EXPENSE',
        amount: '150000',
        description: 'Dashboard expense',
        transactionDate: '2026-10-01T10:00:00.000Z',
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
        description: 'Dashboard second expense',
        transactionDate: '2026-10-03T10:00:00.000Z',
      })
      .expect(201);

    /*
     * ============================================================
     * USER A INCOME
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
        description: 'Dashboard income',
        transactionDate: '2026-10-02T10:00:00.000Z',
      })
      .expect(201);

    /*
     * ============================================================
     * USER B EXPENSE
     * ============================================================
     */

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${userBAccessToken}`)
      .send({
        accountId: userBAccountId,
        categoryId: userBIncomeCategoryId,
        type: 'INCOME',
        amount: '999999',
        description: 'Private user B income',
        transactionDate: '2026-10-01T10:00:00.000Z',
      })
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  /*
   * ============================================================
   * GET /api/v1/dashboard/architecture
   * ============================================================
   */

  describe('GET /api/v1/dashboard/architecture', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/architecture')
        .expect(401);
    });

    it('should return dashboard architecture information', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/architecture')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          userId: expect.any(String),
        }),
      );
    });
  });

  /*
   * ============================================================
   * GET /api/v1/dashboard/summary
   * ============================================================
   */

  describe('GET /api/v1/dashboard/summary', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .expect(401);
    });

    it('should return financial summary', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body).toEqual(
        expect.objectContaining({
          currency: 'IDR',
        }),
      );
    });

    it('should support date filtering', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .query({
          startDate: '2026-10-02',
          endDate: '2026-10-02',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  /*
   * ============================================================
   * GET /api/v1/dashboard/income
   * ============================================================
   */

  describe('GET /api/v1/dashboard/income', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/income')
        .expect(401);
    });

    it('should return income analytics', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/income')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();

      expect(JSON.stringify(response.body)).toContain('500000');
    });

    it('should support date filtering', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/income')
        .query({
          startDate: '2026-10-02',
          endDate: '2026-10-02',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  /*
   * ============================================================
   * GET /api/v1/dashboard/expense
   * ============================================================
   */

  describe('GET /api/v1/dashboard/expense', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/expense')
        .expect(401);
    });

    it('should return expense analytics', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/expense')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();

      expect(JSON.stringify(response.body)).toContain('225000');
    });

    it('should support date filtering', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/expense')
        .query({
          startDate: '2026-10-01',
          endDate: '2026-10-01',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  /*
   * ============================================================
   * GET /api/v1/dashboard/categories
   * ============================================================
   */

  describe('GET /api/v1/dashboard/categories', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/categories')
        .expect(401);
    });

    it('should return expense category analytics', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/categories')
        .query({
          type: 'EXPENSE',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should return income category analytics', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/categories')
        .query({
          type: 'INCOME',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should support date filtering', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/categories')
        .query({
          type: 'EXPENSE',
          startDate: '2026-10-01',
          endDate: '2026-10-03',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);
    });
  });

  /*
   * ============================================================
   * GET /api/v1/dashboard/accounts
   * ============================================================
   */

  describe('GET /api/v1/dashboard/accounts', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/accounts')
        .expect(401);
    });

    it('should return expense account analytics', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/accounts')
        .query({
          type: 'EXPENSE',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should return income account analytics', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/accounts')
        .query({
          type: 'INCOME',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should support date filtering', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/accounts')
        .query({
          type: 'EXPENSE',
          startDate: '2026-10-01',
          endDate: '2026-10-03',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);
    });
  });

  /*
   * ============================================================
   * GET /api/v1/dashboard/budgets/performance
   * ============================================================
   */

  describe('GET /api/v1/dashboard/budgets/performance', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/budgets/performance')
        .expect(401);
    });

    it('should return budget performance', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/budgets/performance')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should support date filtering', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/budgets/performance')
        .query({
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);
    });
  });

  /*
   * ============================================================
   * GET /api/v1/dashboard/recurring/performance
   * ============================================================
   */

  describe('GET /api/v1/dashboard/recurring/performance', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/recurring/performance')
        .expect(401);
    });

    it('should return recurring transaction performance', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/recurring/performance')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should support date filtering', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/recurring/performance')
        .query({
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);
    });
  });

  /*
   * ============================================================
   * GET /api/v1/dashboard/cash-flow
   * ============================================================
   */

  describe('GET /api/v1/dashboard/cash-flow', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/cash-flow')
        .expect(401);
    });

    it('should return cash flow analytics', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/cash-flow')
        .query({
          period: 'MONTH',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should support date filtering', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/cash-flow')
        .query({
          period: 'MONTH',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);
    });
  });

  /*
   * ============================================================
   * GET /api/v1/dashboard/monthly-summary
   * ============================================================
   */

  describe('GET /api/v1/dashboard/monthly-summary', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/monthly-summary')
        .expect(401);
    });

    it('should return monthly financial summary', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/monthly-summary')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should support date filtering', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/monthly-summary')
        .query({
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);
    });
  });

  /*
   * ============================================================
   * GET /api/v1/dashboard/overview
   * ============================================================
   */

  describe('GET /api/v1/dashboard/overview', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/overview')
        .expect(401);
    });

    it('should return aggregated dashboard overview', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/overview')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should support date filtering', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/overview')
        .query({
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);
    });
  });

  /*
   * ============================================================
   * OWNERSHIP ISOLATION
   * ============================================================
   */

  describe('Dashboard ownership isolation', () => {
    it('should not expose another user financial data', async () => {
      const userAIncome = await request(app.getHttpServer())
        .get('/api/v1/dashboard/income')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      const userBIncome = await request(app.getHttpServer())
        .get('/api/v1/dashboard/income')
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .expect(200);

      expect(JSON.stringify(userAIncome.body)).not.toContain('999999');

      expect(JSON.stringify(userBIncome.body)).toContain('999999');
    });

    it('should keep account analytics scoped to the authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/accounts')
        .query({
          type: 'EXPENSE',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain(userBAccountId);
    });
  });

  /*
   * ============================================================
   * INVALID QUERY PARAMETERS
   * ============================================================
   */

  describe('Dashboard query validation', () => {
    it('should reject invalid date input', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .query({
          startDate: 'not-a-date',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(400);
    });

    it('should reject invalid category analytics type', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/categories')
        .query({
          type: 'INVALID',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(400);
    });

    it('should reject invalid account analytics type', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/accounts')
        .query({
          type: 'INVALID',
        })
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(400);
    });
  });
});
