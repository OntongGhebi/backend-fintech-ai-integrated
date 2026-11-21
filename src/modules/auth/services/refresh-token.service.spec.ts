import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';

import { PrismaService } from '../../../database/prisma/prisma.service';
import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;

  const prismaMock = {
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const jwtMock = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
    decode: jest.fn(),
  };

  const configMock = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'jwt.accessSecret': 'test-access-secret',
        'jwt.accessExpiresIn': '15m',
        'jwt.refreshSecret': 'test-refresh-secret',
        'jwt.refreshExpiresIn': '7d',
      };

      return values[key];
    }),
  };

  const hash = (token: string) =>
    createHash('sha256').update(token).digest('hex');

  const userId = 'user-id';
  const sessionId = 'session-id';
  const refreshToken = 'old-refresh-token';
  const newRefreshToken = 'new-refresh-token';

  const activeSession = (overrides: Record<string, any> = {}) => ({
    id: sessionId,
    userId,
    refreshTokenHash: hash(refreshToken),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: null,
    user: {
      id: userId,
      status: 'ACTIVE',
      deletedAt: null,
    },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    configMock.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        'jwt.accessSecret': 'test-access-secret',
        'jwt.accessExpiresIn': '15m',
        'jwt.refreshSecret': 'test-refresh-secret',
        'jwt.refreshExpiresIn': '7d',
      };

      return values[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get(RefreshTokenService);
  });

  describe('createSession', () => {
    it('creates a session and returns its id with the refresh token', async () => {
      jwtMock.signAsync.mockResolvedValue(refreshToken);
      jwtMock.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
      });
      prismaMock.session.create.mockResolvedValue({ id: sessionId });

      const result = await service.createSession(
        userId,
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(result).toEqual({
        sessionId: expect.any(String),
        refreshToken,
      });

      expect(jwtMock.signAsync).toHaveBeenCalledWith(
        {
          sub: userId,
          sid: expect.any(String),
          jti: expect.any(String),
        },
        {
          secret: 'test-refresh-secret',
          expiresIn: '7d',
        },
      );

      const [payload] = jwtMock.signAsync.mock.calls[0];

      expect(result.sessionId).toBe(payload.sid);

      expect(prismaMock.session.create).toHaveBeenCalledWith({
        data: {
          id: result.sessionId,
          userId,
          refreshTokenHash: hash(refreshToken),
          expiresAt: expect.any(Date),
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
        },
      });
    });

    it('allows missing request metadata', async () => {
      jwtMock.signAsync.mockResolvedValue(refreshToken);
      jwtMock.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      prismaMock.session.create.mockResolvedValue({ id: sessionId });

      const result = await service.createSession(userId);

      expect(result.refreshToken).toBe(refreshToken);

      expect(prismaMock.session.create).toHaveBeenCalledWith({
        data: {
          id: result.sessionId,
          userId,
          refreshTokenHash: hash(refreshToken),
          expiresAt: expect.any(Date),
          ipAddress: null,
          userAgent: null,
        },
      });
    });

    it('rejects when refresh secret is missing', async () => {
      configMock.get.mockImplementation((key: string) =>
        key === 'jwt.refreshSecret' ? undefined : '15m',
      );

      await expect(service.createSession(userId)).rejects.toThrow(
        'JWT_REFRESH_SECRET is not configured',
      );

      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });

    it('rejects a generated refresh token without expiration', async () => {
      jwtMock.signAsync.mockResolvedValue(refreshToken);
      jwtMock.decode.mockReturnValue({ sub: userId });

      await expect(service.createSession(userId)).rejects.toThrow(
        'Refresh token does not contain an expiration time',
      );

      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });
  });

  describe('rotateSession', () => {
    beforeEach(() => {
      jwtMock.verifyAsync.mockResolvedValue({
        sub: userId,
        sid: sessionId,
        jti: 'refresh-token-jti',
      });

      prismaMock.session.findUnique.mockResolvedValue(activeSession());

      jwtMock.signAsync.mockReset();
      jwtMock.signAsync
        .mockResolvedValueOnce(newRefreshToken)
        .mockResolvedValueOnce('new-access-token');

      jwtMock.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
      });
    });

    it('rejects an invalid refresh token', async () => {
      jwtMock.verifyAsync.mockRejectedValue(new Error('invalid token'));

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );

      expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
    });

    it('rejects when the session does not exist', async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('rejects when the session belongs to another user', async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        activeSession({
          userId: 'another-user-id',
          user: {
            id: 'another-user-id',
            status: 'ACTIVE',
            deletedAt: null,
          },
        }),
      );

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('rejects a revoked session', async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        activeSession({ revokedAt: new Date() }),
      );

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Refresh token has been revoked',
      );

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an expired session', async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        activeSession({
          expiresAt: new Date(Date.now() - 1000),
        }),
      );

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Refresh token has expired',
      );

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an inactive user', async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        activeSession({
          user: {
            id: userId,
            status: 'INACTIVE',
            deletedAt: null,
          },
        }),
      );

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'User account is not active',
      );

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a deleted user', async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        activeSession({
          user: {
            id: userId,
            status: 'ACTIVE',
            deletedAt: new Date(),
          },
        }),
      );

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'User account is not active',
      );

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when the stored refresh token hash does not match', async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        activeSession({
          refreshTokenHash: hash('another-token'),
        }),
      );

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects rotation when the conditional update affects zero rows', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Refresh token has already been rotated or revoked',
      );

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: sessionId,
          userId,
          refreshTokenHash: hash(refreshToken),
          revokedAt: null,
          expiresAt: {
            gt: expect.any(Date),
          },
        },
        data: {
          refreshTokenHash: expect.any(String),
          expiresAt: expect.any(Date),
          lastUsedAt: expect.any(Date),
        },
      });
    });

    it('rotates the refresh token and issues an access token for the same session', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.rotateSession(refreshToken);

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: newRefreshToken,
      });

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: sessionId,
          userId,
          refreshTokenHash: hash(refreshToken),
          revokedAt: null,
          expiresAt: {
            gt: expect.any(Date),
          },
        },
        data: {
          refreshTokenHash: hash(newRefreshToken),
          expiresAt: expect.any(Date),
          lastUsedAt: expect.any(Date),
        },
      });

      expect(jwtMock.signAsync).toHaveBeenNthCalledWith(
        2,
        {
          sub: userId,
          sid: sessionId,
        },
        {
          secret: 'test-access-secret',
          expiresIn: '15m',
        },
      );
    });
  });

  describe('revokeSession', () => {
    it('revokes an active session atomically', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.revokeSession(sessionId, userId),
      ).resolves.toBeUndefined();

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
          expiresAt: {
            gt: expect.any(Date),
          },
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });

      expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it('allows repeated revocation of an already revoked session', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.session.findUnique.mockResolvedValue({
        id: sessionId,
        userId,
        revokedAt: new Date(),
      });

      await expect(
        service.revokeSession(sessionId, userId),
      ).resolves.toBeUndefined();
    });

    it('rejects when the session does not exist', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.session.findUnique.mockResolvedValue(null);

      await expect(service.revokeSession(sessionId, userId)).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('rejects when the session belongs to another user', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.session.findUnique.mockResolvedValue({
        id: sessionId,
        userId: 'another-user-id',
        revokedAt: null,
      });

      await expect(service.revokeSession(sessionId, userId)).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('rejects an unexpected active-session race', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.session.findUnique.mockResolvedValue({
        id: sessionId,
        userId,
        revokedAt: null,
      });

      await expect(service.revokeSession(sessionId, userId)).rejects.toThrow(
        'Unable to revoke authentication session',
      );
    });
  });

  describe('revokeSessionByRefreshToken', () => {
    beforeEach(() => {
      jwtMock.verifyAsync.mockResolvedValue({
        sub: userId,
        sid: sessionId,
        jti: 'refresh-token-jti',
      });
    });

    it('revokes the session only when token, user, session, and hash match', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.revokeSessionByRefreshToken(refreshToken, userId, sessionId),
      ).resolves.toBeUndefined();

      expect(jwtMock.verifyAsync).toHaveBeenCalledWith(refreshToken, {
        secret: 'test-refresh-secret',
        algorithms: ['HS256'],
      });

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: sessionId,
          userId,
          refreshTokenHash: hash(refreshToken),
          revokedAt: null,
          expiresAt: {
            gt: expect.any(Date),
          },
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });
    });

    it('rejects a token belonging to another user', async () => {
      await expect(
        service.revokeSessionByRefreshToken(
          refreshToken,
          'another-user-id',
          sessionId,
        ),
      ).rejects.toThrow('Invalid refresh token');

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a token belonging to another session', async () => {
      await expect(
        service.revokeSessionByRefreshToken(
          refreshToken,
          userId,
          'another-session-id',
        ),
      ).rejects.toThrow('Invalid refresh token');

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a token with an invalid signature', async () => {
      jwtMock.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(
        service.revokeSessionByRefreshToken(refreshToken, userId, sessionId),
      ).rejects.toThrow('Invalid refresh token');

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when the stored hash does not match', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.revokeSessionByRefreshToken(refreshToken, userId, sessionId),
      ).rejects.toThrow('Invalid refresh token');
    });
  });
});
