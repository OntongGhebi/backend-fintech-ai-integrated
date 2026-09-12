import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { AppModule } from './../src/app.module';
import { EmailVerificationService } from './../src/modules/auth/services/email-verification.service';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(30000);

describe('Accounts E2E', () => {
  let app: INestApplication;

  let userAAccessToken: string;
  let userBAccessToken: string;

  let userAId: string;
  let userBId: string;
  let emailVerificationService: EmailVerificationService;

  let accountId: string;

  const userAEmail = `accounts-a-${randomUUID()}@example.com`;
  const userBEmail = `accounts-b-${randomUUID()}@example.com`;

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
        name: 'Accounts User A',
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
        name: 'Accounts User B',
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
        `User A login failed during Accounts E2E setup: ${JSON.stringify(
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
        `User B login failed during Accounts E2E setup: ${JSON.stringify(
          userBLogin.body,
        )}`,
      );
    }

    userBAccessToken = userBLogin.body.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/accounts', () => {
    it('should create an account', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          name: 'BCA Main Account',
          type: 'BANK',
          openingBalance: 1500000,
          currency: 'IDR',
        })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          userId: userAId,
          name: 'BCA Main Account',
          type: 'BANK',
          openingBalance: '1500000',
          currency: 'IDR',
          isActive: true,
        }),
      );

      expect(response.body.id).toEqual(expect.any(String));

      accountId = response.body.id;
    });

    it('should default openingBalance to zero', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          name: 'Cash Account',
          type: 'CASH',
        })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          name: 'Cash Account',
          type: 'CASH',
          openingBalance: '0',
          currency: 'IDR',
          isActive: true,
        }),
      );
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .send({
          name: 'Unauthorized Account',
          type: 'BANK',
        })
        .expect(401);
    });

    it('should reject invalid account type', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          name: 'Invalid Type Account',
          type: 'INVALID',
        })
        .expect(400);
    });

    it('should reject negative opening balance', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          name: 'Negative Balance',
          type: 'BANK',
          openingBalance: -100,
        })
        .expect(400);
    });

    it('should reject invalid currency', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          name: 'Invalid Currency',
          type: 'BANK',
          currency: 'idr',
        })
        .expect(400);
    });

    it('should reject duplicate account names for the same user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          name: 'BCA Main Account',
          type: 'BANK',
        })
        .expect(409);
    });
  });

  describe('GET /api/v1/accounts', () => {
    it('should return accounts belonging to the authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: accountId,
            userId: userAId,
            name: 'BCA Main Account',
          }),
        ]),
      );

      expect(
        response.body.every(
          (account: { userId: string }) => account.userId === userAId,
        ),
      ).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer()).get('/api/v1/accounts').expect(401);
    });
  });

  describe('GET /api/v1/accounts/:id', () => {
    it('should return the authenticated user account', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: accountId,
          userId: userAId,
          name: 'BCA Main Account',
        }),
      );
    });

    it('should not expose another user account', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .expect(404);
    });

    it('should return 404 for a nonexistent account', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/accounts/${randomUUID()}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/accounts/:id', () => {
    it('should update an account', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          name: 'BCA Personal',
          type: 'BANK',
          currency: 'IDR',
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: accountId,
          userId: userAId,
          name: 'BCA Personal',
          type: 'BANK',
          currency: 'IDR',
          openingBalance: '1500000',
        }),
      );
    });

    it('should not allow openingBalance to be updated', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          openingBalance: 999999999,
        })
        .expect(400);
    });

    it('should not allow another user to update the account', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .send({
          name: 'Hijacked Account',
        })
        .expect(404);
    });

    it('should reject duplicate account name', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .send({
          name: 'Cash Account',
        })
        .expect(409);
    });
  });

  describe('DELETE /api/v1/accounts/:id', () => {
    it('should archive an account', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Account archived successfully',
      });
    });

    it('should not return an archived account by id', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(404);
    });

    it('should not return an archived account in the list', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(200);

      expect(
        response.body.some(
          (account: { id: string }) => account.id === accountId,
        ),
      ).toBe(false);
    });

    it('should not allow an archived account to be archived again', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${userAAccessToken}`)
        .expect(404);
    });

    it('should not allow another user to archive the account', async () => {
      /*
       * The account has already been archived by User A,
       * therefore User B must still receive 404.
       */
      await request(app.getHttpServer())
        .delete(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${userBAccessToken}`)
        .expect(404);
    });
  });
});
