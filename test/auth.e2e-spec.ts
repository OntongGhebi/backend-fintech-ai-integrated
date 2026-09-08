import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(30000);

describe('Auth Registration (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createE2EApp(moduleFixture.createNestApplication());
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const email = `e2e-${Date.now()}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Test User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(String),
        email,
        name: 'E2E Test User',
        emailVerified: false,
      });
    });

    it('should normalize email and trim name during registration', async () => {
      const email = `e2e-normalize-${Date.now()}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: '  E2E Normalize User  ',
          email: `  ${email.toUpperCase()}  `,
          password: 'Password123!',
        })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(String),
        email,
        name: 'E2E Normalize User',
        emailVerified: false,
      });
    });

    it('should not expose password hash or verification token', async () => {
      const email = `e2e-sensitive-${Date.now()}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Sensitive Test',
          email,
          password: 'Password123!',
        })
        .expect(201);

      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('verificationToken');
      expect(response.body).not.toHaveProperty('token');
    });

    it('should reject duplicate email registration', async () => {
      const email = `e2e-duplicate-${Date.now()}@example.com`;

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'First User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Second User',
          email,
          password: 'Password123!',
        })
        .expect(409);

      expect(response.body.message).toBe('Email already registered');
    });

    it('should reject invalid registration data', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'A',
          email: 'invalid-email',
          password: '123',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject unknown properties because of strict validation', async () => {
      const email = `e2e-validation-${Date.now()}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Validation User',
          email,
          password: 'Password123!',
          role: 'ADMIN',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });
  });
});
