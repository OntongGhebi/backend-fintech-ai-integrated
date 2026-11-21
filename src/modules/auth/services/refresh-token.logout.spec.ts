import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../database/prisma/prisma.service';
import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService logout consistency', () => {
  let service: RefreshTokenService;

  const prismaMock = {
    session: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const jwtMock = {
    verifyAsync: jest.fn(),
  };

  const configMock = {
    get: jest.fn(),
  };

  const userId = '11111111-1111-4111-8111-111111111111';
  const sessionId = '22222222-2222-4222-8222-222222222222';
  const refreshToken = 'valid-refresh-token';

  const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

  beforeEach(async () => {
    jest.clearAllMocks();

    configMock.get.mockImplementation((key: string) => {
      if (key === 'jwt.refreshSecret') {
        return 'test-refresh-secret';
      }

      return undefined;
    });

    jwtMock.verifyAsync.mockResolvedValue({
      sub: userId,
      sid: sessionId,
      jti: 'refresh-token-jti',
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

  describe('revokeSession', () => {
    it('revokes an active, unexpired session atomically', async () => {
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
    });

    it('allows idempotent revocation when the session is already revoked', async () => {
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
        new UnauthorizedException('Invalid refresh token'),
      );
    });

    it('rejects when the session belongs to another user', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });

      prismaMock.session.findUnique.mockResolvedValue({
        id: sessionId,
        userId: '33333333-3333-4333-8333-333333333333',
        revokedAt: null,
      });

      await expect(service.revokeSession(sessionId, userId)).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );
    });

    it('rejects when an unexpected active-session race occurs', async () => {
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
    it('revokes the session using the matching refresh token and identity', async () => {
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
          refreshTokenHash: tokenHash,
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

    it('rejects a refresh token belonging to another user', async () => {
      jwtMock.verifyAsync.mockResolvedValueOnce({
        sub: '33333333-3333-4333-8333-333333333333',
        sid: sessionId,
        jti: 'another-user-jti',
      });

      await expect(
        service.revokeSessionByRefreshToken(refreshToken, userId, sessionId),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a refresh token belonging to another session', async () => {
      jwtMock.verifyAsync.mockResolvedValueOnce({
        sub: userId,
        sid: 'another-session-id',
        jti: 'refresh-token-jti',
      });

      await expect(
        service.revokeSessionByRefreshToken(refreshToken, userId, sessionId),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a malformed refresh token', async () => {
      jwtMock.verifyAsync.mockRejectedValueOnce(new Error('invalid signature'));

      await expect(
        service.revokeSessionByRefreshToken('invalid-token', userId, sessionId),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a token without jti', async () => {
      jwtMock.verifyAsync.mockResolvedValueOnce({
        sub: userId,
        sid: sessionId,
      });

      await expect(
        service.revokeSessionByRefreshToken(refreshToken, userId, sessionId),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when the stored refresh token hash does not match', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.revokeSessionByRefreshToken(refreshToken, userId, sessionId),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));
    });
  });
});
