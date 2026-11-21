import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../database/prisma/prisma.service';
import { AccessTokenStrategy } from './access-token.strategy';

describe('AccessTokenStrategy', () => {
  let strategy: AccessTokenStrategy;

  const configMock = {
    get: jest.fn(),
  };

  const prismaMock = {
    session: {
      findUnique: jest.fn(),
    },
  };

  const userId = '11111111-1111-1111-1111-111111111111';
  const sessionId = '22222222-2222-4222-8222-222222222222';

  const activeSession = (overrides: Record<string, any> = {}) => ({
    id: sessionId,
    userId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: userId,
      status: 'ACTIVE',
      deletedAt: null,
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    configMock.get.mockImplementation((key: string) => {
      if (key === 'jwt.accessSecret') {
        return 'test-access-secret';
      }

      return undefined;
    });

    strategy = new AccessTokenStrategy(
      configMock as unknown as ConfigService,
      prismaMock as unknown as PrismaService,
    );

    prismaMock.session.findUnique.mockResolvedValue(activeSession());
  });

  describe('constructor', () => {
    it('throws when the JWT access secret is missing', () => {
      configMock.get.mockReturnValue(undefined);

      expect(
        () =>
          new AccessTokenStrategy(
            configMock as unknown as ConfigService,
            prismaMock as unknown as PrismaService,
          ),
      ).toThrow('JWT_ACCESS_SECRET is not configured');
    });
  });

  describe('validate', () => {
    it('validates an active session and returns authenticated identity', async () => {
      const payload = {
        sub: userId,
        sid: sessionId,
      };

      const result = await strategy.validate(payload);

      expect(prismaMock.session.findUnique).toHaveBeenCalledWith({
        where: {
          id: sessionId,
        },
        select: {
          id: true,
          userId: true,
          revokedAt: true,
          expiresAt: true,
          user: {
            select: {
              id: true,
              status: true,
              deletedAt: true,
            },
          },
        },
      });

      expect(result).toEqual({
        id: userId,
        sid: sessionId,
      });
    });

    it.each([
      ['null payload', null],
      ['undefined payload', undefined],
      ['missing subject', { sid: sessionId }],
      ['empty subject', { sub: '', sid: sessionId }],
      ['whitespace subject', { sub: '   ', sid: sessionId }],
      ['non-string subject', { sub: 123, sid: sessionId }],
      ['missing session id', { sub: userId }],
      ['empty session id', { sub: userId, sid: '' }],
      ['whitespace session id', { sub: userId, sid: '   ' }],
      ['non-string session id', { sub: userId, sid: 123 }],
    ])('rejects %s', async (_label, payload) => {
      await expect(strategy.validate(payload as any)).rejects.toThrow(
        new UnauthorizedException('Invalid access token'),
      );

      expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
    });

    it('rejects when the session does not exist', async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);

      await expect(
        strategy.validate({
          sub: userId,
          sid: sessionId,
        }),
      ).rejects.toThrow(
        new UnauthorizedException('Invalid or inactive session'),
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

      await expect(
        strategy.validate({
          sub: userId,
          sid: sessionId,
        }),
      ).rejects.toThrow(
        new UnauthorizedException('Invalid or inactive session'),
      );
    });

    it('rejects when the related user id does not match the token subject', async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        activeSession({
          user: {
            id: 'another-user-id',
            status: 'ACTIVE',
            deletedAt: null,
          },
        }),
      );

      await expect(
        strategy.validate({
          sub: userId,
          sid: sessionId,
        }),
      ).rejects.toThrow(
        new UnauthorizedException('Invalid or inactive session'),
      );
    });

    it('rejects a revoked session', async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        activeSession({
          revokedAt: new Date(),
        }),
      );

      await expect(
        strategy.validate({
          sub: userId,
          sid: sessionId,
        }),
      ).rejects.toThrow(
        new UnauthorizedException('Invalid or inactive session'),
      );
    });

    it('rejects an expired session', async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        activeSession({
          expiresAt: new Date(Date.now() - 1000),
        }),
      );

      await expect(
        strategy.validate({
          sub: userId,
          sid: sessionId,
        }),
      ).rejects.toThrow(
        new UnauthorizedException('Invalid or inactive session'),
      );
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

      await expect(
        strategy.validate({
          sub: userId,
          sid: sessionId,
        }),
      ).rejects.toThrow(
        new UnauthorizedException('Invalid or inactive session'),
      );
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

      await expect(
        strategy.validate({
          sub: userId,
          sid: sessionId,
        }),
      ).rejects.toThrow(
        new UnauthorizedException('Invalid or inactive session'),
      );
    });

    it('does not expose sensitive user information', async () => {
      const result = await strategy.validate({
        sub: userId,
        sid: sessionId,
      });

      expect(result).toEqual({
        id: userId,
        sid: sessionId,
      });

      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('name');
      expect(result).not.toHaveProperty('status');
    });
  });
});
