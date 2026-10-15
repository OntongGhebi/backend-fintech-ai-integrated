import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EmailVerificationService } from '../src/modules/auth/services/email-verification.service';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(30000);

describe('Input Validation and API Protection (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  const email = `input-validation-${randomUUID()}@example.com`;
  const password = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createE2EApp(moduleFixture.createNestApplication());

    const emailVerificationService = app.get(EmailVerificationService);

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Input Validation User',
        email,
        password,
      })
      .expect(201);

    const userId = registerResponse.body.id as string;
    const verificationToken =
      await emailVerificationService.createToken(userId);

    await emailVerificationService.verifyEmail(verificationToken);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email,
        password,
      })
      .expect(200);

    accessToken = loginResponse.body.accessToken as string;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/auth/register', () => {
    it('rejects an invalid email address', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Invalid Email User',
          email: 'not-an-email',
          password,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.statusCode).toBe(400);
      expect(response.body.message).toBeDefined();
    });

    it('rejects unexpected properties', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Unexpected Property User',
          email: `extra-${randomUUID()}@example.com`,
          password,
          role: 'SUPER_ADMIN',
        })
        .expect(400);
    });

    it('rejects a password shorter than the minimum length', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Short Password User',
          email: `short-password-${randomUUID()}@example.com`,
          password: '123',
        })
        .expect(400);
    });

    it('rejects a name containing only whitespace', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: '   ',
          email: `blank-name-${randomUUID()}@example.com`,
          password,
        })
        .expect(400);
    });
  });

  describe('POST /api/v1/accounts', () => {
    it('rejects an unknown userId property', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Validation Account',
          type: 'BANK',
          userId: randomUUID(),
        })
        .expect(400);
    });

    it('rejects a negative opening balance', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Negative Balance Account',
          type: 'BANK',
          openingBalance: -1000,
        })
        .expect(400);
    });

    it('rejects a lowercase currency code', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Invalid Currency Account',
          type: 'BANK',
          currency: 'idr',
        })
        .expect(400);
    });

    it('rejects an unsupported account type', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Invalid Type Account',
          type: 'CRYPTO_WALLET',
        })
        .expect(400);
    });

    it('rejects an account name longer than the maximum', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'A'.repeat(101),
          type: 'BANK',
        })
        .expect(400);
    });
  });

  describe('POST /api/v1/transactions', () => {
    const validTransactionPayload = {
      accountId: randomUUID(),
      type: 'EXPENSE',
      amount: 10000,
      transactionDate: '2026-10-15T12:00:00+07:00',
      description: 'Validation regression test',
    };

    it('rejects an amount equal to zero', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...validTransactionPayload,
          amount: 0,
        })
        .expect(400);
    });

    it('rejects a negative transaction amount', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...validTransactionPayload,
          amount: -100,
        })
        .expect(400);
    });

    it('rejects an invalid account UUID', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...validTransactionPayload,
          accountId: 'not-a-uuid',
        })
        .expect(400);
    });

    it('rejects an unsupported transaction type', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...validTransactionPayload,
          type: 'CRYPTO',
        })
        .expect(400);
    });

    it('rejects a client-supplied userId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...validTransactionPayload,
          userId: randomUUID(),
        })
        .expect(400);
    });

    it('rejects a transaction description that exceeds the maximum length', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...validTransactionPayload,
          description: 'A'.repeat(501),
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/transactions', () => {
    it('rejects page zero', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/transactions?page=0')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('rejects a limit greater than the maximum', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/transactions?limit=101')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('rejects an invalid transaction type filter', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/transactions?type=CRYPTO')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('rejects an invalid accountId filter', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/transactions?accountId=not-a-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });

  describe('Authentication boundary', () => {
    it('rejects an invalid request before accessing a protected resource', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .send({
          name: 'Unauthenticated Account',
          type: 'BANK',
          openingBalance: -100,
        })
        .expect(401);
    });
  });
});
