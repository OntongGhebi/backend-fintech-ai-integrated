import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';
import { EmailVerificationService } from './services/email-verification.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { RefreshTokenService } from './services/refresh-token.service';

describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const passwordMock = {
    hash: jest.fn(),
    compare: jest.fn(),
  };

  const emailVerificationMock = {
    createToken: jest.fn(),
    createAndSendToken: jest.fn(),
  };

  const queueMock = {
    addEmailVerificationJob: jest.fn(),
  };

  const configMock = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  const jwtMock = {
    signAsync: jest.fn(),
  };

  const refreshTokenMock = {
    createSession: jest.fn(),
    rotateSession: jest.fn(),
    revokeSessionByRefreshToken: jest.fn(),
  };

  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    name: 'Test User',
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    status: 'ACTIVE',
  };

  const session = {
    sessionId: '22222222-2222-4222-8222-222222222222',
    refreshToken: 'test-refresh-token',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    refreshTokenMock.createSession.mockResolvedValue(session);

    configMock.get.mockImplementation((key: string) => {
      if (key === 'app.frontendUrl') {
        return 'http://localhost:5173';
      }

      return undefined;
    });

    configMock.getOrThrow.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        'jwt.accessSecret': 'test-access-secret',
        'jwt.accessExpiresIn': '15m',
      };

      if (!(key in values)) {
        throw new Error(`Missing config: ${key}`);
      }

      return values[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PasswordService, useValue: passwordMock },
        {
          provide: EmailVerificationService,
          useValue: emailVerificationMock,
        },
        { provide: QueueService, useValue: queueMock },
        { provide: ConfigService, useValue: configMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: RefreshTokenService, useValue: refreshTokenMock },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    const registeredUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerifiedAt: null,
    };

    const setupRegistration = () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      passwordMock.hash.mockResolvedValue('hashed-password');

      prismaMock.$transaction.mockImplementation(
        async (callback: (transaction: any) => Promise<unknown>) =>
          callback({
            user: {
              create: jest.fn().mockResolvedValue(registeredUser),
            },
            userPreference: {
              create: jest.fn().mockResolvedValue({
                id: 'preference-id',
                userId: registeredUser.id,
              }),
            },
          }),
      );

      emailVerificationMock.createAndSendToken.mockResolvedValue(undefined);
    };

    it('registers a user and creates email verification', async () => {
      setupRegistration();

      const result = await service.register({
        email: ' TEST@EXAMPLE.COM ',
        password: 'Password123!',
        name: ' Test User ',
      });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        select: { id: true },
      });

      expect(passwordMock.hash).toHaveBeenCalledWith('Password123!');

      expect(emailVerificationMock.createAndSendToken).toHaveBeenCalledWith(
        user.id,
        user.email,
        user.name,
      );

      expect(result).toEqual({
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: false,
      });
    });

    it('does not expose verification token in the response', async () => {
      setupRegistration();

      const result = await service.register({
        email: user.email,
        password: 'Password123!',
        name: user.name,
      });

      expect(result).not.toHaveProperty('verificationToken');
      expect(result).not.toHaveProperty('token');
    });

    it('rejects an existing normalized email', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'existing-user-id',
      });

      await expect(
        service.register({
          email: ' TEST@EXAMPLE.COM ',
          password: 'Password123!',
          name: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);

      expect(passwordMock.hash).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('creates a session and issues a session-bound access token', async () => {
      prismaMock.user.findUnique.mockResolvedValue(user);
      passwordMock.compare.mockResolvedValue(true);
      jwtMock.signAsync.mockResolvedValue('test-access-token');

      const result = await service.login(
        {
          email: 'test@example.com',
          password: 'Password123!',
        },
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(passwordMock.compare).toHaveBeenCalledWith(
        'Password123!',
        user.passwordHash,
      );

      expect(refreshTokenMock.createSession).toHaveBeenCalledWith(
        user.id,
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(jwtMock.signAsync).toHaveBeenCalledWith(
        {
          sub: user.id,
          sid: session.sessionId,
        },
        {
          secret: 'test-access-secret',
          expiresIn: '15m',
        },
      );

      expect(result).toEqual({
        accessToken: 'test-access-token',
        refreshToken: session.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: true,
        },
      });
    });

    it('normalizes email before querying the database', async () => {
      prismaMock.user.findUnique.mockResolvedValue(user);
      passwordMock.compare.mockResolvedValue(true);
      jwtMock.signAsync.mockResolvedValue('test-access-token');

      await service.login({
        email: '  TEST@EXAMPLE.COM  ',
        password: 'Password123!',
      });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          name: true,
          emailVerifiedAt: true,
          status: true,
        },
      });
    });

    it('rejects when the user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'unknown@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      expect(passwordMock.compare).not.toHaveBeenCalled();
      expect(refreshTokenMock.createSession).not.toHaveBeenCalled();
      expect(jwtMock.signAsync).not.toHaveBeenCalled();
    });

    it('rejects an incorrect password', async () => {
      prismaMock.user.findUnique.mockResolvedValue(user);
      passwordMock.compare.mockResolvedValue(false);

      await expect(
        service.login({
          email: user.email,
          password: 'WrongPassword123!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      expect(refreshTokenMock.createSession).not.toHaveBeenCalled();
      expect(jwtMock.signAsync).not.toHaveBeenCalled();
    });

    it('rejects an inactive account', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...user,
        status: 'SUSPENDED',
      });
      passwordMock.compare.mockResolvedValue(true);

      await expect(
        service.login({
          email: user.email,
          password: 'Password123!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      expect(refreshTokenMock.createSession).not.toHaveBeenCalled();
      expect(jwtMock.signAsync).not.toHaveBeenCalled();
    });

    it('rejects an unverified email', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...user,
        emailVerifiedAt: null,
      });
      passwordMock.compare.mockResolvedValue(true);

      await expect(
        service.login({
          email: user.email,
          password: 'Password123!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      expect(refreshTokenMock.createSession).not.toHaveBeenCalled();
      expect(jwtMock.signAsync).not.toHaveBeenCalled();
    });

    it('does not expose sensitive user data in the JWT payload', async () => {
      prismaMock.user.findUnique.mockResolvedValue(user);
      passwordMock.compare.mockResolvedValue(true);
      jwtMock.signAsync.mockResolvedValue('test-access-token');

      await service.login({
        email: user.email,
        password: 'Password123!',
      });

      const [payload] = jwtMock.signAsync.mock.calls[0];

      expect(payload).toEqual({
        sub: user.id,
        sid: session.sessionId,
      });

      expect(payload).not.toHaveProperty('password');
      expect(payload).not.toHaveProperty('passwordHash');
      expect(payload).not.toHaveProperty('email');
      expect(payload).not.toHaveProperty('name');
    });

    it('does not issue an access token before session creation succeeds', async () => {
      prismaMock.user.findUnique.mockResolvedValue(user);
      passwordMock.compare.mockResolvedValue(true);
      refreshTokenMock.createSession.mockRejectedValue(
        new Error('Session creation failed'),
      );

      await expect(
        service.login({
          email: user.email,
          password: 'Password123!',
        }),
      ).rejects.toThrow('Session creation failed');

      expect(jwtMock.signAsync).not.toHaveBeenCalled();
    });

    it('does not issue an access token before authentication succeeds', async () => {
      prismaMock.user.findUnique.mockResolvedValue(user);
      passwordMock.compare.mockResolvedValue(false);

      await expect(
        service.login({
          email: user.email,
          password: 'WrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(jwtMock.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('delegates refresh token rotation to RefreshTokenService', async () => {
      const expected = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      refreshTokenMock.rotateSession.mockResolvedValue(expected);

      await expect(service.refresh('old-refresh-token')).resolves.toEqual(
        expected,
      );

      expect(refreshTokenMock.rotateSession).toHaveBeenCalledWith(
        'old-refresh-token',
      );
    });

    it('propagates refresh token errors', async () => {
      refreshTokenMock.rotateSession.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(service.refresh('invalid-refresh-token')).rejects.toThrow(
        'Invalid refresh token',
      );
    });
  });

  describe('logout', () => {
    it('revokes the session using the authenticated user and session ids', async () => {
      refreshTokenMock.revokeSessionByRefreshToken.mockResolvedValue(undefined);

      await expect(
        service.logout('valid-refresh-token', user.id, session.sessionId),
      ).resolves.toEqual({
        message: 'Logout successfully',
      });

      expect(refreshTokenMock.revokeSessionByRefreshToken).toHaveBeenCalledWith(
        'valid-refresh-token',
        user.id,
        session.sessionId,
      );
    });

    it('propagates invalid refresh token errors', async () => {
      refreshTokenMock.revokeSessionByRefreshToken.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(
        service.logout('invalid-refresh-token', user.id, session.sessionId),
      ).rejects.toThrow('Invalid refresh token');
    });
  });
});
