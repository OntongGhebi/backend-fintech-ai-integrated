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

  const jwtServiceMock = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
    decode: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'jwt.accessSecret': 'test-access-secret',
        'jwt.accessExpiresIn': '15m',
        'jwt.refreshSecret': 'test-refresh-secret',
        'jwt.refreshExpiresIn': '7d',
      };

      return values[key];
    }),
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'jwt.accessSecret': 'test-access-secret',
        'jwt.accessExpiresIn': '15m',
        'jwt.refreshSecret': 'test-refresh-secret',
        'jwt.refreshExpiresIn': '7d',
      };

      if (!(key in values)) {
        throw new Error(`Missing config: ${key}`);
      }

      return values[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: JwtService,
          useValue: jwtServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<RefreshTokenService>(RefreshTokenService);
  });

  describe('createSession', () => {
    it('should create a session and return refresh token', async () => {
      const refreshToken = 'test-refresh-token';

      jwtServiceMock.signAsync.mockResolvedValue(refreshToken);

      jwtServiceMock.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
      });

      prismaMock.session.create.mockResolvedValue({
        id: 'session-id',
      });

      const result = await service.createSession(
        'user-id',
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(result).toBe(refreshToken);

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        {
          sub: 'user-id',
          sid: expect.any(String),
          jti: expect.any(String),
        },
        {
          secret: 'test-refresh-secret',
          expiresIn: '7d',
        },
      );

      expect(prismaMock.session.create).toHaveBeenCalledWith({
        data: {
          id: expect.any(String),
          userId: 'user-id',
          refreshTokenHash: expect.any(String),
          expiresAt: expect.any(Date),
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
        },
      });
    });

    it('should allow missing request metadata', async () => {
      const refreshToken = 'test-refresh-token';

      jwtServiceMock.signAsync.mockResolvedValue(refreshToken);

      jwtServiceMock.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
      });

      prismaMock.session.create.mockResolvedValue({
        id: 'session-id',
      });

      await service.createSession('user-id');

      expect(prismaMock.session.create).toHaveBeenCalledWith({
        data: {
          id: expect.any(String),
          userId: 'user-id',
          refreshTokenHash: expect.any(String),
          expiresAt: expect.any(Date),
          ipAddress: null,
          userAgent: null,
        },
      });
    });
  });

  describe('rotateSession', () => {
    const refreshToken = 'old-refresh-token';
    const newRefreshToken = 'new-refresh-token';

    beforeEach(() => {
      jwtServiceMock.verifyAsync.mockResolvedValue({
        sub: 'user-id',
        sid: 'session-id',
      });

      jwtServiceMock.signAsync.mockReset();

      prismaMock.session.findUnique.mockResolvedValue({
        id: 'session-id',
        userId: 'user-id',
        refreshTokenHash:
          '9f8f4f5f6f4f4c7f4a8c9c3c7d4d3d2d4f3e2f1f0e9d8c7b6a5a4a3a2a1',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: null,
        user: {
          id: 'user-id',
          status: 'ACTIVE',
        },
      });

      jwtServiceMock.signAsync
        .mockResolvedValueOnce(newRefreshToken)
        .mockResolvedValueOnce('new-access-token');

      jwtServiceMock.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
      });
    });

    it('should reject an invalid refresh token', async () => {
      jwtServiceMock.verifyAsync.mockRejectedValue(new Error('invalid token'));

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );

      expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
    });

    it('should reject when session does not exist', async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should reject when user and token subject do not match', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'session-id',
        userId: 'different-user-id',
        refreshTokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: null,
        user: {
          id: 'different-user-id',
          status: 'ACTIVE',
        },
      });

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should reject a revoked session', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'session-id',
        userId: 'user-id',
        refreshTokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: new Date(),
        user: {
          id: 'user-id',
          status: 'ACTIVE',
        },
      });

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Refresh token has been revoked',
      );
    });

    it('should reject an expired session', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'session-id',
        userId: 'user-id',
        refreshTokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        user: {
          id: 'user-id',
          status: 'ACTIVE',
        },
      });

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Refresh token has expired',
      );
    });

    it('should reject rotation when conditional session update affects zero rows', async () => {
      const refreshToken = 'valid-refresh-token';
      const userId = 'user-123';
      const sessionId = 'session-123';

      jwtServiceMock.verifyAsync.mockResolvedValue({
        sub: userId,
        sid: sessionId,
      });

      jwtServiceMock.signAsync
        .mockResolvedValueOnce('new-refresh-token')
        .mockResolvedValueOnce('new-access-token');

      jwtServiceMock.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
      });

      prismaMock.session.findUnique.mockResolvedValue({
        id: sessionId,
        userId,
        refreshTokenHash: createHash('sha256')
          .update(refreshToken)
          .digest('hex'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: null,
        user: {
          id: userId,
          status: 'ACTIVE',
        },
      });

      prismaMock.session.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Refresh token has already been rotated or revoked',
      );

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: sessionId,
          userId,
          refreshTokenHash: createHash('sha256')
            .update(refreshToken)
            .digest('hex'),
          revokedAt: null,
        },
        data: expect.objectContaining({
          refreshTokenHash: expect.any(String),
          expiresAt: expect.any(Date),
          lastUsedAt: expect.any(Date),
        }),
      });
    });

    it('should reject an inactive user', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'session-id',
        userId: 'user-id',
        refreshTokenHash: 'different-hash',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: null,
        user: {
          id: 'user-id',
          status: 'INACTIVE',
        },
      });

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'User account is not active',
      );
    });

    it('should update the session after successful rotation', async () => {
      const crypto = require('crypto');

      const oldHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');

      prismaMock.session.findUnique.mockResolvedValue({
        id: 'session-id',
        userId: 'user-id',
        refreshTokenHash: oldHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: null,
        user: {
          id: 'user-id',
          status: 'ACTIVE',
        },
      });

      prismaMock.session.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.rotateSession(refreshToken);

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: newRefreshToken,
      });

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'session-id',
          userId: 'user-id',
          refreshTokenHash: oldHash,
          revokedAt: null,
        },
        data: {
          refreshTokenHash: expect.any(String),
          expiresAt: expect.any(Date),
          lastUsedAt: expect.any(Date),
        },
      });
    });
  });

  describe('revokeSession', () => {
    it('should revoke an active session', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'session-id',
        userId: 'user-id',
        revokedAt: null,
      });

      await service.revokeSession('session-id', 'user-id');

      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: {
          id: 'session-id',
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });
    });
  });
});
