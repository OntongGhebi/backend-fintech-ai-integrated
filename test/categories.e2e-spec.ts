import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(30000);

describe('Categories E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let userA: {
    id: string;
    email: string;
    password: string;
  };

  let userB: {
    id: string;
    email: string;
    password: string;
  };

  let accessTokenA: string;
  let accessTokenB: string;

  let categoryAId: string;
  let systemCategoryId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createE2EApp(moduleFixture.createNestApplication());

    prisma = app.get(PrismaService);

    userA = {
      id: '',
      email: `categories-e2e-a-${Date.now()}@example.com`,
      password: 'Password123!',
    };

    userB = {
      id: '',
      email: `categories-e2e-b-${Date.now()}@example.com`,
      password: 'Password123!',
    };

    /**
     * Register User A
     */
    const registerA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: userA.email,
        password: userA.password,
        name: 'Categories E2E User A',
      })
      .expect(201);

    userA.id = registerA.body.id;

    /**
     * Register User B
     */
    const registerB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: userB.email,
        password: userB.password,
        name: 'Categories E2E User B',
      })
      .expect(201);

    userB.id = registerB.body.id;

    /**
     * E2E environment may not have an actual email provider.
     * Mark users as verified directly in the test database.
     */
    await prisma.user.updateMany({
      where: {
        id: {
          in: [userA.id, userB.id],
        },
      },
      data: {
        emailVerifiedAt: new Date(),
      },
    });

    /**
     * Login User A
     */
    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: userA.email,
        password: userA.password,
      })
      .expect(200);

    accessTokenA = loginA.body.accessToken;

    /**
     * Login User B
     */
    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: userB.email,
        password: userB.password,
      })
      .expect(200);

    accessTokenB = loginB.body.accessToken;
  });

  afterAll(async () => {
    if (!prisma || !app || !userA.id || !userB.id) {
      if (app) {
        await app.close();
      }

      return;
    }

    /**
     * Remove test transactions first if any exist.
     */
    await prisma.transaction.deleteMany({
      where: {
        userId: {
          in: [userA.id, userB.id],
        },
      },
    });

    /**
     * Remove test categories.
     */
    await prisma.category.deleteMany({
      where: {
        userId: {
          in: [userA.id, userB.id],
        },
      },
    });

    /**
     * Remove test users.
     */
    await prisma.userPreference.deleteMany({
      where: {
        userId: {
          in: [userA.id, userB.id],
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [userA.id, userB.id],
        },
      },
    });

    await app.close();
  });

  describe('POST /api/v1/categories', () => {
    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .send({
          name: 'Food',
          type: 'EXPENSE',
        })
        .expect(401);
    });

    it('should create an expense category', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          name: '  Food  ',
          type: 'EXPENSE',
          icon: '  utensils  ',
          color: '  #FF5733  ',
        })
        .expect(201);

      expect(response.body).toHaveProperty('data');

      expect(response.body.data).toMatchObject({
        userId: userA.id,
        name: 'Food',
        type: 'EXPENSE',
        icon: 'utensils',
        color: '#FF5733',
        isSystem: false,
        isActive: true,
        deletedAt: null,
      });

      expect(response.body.data.id).toBeDefined();

      categoryAId = response.body.data.id;
    });

    it('should create an income category', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          name: 'Salary',
          type: 'INCOME',
        })
        .expect(201);

      expect(response.body.data).toMatchObject({
        userId: userA.id,
        name: 'Salary',
        type: 'INCOME',
        isSystem: false,
        isActive: true,
      });
    });

    it('should reject duplicate category name case-insensitively', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          name: 'food',
          type: 'EXPENSE',
        })
        .expect(409);
    });

    it('should reject invalid category type', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          name: 'Invalid Type',
          type: 'INVALID',
        })
        .expect(400);
    });

    it('should reject invalid color format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          name: 'Invalid Color',
          type: 'EXPENSE',
          color: 'red',
        })
        .expect(400);
    });

    it('should reject empty category name', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          name: '',
          type: 'EXPENSE',
        })
        .expect(400);
    });

    it('should not allow client to create a system category', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          name: 'Client System Category',
          type: 'EXPENSE',
          isSystem: true,
        })
        .expect(201);

      expect(response.body.data.isSystem).toBe(false);
    });
  });

  describe('GET /api/v1/categories', () => {
    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/api/v1/categories').expect(401);
    });

    it('should return only categories belonging to the authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');

      expect(Array.isArray(response.body.data)).toBe(true);

      for (const category of response.body.data) {
        expect(category.userId).toBe(userA.id);
      }
    });

    it('should filter categories by EXPENSE type', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/categories?type=EXPENSE')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);

      for (const category of response.body.data) {
        expect(category.type).toBe('EXPENSE');
        expect(category.userId).toBe(userA.id);
      }
    });

    it('should filter categories by INCOME type', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/categories?type=INCOME')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);

      for (const category of response.body.data) {
        expect(category.type).toBe('INCOME');
        expect(category.userId).toBe(userA.id);
      }
    });

    it('should reject invalid type filter', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/categories?type=INVALID')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(400);
    });
  });

  describe('GET /api/v1/categories/:id', () => {
    it('should return owned category', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/categories/${categoryAId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: categoryAId,
        userId: userA.id,
        name: 'Food',
        type: 'EXPENSE',
        isSystem: false,
        isActive: true,
      });
    });

    it('should return 404 when another user tries to access the category', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/categories/${categoryAId}`)
        .set('Authorization', `Bearer ${accessTokenB}`)
        .expect(404);
    });

    it('should return 404 for a non-existent category', async () => {
      const fakeId = '99999999-9999-4999-8999-999999999999';

      await request(app.getHttpServer())
        .get(`/api/v1/categories/${fakeId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/categories/:id', () => {
    it('should update an owned category', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoryAId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          name: 'Groceries',
          icon: 'shopping-cart',
          color: '#22AA66',
        })
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: categoryAId,
        userId: userA.id,
        name: 'Groceries',
        type: 'EXPENSE',
        icon: 'shopping-cart',
        color: '#22AA66',
        isSystem: false,
        isActive: true,
      });
    });

    it('should update only provided fields', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoryAId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          icon: 'cart',
        })
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: categoryAId,
        name: 'Groceries',
        type: 'EXPENSE',
        icon: 'cart',
        color: '#22AA66',
      });
    });

    it('should reject duplicate name during update', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoryAId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          name: 'Salary',
        })
        .expect(409);
    });

    it('should return 404 when another user tries to update the category', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoryAId}`)
        .set('Authorization', `Bearer ${accessTokenB}`)
        .send({
          name: 'Hacked Category',
        })
        .expect(404);
    });

    it('should reject invalid update data', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoryAId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          color: 'not-a-color',
        })
        .expect(400);
    });

    it('should reject client attempts to modify isSystem', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoryAId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          isSystem: true,
        })
        .expect(400);
    });

    it('should reject client attempts to modify deletedAt', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoryAId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          deletedAt: new Date().toISOString(),
        })
        .expect(400);
    });
  });

  describe('System category rules', () => {
    beforeAll(async () => {
      const systemCategory = await prisma.category.create({
        data: {
          userId: userA.id,
          name: 'System Food',
          type: 'EXPENSE',
          icon: 'system-food',
          color: '#123456',
          isSystem: true,
          isActive: true,
        },
      });

      systemCategoryId = systemCategory.id;
    });

    it('should allow reading an active system category', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/categories/${systemCategoryId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: systemCategoryId,
        isSystem: true,
        isActive: true,
      });
    });

    it('should reject updating a system category', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/categories/${systemCategoryId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          name: 'Modified System Food',
        })
        .expect(403);
    });

    it('should reject archiving a system category', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${systemCategoryId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(403);
    });
  });

  describe('DELETE /api/v1/categories/:id', () => {
    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${categoryAId}`)
        .expect(401);
    });

    it('should archive an owned category', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/categories/${categoryAId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(200);

      expect(response.body).toEqual({
        data: {
          id: categoryAId,
          archived: true,
        },
      });

      const category = await prisma.category.findUnique({
        where: {
          id: categoryAId,
        },
      });

      expect(category).not.toBeNull();

      expect(category?.isActive).toBe(false);

      expect(category?.deletedAt).not.toBeNull();
    });

    it('should return 404 when accessing archived category', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/categories/${categoryAId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(404);
    });

    it('should not return archived category in list', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(200);

      const ids = response.body.data.map(
        (category: { id: string }) => category.id,
      );

      expect(ids).not.toContain(categoryAId);
    });

    it('should return 404 when archiving an already archived category', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${categoryAId}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(404);
    });

    it('should return 404 when another user tries to archive the category', async () => {
      /**
       * Create a fresh category for ownership test.
       */
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          name: 'Ownership Archive Test',
          type: 'EXPENSE',
        })
        .expect(201);

      const ownershipCategoryId = createResponse.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${ownershipCategoryId}`)
        .set('Authorization', `Bearer ${accessTokenB}`)
        .expect(404);

      const category = await prisma.category.findUnique({
        where: {
          id: ownershipCategoryId,
        },
      });

      expect(category).not.toBeNull();
      expect(category?.deletedAt).toBeNull();
      expect(category?.isActive).toBe(true);
    });
  });
});
