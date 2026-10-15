import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../database/prisma/prisma.service';
import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService security regression', () => {
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
  };

  const refreshToken = 'valid-refresh-token';
  const userId = '11111111-1111-4111-8111-111111111111';
  const sessionId = '22222222-2222-4222-8222-222222222222';

  const activeSession = (overrides: Record<string, unknown> = {}) => ({
    id: sessionId,
    userId,
    refreshTokenHash: createHash('sha256').update(refreshToken).digest('hex'),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    user: {
      id: userId,
      status: 'ACTIVE',
    },
    ...overrides,
  });

  beforeEach(async () => {
    jest.resetAllMocks();

    configServiceMock.get.mockImplementation((key: string) => {
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

    jwtServiceMock.verifyAsync.mockResolvedValue({
      sub: userId,
      sid: sessionId,
      jti: 'refresh-token-jti',
    });

    prismaMock.session.findUnique.mockResolvedValue(activeSession());
  });

  describe('JWT verification', () => {
    it('restricts refresh-token verification to HS256', async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );

      expect(jwtServiceMock.verifyAsync).toHaveBeenCalledWith(refreshToken, {
        secret: 'test-refresh-secret',
        algorithms: ['HS256'],
      });
    });

    it.each([
      ['missing subject', { sid: sessionId }],
      ['empty subject', { sub: '', sid: sessionId }],
      ['missing session id', { sub: userId }],
      ['empty session id', { sub: userId, sid: '' }],
      ['non-string subject', { sub: 123, sid: sessionId }],
      ['non-string session id', { sub: userId, sid: 123 }],
      ['null payload', null],
    ])('rejects a token payload with %s', async (_label, payload) => {
      jwtServiceMock.verifyAsync.mockResolvedValueOnce(payload);

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );

      expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a token signed with an invalid signature', async () => {
      jwtServiceMock.verifyAsync.mockRejectedValueOnce(
        new Error('invalid signature'),
      );

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );

      expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('session integrity', () => {
    it('rejects a refresh token whose hash differs from the stored hash', async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        activeSession({
          refreshTokenHash: createHash('sha256')
            .update('a-different-token')
            .digest('hex'),
        }),
      );

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
    });

    it('rejects a session owned by a different user', async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        activeSession({
          userId: '33333333-3333-4333-8333-333333333333',
          user: {
            id: '33333333-3333-4333-8333-333333333333',
            status: 'ACTIVE',
          },
        }),
      );

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('does not rotate a revoked session', async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        activeSession({
          revokedAt: new Date(),
        }),
      );

      await expect(service.rotateSession(refreshToken)).rejects.toThrow(
        'Refresh token has been revoked',
      );

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects replay when another request has already rotated the token', async () => {
      jwtServiceMock.signAsync
        .mockResolvedValueOnce('new-refresh-token')
        .mockResolvedValueOnce('new-access-token');

      jwtServiceMock.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
      });

      prismaMock.session.updateMany.mockResolvedValueOnce({
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
        data: {
          refreshTokenHash: expect.any(String),
          expiresAt: expect.any(Date),
          lastUsedAt: expect.any(Date),
        },
      });
    });
  });

  describe('session ownership during revocation', () => {
    it('does not allow a user to revoke another user session', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: sessionId,
        userId: '33333333-3333-4333-8333-333333333333',
        revokedAt: null,
      });

      await expect(service.revokeSession(sessionId, userId)).rejects.toThrow(
        'Invalid refresh token',
      );

      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it('does not update a session that is already revoked', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: sessionId,
        userId,
        revokedAt: new Date(),
      });

      await expect(
        service.revokeSession(sessionId, userId),
      ).resolves.toBeUndefined();

      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });
  });
});
