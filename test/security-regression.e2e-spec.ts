import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(30_000);

describe('Security Regression (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createE2EApp(moduleFixture.createNestApplication());
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('HTTP security headers', () => {
    it('should include Helmet security headers on API responses', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/protected')
        .expect(401);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['content-security-policy']).toBeDefined();
    });
  });

  describe('Authentication enforcement', () => {
    it('should reject requests without an access token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/protected')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 401,
      });

      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).not.toHaveProperty('stack');
    });

    it('should reject a malformed bearer token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/protected')
        .set('Authorization', 'Bearer not-a-valid-jwt')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 401,
      });

      expect(response.body).not.toHaveProperty('stack');
    });

    it('should reject a token with an unsupported authorization scheme', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/protected')
        .set('Authorization', 'Basic dGVzdDp0ZXN0')
        .expect(401);
    });
  });

  describe('Request ID handling', () => {
    it('should preserve a valid request ID', async () => {
      const requestId = 'security-regression-001';

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/protected')
        .set('x-request-id', requestId)
        .expect(401);

      expect(response.headers['x-request-id']).toBe(requestId);
      expect(response.body.requestId).toBe(requestId);
    });

    it('should replace an unsafe request ID with a generated UUID', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/protected')
        .set('x-request-id', 'invalid request id! with spaces')
        .expect(401);

      const requestId = response.headers['x-request-id'];

      expect(requestId).toEqual(expect.any(String));
      expect(requestId).not.toBe('invalid request id! with spaces');
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(response.body.requestId).toBe(requestId);
    });
  });

  describe('Standardized error response', () => {
    it('should not expose stack traces or internal exception details', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/protected')
        .expect(401);

      expect(response.body).toEqual(
        expect.objectContaining({
          success: false,
          statusCode: 401,
          message: expect.anything(),
          error: expect.any(String),
          path: expect.any(String),
          requestId: expect.any(String),
          timestamp: expect.any(String),
        }),
      );

      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('refreshToken');
    });
  });
});
