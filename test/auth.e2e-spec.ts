import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma/prisma.service';
import { EmailVerificationService } from './../src/modules/auth/services/email-verification.service';
import { createE2EApp } from './helpers/create-e2e-app';
import { createUnthrottledThrottlerStorage } from './helpers/unthrottled-throttler-storage';

jest.setTimeout(30000);

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emailVerificationService: EmailVerificationService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ThrottlerStorage)
      .useValue(createUnthrottledThrottlerStorage())
      .compile();

    app = await createE2EApp(moduleFixture.createNestApplication());

    prisma = app.get(PrismaService);
    emailVerificationService = app.get(EmailVerificationService);
  });

  afterAll(async () => {
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

  describe('POST /api/v1/auth/verify-email', () => {
    it('should verify a registered user email successfully', async () => {
      const email = `e2e-verify-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Verify User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const token = await emailVerificationService.createToken(userId);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token,
        })
        .expect(200);

      expect(response.body).toEqual({
        message: 'Email verified successfully',
      });

      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          emailVerifiedAt: true,
        },
      });

      expect(user).not.toBeNull();
      expect(user?.emailVerifiedAt).toEqual(expect.any(Date));
    });

    it('should reject an invalid verification token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: 'invalid-verification-token',
        })
        .expect(404);

      expect(response.body.message).toBe('Invalid verification token');
    });

    it('should reject an already-used verification token', async () => {
      const email = `e2e-used-token-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Used Token User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const token = await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token,
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token,
        })
        .expect(409);

      expect(response.body.message).toBe(
        'Verification token has already been used',
      );
    });

    it('should reject an expired verification token', async () => {
      const email = `e2e-expired-token-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Expired Token User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const token = await emailVerificationService.createToken(userId);
      const tokenHash = emailVerificationService.hashToken(token);

      await prisma.emailVerificationToken.update({
        where: {
          tokenHash,
        },
        data: {
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token,
        })
        .expect(409);

      expect(response.body.message).toBe('Verification token has expired');
    });

    it('should not verify email when the token is invalid', async () => {
      const email = `e2e-invalid-token-user-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Invalid Token User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: 'definitely-invalid-token',
        })
        .expect(404);

      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          emailVerifiedAt: true,
        },
      });

      expect(user?.emailVerifiedAt).toBeNull();
    });

    it('should allow login after successful email verification', async () => {
      const email = `e2e-verified-login-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Verified Login User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const token = await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      expect(loginResponse.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: {
          id: userId,
          email,
          name: 'E2E Verified Login User',
          emailVerified: true,
        },
      });
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const email = `e2e-login-success-${Date.now()}@example.com`;
      const password = 'Password123!';

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Login User',
          email,
          password,
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password,
        })
        .expect(200);

      expect(response.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: {
          id: userId,
          email,
          name: 'E2E Login User',
          emailVerified: true,
        },
      });

      expect(response.body.accessToken).toMatch(
        /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/,
      );

      expect(response.body.refreshToken).toEqual(expect.any(String));
      expect(response.body.refreshToken.length).toBeGreaterThan(0);
    });

    it('should reject login when email does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: `e2e-nonexistent-${Date.now()}@example.com`,
          password: 'Password123!',
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should reject login when password is incorrect', async () => {
      const email = `e2e-wrong-password-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Wrong Password User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should reject login when email is not verified', async () => {
      const email = `e2e-unverified-${Date.now()}@example.com`;

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Unverified User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should reject login when account is inactive', async () => {
      const email = `e2e-inactive-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Inactive User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          status: 'DEACTIVATED',
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should normalize email during login', async () => {
      const email = `e2e-login-normalize-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Login Normalize User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: `  ${email.toUpperCase()}  `,
          password: 'Password123!',
        })
        .expect(200);

      expect(response.body.user).toEqual({
        id: userId,
        email,
        name: 'E2E Login Normalize User',
        emailVerified: true,
      });

      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.refreshToken).toEqual(expect.any(String));
    });

    it('should not expose sensitive user data in login response', async () => {
      const email = `e2e-login-sensitive-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Login Sensitive User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(response.body.user).not.toHaveProperty('refreshToken');
    });

    it('should reject invalid login data', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: '123',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject unknown properties because of strict validation', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          role: 'ADMIN',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should not issue access or refresh tokens when authentication fails', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: `e2e-no-token-${Date.now()}@example.com`,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body).not.toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('refreshToken');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return the currently authenticated user', async () => {
      const email = `e2e-me-success-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Me User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const accessToken = loginResponse.body.accessToken as string;

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        id: userId,
        email,
        name: 'E2E Me User',
        emailVerified: true,
        status: 'ACTIVE',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should reject request without access token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject malformed authorization header', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'InvalidToken')
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject invalid access token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.access.token')
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should not expose password hash in /me response', async () => {
      const email = `e2e-me-sensitive-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Me Sensitive User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const accessToken = loginResponse.body.accessToken as string;

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('refreshToken');
    });

    it('should return the user represented by the access token', async () => {
      const emailA = `e2e-me-user-a-${Date.now()}@example.com`;
      const emailB = `e2e-me-user-b-${Date.now()}@example.com`;

      const registerA = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E User A',
          email: emailA,
          password: 'Password123!',
        })
        .expect(201);

      const registerB = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E User B',
          email: emailB,
          password: 'Password123!',
        })
        .expect(201);

      const userAId = registerA.body.id as string;
      const userBId = registerB.body.id as string;

      const verificationTokenA =
        await emailVerificationService.createToken(userAId);

      const verificationTokenB =
        await emailVerificationService.createToken(userBId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationTokenA,
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationTokenB,
        })
        .expect(200);

      const loginA = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: emailA,
          password: 'Password123!',
        })
        .expect(200);

      const accessTokenA = loginA.body.accessToken as string;

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(200);

      expect(response.body.id).toBe(userAId);
      expect(response.body.id).not.toBe(userBId);
      expect(response.body.email).toBe(emailA);
      expect(response.body.name).toBe('E2E User A');
    });
  });

  describe('GET /api/v1/auth/protected', () => {
    it('should allow access with a valid access token', async () => {
      const email = `e2e-protected-success-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Protected User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const accessToken = loginResponse.body.accessToken as string;

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/protected')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Authenticated access granted',
        userId,
      });
    });

    it('should reject access without an access token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/protected')
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject access with an invalid access token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/protected')
        .set('Authorization', 'Bearer invalid.access.token')
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should return the authenticated user id from the access token', async () => {
      const email = `e2e-protected-user-id-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Protected User ID',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const accessToken = loginResponse.body.accessToken as string;

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/protected')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.userId).toBe(userId);
      expect(response.body.userId).toEqual(expect.any(String));
    });

    it('should reject malformed authorization header', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/protected')
        .set('Authorization', 'InvalidToken')
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh tokens successfully with a valid refresh token', async () => {
      const email = `e2e-refresh-success-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Refresh User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const oldRefreshToken = loginResponse.body.refreshToken as string;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: oldRefreshToken,
        })
        .expect(200);

      expect(response.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });

      expect(response.body.refreshToken).not.toBe(oldRefreshToken);
      expect(response.body.accessToken).not.toBe('');
    });

    it('should reject the old refresh token after rotation', async () => {
      const email = `e2e-refresh-old-token-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Old Refresh Token User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const oldRefreshToken = loginResponse.body.refreshToken as string;

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: oldRefreshToken,
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: oldRefreshToken,
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should allow the newly rotated refresh token to be used', async () => {
      const email = `e2e-refresh-new-token-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E New Refresh Token User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken as string;

      const firstRefresh = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken,
        })
        .expect(200);

      const newRefreshToken = firstRefresh.body.refreshToken as string;

      const secondRefresh = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: newRefreshToken,
        })
        .expect(200);

      expect(secondRefresh.body.accessToken).toEqual(expect.any(String));
      expect(secondRefresh.body.refreshToken).toEqual(expect.any(String));
      expect(secondRefresh.body.refreshToken).not.toBe(newRefreshToken);
    });

    it('should reject an invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token',
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject an expired refresh token', async () => {
      const email = `e2e-refresh-expired-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Expired Refresh User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken as string;

      await prisma.session.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken,
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should allow only one concurrent refresh using the same token', async () => {
      const email = `e2e-refresh-race-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Refresh Race User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken as string;

      const [firstResponse, secondResponse] = await Promise.all([
        request(app.getHttpServer()).post('/api/v1/auth/refresh').send({
          refreshToken,
        }),

        request(app.getHttpServer()).post('/api/v1/auth/refresh').send({
          refreshToken,
        }),
      ]);

      const statuses = [firstResponse.status, secondResponse.status].sort(
        (a, b) => a - b,
      );

      expect(statuses).toEqual([200, 401]);

      const successfulResponse =
        firstResponse.status === 200 ? firstResponse : secondResponse;

      expect(successfulResponse.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });

      const sessions = await prisma.session.findMany({
        where: {
          userId,
        },
      });

      expect(sessions).toHaveLength(1);
      expect(sessions[0].revokedAt).toBeNull();
    });

    it('should reject refresh request with missing refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject refresh request with unknown properties', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: 'invalid-token',
          userId: 'attacker-user-id',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully with valid access and refresh tokens', async () => {
      const email = `e2e-logout-success-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Logout User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const accessToken = loginResponse.body.accessToken as string;
      const refreshToken = loginResponse.body.refreshToken as string;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refreshToken,
        })
        .expect(200);

      expect(response.body).toEqual({
        message: 'Logout successfully',
      });
    });

    it('should revoke the session during logout', async () => {
      const email = `e2e-logout-revoke-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Logout Revoke User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const accessToken = loginResponse.body.accessToken as string;
      const refreshToken = loginResponse.body.refreshToken as string;

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refreshToken,
        })
        .expect(200);

      const sessions = await prisma.session.findMany({
        where: {
          userId,
        },
        select: {
          revokedAt: true,
        },
      });

      expect(sessions).toHaveLength(1);
      expect(sessions[0].revokedAt).toEqual(expect.any(Date));
    });

    it('should reject the refresh token after logout', async () => {
      const email = `e2e-logout-refresh-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Logout Refresh User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const accessToken = loginResponse.body.accessToken as string;
      const refreshToken = loginResponse.body.refreshToken as string;

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refreshToken,
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken,
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject logout without an access token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({
          refreshToken: 'invalid-refresh-token',
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject logout with a refresh token belonging to another user', async () => {
      const emailA = `e2e-logout-user-a-${Date.now()}@example.com`;
      const emailB = `e2e-logout-user-b-${Date.now()}@example.com`;

      const registerA = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Logout User A',
          email: emailA,
          password: 'Password123!',
        })
        .expect(201);

      const registerB = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Logout User B',
          email: emailB,
          password: 'Password123!',
        })
        .expect(201);

      const userAId = registerA.body.id as string;
      const userBId = registerB.body.id as string;

      const verificationTokenA =
        await emailVerificationService.createToken(userAId);

      const verificationTokenB =
        await emailVerificationService.createToken(userBId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationTokenA,
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationTokenB,
        })
        .expect(200);

      const loginA = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: emailA,
          password: 'Password123!',
        })
        .expect(200);

      const loginB = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: emailB,
          password: 'Password123!',
        })
        .expect(200);

      const accessTokenA = loginA.body.accessToken as string;
      const refreshTokenB = loginB.body.refreshToken as string;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          refreshToken: refreshTokenB,
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');

      const sessionsB = await prisma.session.findMany({
        where: {
          userId: userBId,
        },
        select: {
          revokedAt: true,
        },
      });

      expect(sessionsB).toHaveLength(1);
      expect(sessionsB[0].revokedAt).toBeNull();
    });

    it('should reject logout when refresh token is missing', async () => {
      const email = `e2e-logout-missing-refresh-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Logout Missing Refresh',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;

      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const accessToken = loginResponse.body.accessToken as string;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Security and error cases', () => {
    it('should reject malformed bearer token on /me', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer')
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject malformed bearer token on /protected', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/protected')
        .set('Authorization', 'Bearer')
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject verify-email request with missing token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject verify-email request with unknown properties', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: 'invalid-token',
          userId: 'attacker-user-id',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should not create a session when login fails because email does not exist', async () => {
      const email = `e2e-no-session-${Date.now()}@example.com`;

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      const user = await prisma.user.findUnique({
        where: {
          email,
        },
        select: {
          id: true,
        },
      });

      expect(user).toBeNull();
    });

    it('should reject refresh token with excessive length through validation', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: 'a'.repeat(4097),
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject logout with excessive refresh token length through validation', async () => {
      const email = `e2e-logout-validation-${Date.now()}@example.com`;

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'E2E Logout Validation User',
          email,
          password: 'Password123!',
        })
        .expect(201);

      const userId = registerResponse.body.id as string;
      const verificationToken =
        await emailVerificationService.createToken(userId);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .send({
          refreshToken: 'a'.repeat(4097),
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });
  });
});
