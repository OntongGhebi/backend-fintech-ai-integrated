import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

jest.setTimeout(30000);

describe('Budgets E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let accessToken: string;
  let secondUserAccessToken: string;

  let userId: string;
  let secondUserId: string;

  let categoryId: string;
  let budgetId: string;

  const testEmail = `budget-e2e-${Date.now()}@example.com`;
  const secondTestEmail = `budget-e2e-second-${Date.now()}@example.com`;

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

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password,
        name: 'Budget E2E User',
      })
      .expect(201);

    userId = registerResponse.body.id;

    const secondRegisterResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: secondTestEmail,
        password,
        name: 'Budget E2E Second User',
      })
      .expect(201);

    secondUserId = secondRegisterResponse.body.id;

    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.user.update({
      where: {
        id: secondUserId,
      },
      data: {
        emailVerifiedAt: new Date(),
      },
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password,
      })
      .expect(200);

    accessToken = loginResponse.body.accessToken;

    const secondLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: secondTestEmail,
        password,
      })
      .expect(200);

    secondUserAccessToken = secondLoginResponse.body.accessToken;

    const category = await prisma.category.create({
      data: {
        userId,
        name: 'Budget E2E Category',
        type: 'EXPENSE',
      },
    });

    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.budget.deleteMany({
      where: {
        OR: [
          {
            userId,
          },
          {
            userId: secondUserId,
          },
        ],
      },
    });

    await prisma.category.deleteMany({
      where: {
        OR: [
          {
            userId,
          },
          {
            userId: secondUserId,
          },
        ],
      },
    });

    await prisma.user.deleteMany({
      where: {
        OR: [
          {
            id: userId,
          },
          {
            id: secondUserId,
          },
        ],
      },
    });

    await app.close();
  });

  describe('Authentication', () => {
    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/api/v1/budgets').expect(401);
    });
  });

  describe('POST /budgets', () => {
    it('should create a budget', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/budgets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Monthly Food Budget',
          amount: '1500000',
          period: 'MONTHLY',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          categoryId,
        })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          userId,
          name: 'Monthly Food Budget',
          amount: expect.anything(),
          period: 'MONTHLY',
          status: 'ACTIVE',
          categoryId,
        }),
      );

      budgetId = response.body.id;
    });

    it('should reject duplicate budget name for the same user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/budgets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Monthly Food Budget',
          amount: '2000000',
          period: 'MONTHLY',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          categoryId,
        })
        .expect(409);
    });

    it('should reject invalid budget data', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/budgets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '',
          amount: 'invalid-amount',
          period: 'INVALID',
          startDate: 'invalid-date',
        })
        .expect(400);
    });

    it('should reject an end date earlier than the start date', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/budgets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Invalid Date Budget',
          amount: '1000000',
          period: 'MONTHLY',
          startDate: '2026-09-30',
          endDate: '2026-09-01',
        })
        .expect(400);
    });

    it('should reject a non-owned category', async () => {
      const secondUserCategory = await prisma.category.create({
        data: {
          userId: secondUserId,
          name: 'Second User Category',
          type: 'EXPENSE',
        },
      });

      try {
        await request(app.getHttpServer())
          .post('/api/v1/budgets')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Foreign Category Budget',
            amount: '1000000',
            period: 'MONTHLY',
            startDate: '2026-09-01',
            categoryId: secondUserCategory.id,
          })
          .expect(404);
      } finally {
        await prisma.category.delete({
          where: {
            id: secondUserCategory.id,
          },
        });
      }
    });
  });

  describe('GET /budgets', () => {
    it('should return the current user budgets', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/budgets')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);

      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: budgetId,
            userId,
            name: 'Monthly Food Budget',
          }),
        ]),
      );
    });

    it('should filter budgets by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/budgets')
        .query({
          status: 'ACTIVE',
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);

      expect(
        response.body.every(
          (budget: { status: string }) => budget.status === 'ACTIVE',
        ),
      ).toBe(true);
    });

    it('should reject an invalid status filter', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/budgets')
        .query({
          status: 'INVALID',
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should not return another user budgets', async () => {
      await prisma.budget.create({
        data: {
          userId: secondUserId,
          name: 'Second User Budget',
          amount: '500000',
          period: 'MONTHLY',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-30'),
          status: 'ACTIVE',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/budgets')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(
        response.body.some(
          (budget: { userId: string }) => budget.userId === secondUserId,
        ),
      ).toBe(false);
    });
  });

  describe('GET /budgets/:id', () => {
    it('should return budget detail', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: budgetId,
          userId,
          name: 'Monthly Food Budget',
          period: 'MONTHLY',
          status: 'ACTIVE',
        }),
      );
    });

    it('should return 404 for another user budget', async () => {
      const secondUserBudget = await prisma.budget.create({
        data: {
          userId: secondUserId,
          name: 'Private Second Budget',
          amount: '750000',
          period: 'MONTHLY',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-30'),
          status: 'ACTIVE',
        },
      });

      await request(app.getHttpServer())
        .get(`/api/v1/budgets/${secondUserBudget.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should return 404 for a non-existing budget', async () => {
      const nonExistingBudgetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

      await request(app.getHttpServer())
        .get(`/api/v1/budgets/${nonExistingBudgetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /budgets/:id', () => {
    it('should update the budget', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Monthly Food Budget Updated',
          amount: '2000000',
          period: 'MONTHLY',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: budgetId,
          userId,
          name: 'Monthly Food Budget Updated',
          period: 'MONTHLY',
        }),
      );
    });

    it('should allow removing the category', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          categoryId: null,
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: budgetId,
          categoryId: null,
        }),
      );
    });

    it('should reject an invalid update', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 'invalid',
        })
        .expect(400);
    });

    it('should return 404 when updating another user budget', async () => {
      const secondUserBudget = await prisma.budget.create({
        data: {
          userId: secondUserId,
          name: 'Second Private Update Budget',
          amount: '900000',
          period: 'MONTHLY',
          startDate: new Date('2026-09-01'),
        },
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/budgets/${secondUserBudget.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Attempted Unauthorized Update',
        })
        .expect(404);
    });
  });

  describe('PATCH /budgets/:id/status', () => {
    it('should update budget status to PAUSED', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/budgets/${budgetId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          status: 'PAUSED',
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: budgetId,
          status: 'PAUSED',
        }),
      );
    });

    it('should update budget status back to ACTIVE', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/budgets/${budgetId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          status: 'ACTIVE',
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: budgetId,
          status: 'ACTIVE',
        }),
      );
    });

    it('should reject an invalid status', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/budgets/${budgetId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          status: 'INVALID',
        })
        .expect(400);
    });
  });

  describe('DELETE /budgets/:id', () => {
    it('should archive the budget', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Budget archived successfully',
      });
    });

    it('should not return the archived budget in the list', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/budgets')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(
        response.body.some((budget: { id: string }) => budget.id === budgetId),
      ).toBe(false);
    });

    it('should return 404 when accessing the archived budget', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
