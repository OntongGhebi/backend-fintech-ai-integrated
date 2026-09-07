import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuthService } from './auth.service';

import { PasswordService } from './services/password.service';
import { EmailVerificationService } from './services/email-verification.service';

import { PrismaService } from 'src/database/prisma/prisma.service';
import { QueueService } from 'src/queue/queue.service';

describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },

    $transaction: jest.fn(),
  };

  const passwordServiceMock = {
    hash: jest.fn(),
    compare: jest.fn(),
  };

  const emailVerificationServiceMock = {
    createToken: jest.fn(),
  };

  const queueServiceMock = {
    addEmailVerificationJob: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  const jwtServiceMock = {
    signAsync: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: PasswordService,
          useValue: passwordServiceMock,
        },
        {
          provide: EmailVerificationService,
          useValue: emailVerificationServiceMock,
        },
        {
          provide: QueueService,
          useValue: queueServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: JwtService,
          useValue: jwtServiceMock,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should register a user and queue email verification', async () => {
      const user = {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'test@example.com',
        name: 'Test User',
        emailVerifiedAt: null,
      };

      prismaMock.user.findUnique.mockResolvedValue(null);

      passwordServiceMock.hash.mockResolvedValue('hashed-password');

      prismaMock.$transaction.mockImplementation(
        async (
          callback: (transaction: {
            user: {
              create: jest.Mock;
            };
            userPreference: {
              create: jest.Mock;
            };
          }) => Promise<unknown>,
        ) =>
          callback({
            user: {
              create: jest.fn().mockResolvedValue(user),
            },
            userPreference: {
              create: jest.fn().mockResolvedValue({
                id: 'preference-id',
                userId: user.id,
              }),
            },
          }),
      );

      emailVerificationServiceMock.createToken.mockResolvedValue(
        'verification-token',
      );

      configServiceMock.get.mockImplementation((key: string) => {
        if (key === 'app.frontendUrl') {
          return 'http://localhost:5173';
        }

        return undefined;
      });

      queueServiceMock.addEmailVerificationJob.mockResolvedValue(undefined);

      const result = await service.register({
        email: ' TEST@EXAMPLE.COM ',
        password: 'Password123!',
        name: ' Test User ',
      });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: {
          email: 'test@example.com',
        },
        select: {
          id: true,
        },
      });

      expect(passwordServiceMock.hash).toHaveBeenCalledWith('Password123!');

      expect(emailVerificationServiceMock.createToken).toHaveBeenCalledWith(
        user.id,
      );

      expect(queueServiceMock.addEmailVerificationJob).toHaveBeenCalledWith({
        email: user.email,
        name: user.name,
        verificationUrl:
          'http://localhost:5173/verify-email?token=verification-token',
      });

      expect(result).toEqual({
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: false,
      });
    });

    it('should not expose the verification token in the registration response', async () => {
      const user = {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'test@example.com',
        name: 'Test User',
        emailVerifiedAt: null,
      };

      prismaMock.user.findUnique.mockResolvedValue(null);

      passwordServiceMock.hash.mockResolvedValue('hashed-password');

      prismaMock.$transaction.mockImplementation(
        async (
          callback: (transaction: {
            user: {
              create: jest.Mock;
            };
            userPreference: {
              create: jest.Mock;
            };
          }) => Promise<unknown>,
        ) =>
          callback({
            user: {
              create: jest.fn().mockResolvedValue(user),
            },
            userPreference: {
              create: jest.fn().mockResolvedValue({
                id: 'preference-id',
                userId: user.id,
              }),
            },
          }),
      );

      emailVerificationServiceMock.createToken.mockResolvedValue(
        'secret-verification-token',
      );

      configServiceMock.get.mockReturnValue('http://localhost:5173');

      queueServiceMock.addEmailVerificationJob.mockResolvedValue(undefined);

      const result = await service.register({
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      });

      expect(result).not.toHaveProperty('verificationToken');

      expect(result).not.toHaveProperty('token');
    });

    it('should normalize the email before checking for an existing user', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'existing-user-id',
        email: 'test@example.com',
      });

      await expect(
        service.register({
          email: ' TEST@EXAMPLE.COM ',
          password: 'Password123!',
          name: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: {
          email: 'test@example.com',
        },
        select: {
          id: true,
        },
      });

      expect(passwordServiceMock.hash).not.toHaveBeenCalled();

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const verifiedActiveUser = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      name: 'Test User',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      status: 'ACTIVE',
    };

    beforeEach(() => {
      configServiceMock.get.mockImplementation((key: string) => {
        if (key === 'jwt.accessSecret') {
          return 'test-access-secret';
        }

        if (key === 'jwt.accessExpiresIn') {
          return '15m';
        }

        return undefined;
      });

      configServiceMock.getOrThrow.mockImplementation((key: string) => {
        if (key === 'jwt.accessSecret') {
          return 'test-access-secret';
        }

        if (key === 'jwt.accessExpiresIn') {
          return '15m';
        }

        throw new Error(`Missing config: ${key}`);
      });
    });

    it('should login successfully and generate an access token', async () => {
      prismaMock.user.findUnique.mockResolvedValue(verifiedActiveUser);

      passwordServiceMock.compare.mockResolvedValue(true);

      jwtServiceMock.signAsync.mockResolvedValue('test-access-token');

      const result = await service.login({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(passwordServiceMock.compare).toHaveBeenCalledWith(
        'Password123!',
        'hashed-password',
      );

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        {
          sub: verifiedActiveUser.id,
        },
        {
          secret: 'test-access-secret',
          expiresIn: '15m',
        },
      );

      expect(result).toEqual({
        accessToken: 'test-access-token',
        user: {
          id: verifiedActiveUser.id,
          email: verifiedActiveUser.email,
          name: verifiedActiveUser.name,
          emailVerified: true,
        },
      });
    });

    it('should reject login when user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'unknown@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      expect(passwordServiceMock.compare).not.toHaveBeenCalled();

      expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
    });

    it('should reject login when password is incorrect', async () => {
      prismaMock.user.findUnique.mockResolvedValue(verifiedActiveUser);

      passwordServiceMock.compare.mockResolvedValue(false);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'WrongPassword123!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      expect(passwordServiceMock.compare).toHaveBeenCalledWith(
        'WrongPassword123!',
        'hashed-password',
      );

      expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
    });

    it('should reject login when user account is not active', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...verifiedActiveUser,
        status: 'SUSPENDED',
      });

      passwordServiceMock.compare.mockResolvedValue(true);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(
        new UnauthorizedException('User account is not active'),
      );

      expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
    });

    it('should reject login when email is not verified', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...verifiedActiveUser,
        emailVerifiedAt: null,
      });

      passwordServiceMock.compare.mockResolvedValue(true);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(
        new UnauthorizedException('Email address is not verified'),
      );

      expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
    });

    it('should normalize email before querying the database', async () => {
      prismaMock.user.findUnique.mockResolvedValue(verifiedActiveUser);

      passwordServiceMock.compare.mockResolvedValue(true);

      jwtServiceMock.signAsync.mockResolvedValue('test-access-token');

      await service.login({
        email: '  TEST@EXAMPLE.COM  ',
        password: 'Password123!',
      });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: {
          email: 'test@example.com',
        },
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

    it('should not expose password hash in the login response', async () => {
      prismaMock.user.findUnique.mockResolvedValue(verifiedActiveUser);

      passwordServiceMock.compare.mockResolvedValue(true);

      jwtServiceMock.signAsync.mockResolvedValue('test-access-token');

      const result = await service.login({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(result).not.toHaveProperty('passwordHash');

      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should not expose sensitive data in the JWT payload', async () => {
      prismaMock.user.findUnique.mockResolvedValue(verifiedActiveUser);

      passwordServiceMock.compare.mockResolvedValue(true);

      jwtServiceMock.signAsync.mockResolvedValue('test-access-token');

      await service.login({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: verifiedActiveUser.id,
        }),
        expect.any(Object),
      );

      const [payload] = jwtServiceMock.signAsync.mock.calls[0];

      expect(payload).not.toHaveProperty('password');

      expect(payload).not.toHaveProperty('passwordHash');

      expect(payload).not.toHaveProperty('email');

      expect(payload).not.toHaveProperty('name');
    });

    it('should not generate an access token before authentication succeeds', async () => {
      prismaMock.user.findUnique.mockResolvedValue(verifiedActiveUser);

      passwordServiceMock.compare.mockResolvedValue(false);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'WrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
    });

    it('should generate the token only after account status and email verification checks pass', async () => {
      prismaMock.user.findUnique.mockResolvedValue(verifiedActiveUser);

      passwordServiceMock.compare.mockResolvedValue(true);

      jwtServiceMock.signAsync.mockResolvedValue('test-access-token');

      await service.login({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(jwtServiceMock.signAsync).toHaveBeenCalledTimes(1);
    });
  });
});
