import { Test, TestingModule } from '@nestjs/testing';

import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';
import { EmailVerificationService } from './services/email-verification.service';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { QueueService } from 'src/queue/queue.service';
import { ConfigService } from '@nestjs/config';
import { EmailService } from 'src/integrations/email/email.service';

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

  const emailServiceMock = {};

  const queueServiceMock = {
    addEmailVerificationJob: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn(),
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
          provide: EmailService,
          useValue: emailServiceMock,
        },
        {
          provide: QueueService,
          useValue: queueServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
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
      ).rejects.toThrow();

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: {
          email: 'test@example.com',
        },
        select: {
          id: true,
        },
      });
    });
  });
});
