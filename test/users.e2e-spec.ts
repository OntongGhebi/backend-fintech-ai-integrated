import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { createE2EApp } from './helpers/create-e2e-app';
import { createUnthrottledThrottlerStorage } from './helpers/unthrottled-throttler-storage';

jest.setTimeout(30000);

describe('Users E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const apiPrefix = '/api/v1';

  const testUser = {
    email: `users-e2e-${Date.now()}@example.com`,
    password: 'Password123!',
    name: 'Users E2E Test',
  };

  let userId: string;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ThrottlerStorage)
      .useValue(createUnthrottledThrottlerStorage())
      .compile();

    app = await createE2EApp(moduleFixture.createNestApplication());

    prisma = app.get(PrismaService);

    const passwordHash = await bcrypt.hash(testUser.password, 12);

    const user = await prisma.user.create({
      data: {
        email: testUser.email,
        passwordHash,
        name: testUser.name,
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
      },
    });

    userId = user.id;

    await prisma.userPreference.create({
      data: {
        userId,
      },
    });

    const loginResponse = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    accessToken = loginResponse.body.accessToken;
    refreshToken = loginResponse.body.refreshToken;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.session.deleteMany({
        where: {
          userId,
        },
      });

      await prisma.emailVerificationToken.deleteMany({
        where: {
          userId,
        },
      });

      await prisma.userPreference.deleteMany({
        where: {
          userId,
        },
      });

      await prisma.user.delete({
        where: {
          id: userId,
        },
      });
    }

    await app.close();
  });

  describe('GET /users/me', () => {
    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/users/me`)
        .expect(401);
    });

    it('should reject invalid access token', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/users/me`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return current user profile', async () => {
      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/users/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: userId,
        email: testUser.email,
        name: testUser.name,
        emailVerifiedAt: true,
        status: 'ACTIVE',
      });

      expect(response.body).toHaveProperty('preferences');

      expect(response.body).not.toHaveProperty('passwordHash');
    });
  });

  describe('PATCH /users/me', () => {
    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me`)
        .send({
          name: 'Updated Name',
        })
        .expect(401);
    });

    it('should reject unknown properties', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Updated Name',
          unknownField: 'not-allowed',
        })
        .expect(400);
    });

    it('should update current user name', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Updated Users E2E',
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Users E2E');
    });

    it('should reject duplicate email', async () => {
      const duplicateEmail = `duplicate-${Date.now()}@example.com`;

      const passwordHash = await bcrypt.hash('Password123!', 12);

      const anotherUser = await prisma.user.create({
        data: {
          email: duplicateEmail,
          passwordHash,
          name: 'Another User',
          emailVerifiedAt: new Date(),
          status: 'ACTIVE',
        },
      });

      await prisma.userPreference.create({
        data: {
          userId: anotherUser.id,
        },
      });

      await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: duplicateEmail,
        })
        .expect(409);

      await prisma.userPreference.deleteMany({
        where: {
          userId: anotherUser.id,
        },
      });

      await prisma.user.delete({
        where: {
          id: anotherUser.id,
        },
      });
    });

    it('should normalize updated email', async () => {
      const newEmail = `updated-${Date.now()}@example.com`;

      const response = await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: `  ${newEmail.toUpperCase()}  `,
        })
        .expect(200);

      expect(response.body.email).toBe(newEmail);
      expect(response.body.emailVerifiedAt).toBe(false);

      testUser.email = newEmail;

      const updatedUser = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      expect(updatedUser?.email).toBe(newEmail);
      expect(updatedUser?.emailVerifiedAt).toBeNull();

      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          emailVerifiedAt: new Date(),
        },
      });
    });
  });

  describe('GET /users/me/preferences', () => {
    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/users/me/preferences`)
        .expect(401);
    });

    it('should return preferences', async () => {
      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/users/me/preferences`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        currency: 'IDR',
        timezone: 'Asia/Jakarta',
        locale: 'id-ID',
        weekStartsOn: 1,
      });
    });
  });

  describe('PATCH /users/me/preferences', () => {
    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me/preferences`)
        .send({
          currency: 'USD',
        })
        .expect(401);
    });

    it('should reject invalid weekStartsOn', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me/preferences`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          weekStartsOn: 99,
        })
        .expect(400);
    });

    it('should reject unknown properties', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me/preferences`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currency: 'USD',
          unknownField: 'not-allowed',
        })
        .expect(400);
    });

    it('should update preferences', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me/preferences`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currency: 'USD',
          timezone: 'Asia/Makassar',
          locale: 'en-US',
          weekStartsOn: 0,
        })
        .expect(200);

      expect(response.body).toEqual({
        currency: 'USD',
        timezone: 'Asia/Makassar',
        locale: 'en-US',
        weekStartsOn: 0,
      });
    });
  });

  describe('PATCH /users/me/password', () => {
    let passwordRefreshToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      passwordRefreshToken = loginResponse.body.refreshToken;
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me/password`)
        .send({
          currentPassword: testUser.password,
          newPassword: 'NewPassword123!',
        })
        .expect(401);
    });

    it('should reject incorrect current password', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me/password`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword123!',
        })
        .expect(401);
    });

    it('should reject the same password', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me/password`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: testUser.password,
          newPassword: testUser.password,
        })
        .expect(409);
    });

    it('should reject invalid password length', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me/password`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: testUser.password,
          newPassword: '123',
        })
        .expect(400);
    });

    it('should reject unknown properties', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me/password`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: testUser.password,
          newPassword: 'NewPassword123!',
          unknownField: 'not-allowed',
        })
        .expect(400);
    });

    it('should change password successfully', async () => {
      await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me/password`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: testUser.password,
          newPassword: 'NewPassword123!',
        })
        .expect(200);

      const oldLogin = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({
          email: testUser.email,
          password: 'NewPassword123!',
        })
        .expect(200);

      expect(newLogin.body.accessToken).toBeDefined();
      expect(newLogin.body.refreshToken).toBeDefined();

      const oldRefresh = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .send({
          refreshToken: passwordRefreshToken,
        });

      expect(oldRefresh.status).toBe(401);

      testUser.password = 'NewPassword123!';
    });
  });

  describe('GET /users/me/sessions', () => {
    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/users/me/sessions`)
        .expect(401);
    });

    it('should return user sessions', async () => {
      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/users/me/sessions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('sessions');

      expect(Array.isArray(response.body.sessions)).toBe(true);

      for (const session of response.body.sessions) {
        expect(session).not.toHaveProperty('refreshTokenHash');
      }
    });
  });

  describe('DELETE /users/me/sessions/:sessionId', () => {
    let sessionId: string;
    let sessionRefreshToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      sessionRefreshToken = loginResponse.body.refreshToken;

      const sessionsResponse = await request(app.getHttpServer())
        .get(`${apiPrefix}/users/me/sessions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const sessions = sessionsResponse.body.sessions;

      const session = sessions.find(
        (item: { revokedAt: Date | null }) => item.revokedAt === null,
      );

      expect(session).toBeDefined();

      sessionId = session.id;
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .delete(`${apiPrefix}/users/me/sessions/${sessionId}`)
        .expect(401);
    });

    it('should return 404 for unknown session', async () => {
      await request(app.getHttpServer())
        .delete(
          `${apiPrefix}/users/me/sessions/00000000-0000-0000-0000-000000000000`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should revoke the selected session', async () => {
      await request(app.getHttpServer())
        .delete(`${apiPrefix}/users/me/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const refreshResponse = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .send({
          refreshToken: sessionRefreshToken,
        });

      expect(refreshResponse.status).toBe(401);

      const session = await prisma.session.findUnique({
        where: {
          id: sessionId,
        },
      });

      expect(session).not.toBeNull();
      expect(session?.revokedAt).not.toBeNull();
    });

    it('should not allow revoking another user session', async () => {
      const anotherEmail = `session-owner-${Date.now()}@example.com`;

      const passwordHash = await bcrypt.hash('Password123!', 12);

      const anotherUser = await prisma.user.create({
        data: {
          email: anotherEmail,
          passwordHash,
          name: 'Another Session Owner',
          emailVerifiedAt: new Date(),
          status: 'ACTIVE',
        },
      });

      await prisma.userPreference.create({
        data: {
          userId: anotherUser.id,
        },
      });

      const anotherLogin = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({
          email: anotherEmail,
          password: 'Password123!',
        })
        .expect(200);

      const anotherRefreshToken = anotherLogin.body.refreshToken;

      const anotherSessions = await request(app.getHttpServer())
        .get(`${apiPrefix}/users/me/sessions`)
        .set('Authorization', `Bearer ${anotherLogin.body.accessToken}`)
        .expect(200);

      const anotherSession = anotherSessions.body.sessions.find(
        (item: { revokedAt: Date | null }) => item.revokedAt === null,
      );

      expect(anotherSession).toBeDefined();

      await request(app.getHttpServer())
        .delete(`${apiPrefix}/users/me/sessions/${anotherSession.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      const refreshResponse = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/refresh`)
        .send({
          refreshToken: anotherRefreshToken,
        });

      expect(refreshResponse.status).toBe(200);

      await prisma.session.deleteMany({
        where: {
          userId: anotherUser.id,
        },
      });

      await prisma.userPreference.deleteMany({
        where: {
          userId: anotherUser.id,
        },
      });

      await prisma.user.delete({
        where: {
          id: anotherUser.id,
        },
      });
    });
  });

  describe('DELETE /users/me/sessions', () => {
    let refreshTokens: string[] = [];

    beforeEach(async () => {
      refreshTokens = [];

      for (let i = 0; i < 3; i += 1) {
        const response = await request(app.getHttpServer())
          .post(`${apiPrefix}/auth/login`)
          .send({
            email: testUser.email,
            password: testUser.password,
          })
          .expect(200);

        refreshTokens.push(response.body.refreshToken);
      }
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .delete(`${apiPrefix}/users/me/sessions`)
        .expect(401);
    });

    it('should revoke all active sessions', async () => {
      const response = await request(app.getHttpServer())
        .delete(`${apiPrefix}/users/me/sessions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty(
        'message',
        'All sessions revoked successfully',
      );

      expect(response.body.revokedCount).toBeGreaterThanOrEqual(3);

      for (const token of refreshTokens) {
        const refreshResponse = await request(app.getHttpServer())
          .post(`${apiPrefix}/auth/refresh`)
          .send({
            refreshToken: token,
          });

        expect(refreshResponse.status).toBe(401);
      }

      const activeSessions = await prisma.session.count({
        where: {
          userId,
          revokedAt: null,
        },
      });

      expect(activeSessions).toBe(0);
    });
  });
});
