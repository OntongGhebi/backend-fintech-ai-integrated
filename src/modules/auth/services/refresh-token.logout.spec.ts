import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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

  const jwtServiceMock = {
    verifyAsync: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn((key: string) => {
      if (key === 'jwt.refreshSecret') {
        return 'test-refresh-secret';
      }

      return undefined;
    }),
  };

  const userId = '11111111-1111-4111-8111-111111111111';
  const sessionId = '22222222-2222-4222-8222-222222222222';
  const refreshToken = 'valid-refresh-token';

  beforeEach(async () => {
    jest.resetAllMocks();

    configServiceMock.get.mockImplementation((key: string) => {
      if (key === 'jwt.refreshSecret') {
        return 'test-refresh-secret';
      }

      return undefined;
    });

    jwtServiceMock.verifyAsync.mockResolvedValue({
      sub: userId,
      sid: sessionId,
      jti: 'refresh-token-jti',
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
  });

  describe('revokeSession', () => {
    it('revokes an active session atomically', async () => {
      prismaMock.session.updateMany.mockResolvedValue({
        count: 1,
      });

      await expect(
        service.revokeSession(sessionId, userId),
      ).resolves.toBeUndefined();

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });

      expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
    });

    it('allows idempotent logout when session is already revoked', async () => {
      prismaMock.session.updateMany.mockResolvedValue({
        count: 0,
      });

      prismaMock.session.findUnique.mockResolvedValue({
        id: sessionId,
        userId,
        revokedAt: new Date(),
      });

      await expect(
        service.revokeSession(sessionId, userId),
      ).resolves.toBeUndefined();
    });

    it('rejects when session does not exist', async () => {
      prismaMock.session.updateMany.mockResolvedValue({
        count: 0,
      });

      prismaMock.session.findUnique.mockResolvedValue(null);

      await expect(service.revokeSession(sessionId, userId)).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );
    });

    it('rejects when session belongs to another user', async () => {
      prismaMock.session.updateMany.mockResolvedValue({
        count: 0,
      });

      prismaMock.session.findUnique.mockResolvedValue({
        id: sessionId,
        userId: '33333333-3333-4333-8333-333333333333',
        revokedAt: null,
      });

      await expect(service.revokeSession(sessionId, userId)).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );
    });

    it('does not silently succeed if an unexpected active-session race occurs', async () => {
      prismaMock.session.updateMany.mockResolvedValue({
        count: 0,
      });

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
    it('revokes the session associated with a valid refresh token', async () => {
      prismaMock.session.updateMany.mockResolvedValue({
        count: 1,
      });

      await expect(
        service.revokeSessionByRefreshToken(refreshToken, userId),
      ).resolves.toBeUndefined();

      expect(jwtServiceMock.verifyAsync).toHaveBeenCalledWith(refreshToken, {
        secret: 'test-refresh-secret',
        algorithms: ['HS256'],
      });

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });
    });

    it('rejects a refresh token belonging to another user', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValueOnce({
        sub: '33333333-3333-4333-8333-333333333333',
        sid: sessionId,
        jti: 'another-user-jti',
      });

      await expect(
        service.revokeSessionByRefreshToken(refreshToken, userId),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a malformed refresh token', async () => {
      jwtServiceMock.verifyAsync.mockRejectedValueOnce(
        new Error('invalid signature'),
      );

      await expect(
        service.revokeSessionByRefreshToken('invalid-token', userId),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a token without jti', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValueOnce({
        sub: userId,
        sid: sessionId,
      });

      await expect(
        service.revokeSessionByRefreshToken(refreshToken, userId),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });
  });
});
