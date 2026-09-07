import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';

import { EmailVerificationService } from './email-verification.service';
import { PrismaService } from 'src/database/prisma/prisma.service';

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;

  const prismaMock = {
    emailVerificationToken: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },

    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<EmailVerificationService>(EmailVerificationService);
  });

  describe('createToken', () => {
    it('should create and return a plaintext verification token', async () => {
      prismaMock.emailVerificationToken.deleteMany.mockResolvedValue({
        count: 0,
      });

      prismaMock.emailVerificationToken.updateMany.mockResolvedValue({
        count: 0,
      });

      prismaMock.emailVerificationToken.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'token-id',
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          usedAt: null,
          createdAt: new Date(),
        }),
      );

      const userId = '11111111-1111-1111-1111-111111111111';

      const token = await service.createToken(userId);

      expect(token).toEqual(expect.any(String));
      expect(token.length).toBeGreaterThan(0);

      expect(prismaMock.emailVerificationToken.create).toHaveBeenCalledTimes(1);

      const createCall =
        prismaMock.emailVerificationToken.create.mock.calls[0][0];

      expect(createCall.data.userId).toBe(userId);
      expect(createCall.data.tokenHash).toEqual(expect.any(String));
      expect(createCall.data.tokenHash).not.toBe(token);

      expect(createCall.data.expiresAt).toEqual(expect.any(Date));
    });

    it('should generate different tokens for different calls', async () => {
      prismaMock.emailVerificationToken.deleteMany.mockResolvedValue({
        count: 0,
      });

      prismaMock.emailVerificationToken.updateMany.mockResolvedValue({
        count: 0,
      });

      prismaMock.emailVerificationToken.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: crypto.randomUUID(),
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          usedAt: null,
          createdAt: new Date(),
        }),
      );

      const userId = '11111111-1111-1111-1111-111111111111';

      const token1 = await service.createToken(userId);
      const token2 = await service.createToken(userId);

      expect(token1).not.toBe(token2);
    });

    it('should store a SHA-256 hash instead of the plaintext token', async () => {
      prismaMock.emailVerificationToken.deleteMany.mockResolvedValue({
        count: 0,
      });

      prismaMock.emailVerificationToken.updateMany.mockResolvedValue({
        count: 0,
      });

      prismaMock.emailVerificationToken.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'token-id',
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          usedAt: null,
          createdAt: new Date(),
        }),
      );

      const userId = '11111111-1111-1111-1111-111111111111';

      const token = await service.createToken(userId);

      const createCall =
        prismaMock.emailVerificationToken.create.mock.calls[0][0];

      const expectedHash = createHash('sha256').update(token).digest('hex');

      expect(createCall.data.tokenHash).toBe(expectedHash);
    });
  });

  describe('verifyEmail', () => {
    const plaintextToken = 'verification-token';

    const tokenHash = createHash('sha256').update(plaintextToken).digest('hex');

    const validTokenRecord = {
      id: 'token-id',
      userId: '11111111-1111-1111-1111-111111111111',
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    };

    it('should reject an invalid token', async () => {
      prismaMock.$transaction.mockImplementation(
        async (callback: (transaction: unknown) => Promise<unknown>) =>
          callback({
            emailVerificationToken: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
          }),
      );

      await expect(service.verifyEmail('invalid-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject an already used token', async () => {
      prismaMock.$transaction.mockImplementation(
        async (callback: (transaction: unknown) => Promise<unknown>) =>
          callback({
            emailVerificationToken: {
              findUnique: jest.fn().mockResolvedValue({
                ...validTokenRecord,
                usedAt: new Date(),
              }),
            },
          }),
      );

      await expect(service.verifyEmail(plaintextToken)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject an expired token', async () => {
      prismaMock.$transaction.mockImplementation(
        async (callback: (transaction: unknown) => Promise<unknown>) =>
          callback({
            emailVerificationToken: {
              findUnique: jest.fn().mockResolvedValue({
                ...validTokenRecord,
                expiresAt: new Date(Date.now() - 60 * 1000),
              }),
            },
          }),
      );

      await expect(service.verifyEmail(plaintextToken)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should verify the email successfully', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValue(
        validTokenRecord,
      );

      const transactionPrismaMock = {
        emailVerificationToken: {
          findUnique: jest.fn().mockResolvedValue(validTokenRecord),
          updateMany: jest.fn().mockResolvedValue({
            count: 1,
          }),
        },
        user: {
          update: jest.fn().mockResolvedValue({
            id: validTokenRecord.userId,
            emailVerifiedAt: new Date(),
          }),
        },
      };

      prismaMock.$transaction.mockImplementation(
        async (
          callback: (
            transaction: typeof transactionPrismaMock,
          ) => Promise<unknown>,
        ) => callback(transactionPrismaMock),
      );

      await expect(
        service.verifyEmail(plaintextToken),
      ).resolves.toBeUndefined();

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

      expect(
        transactionPrismaMock.emailVerificationToken.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          id: validTokenRecord.id,
          usedAt: null,
        },
        data: {
          usedAt: expect.any(Date),
        },
      });

      expect(transactionPrismaMock.user.update).toHaveBeenCalledWith({
        where: {
          id: validTokenRecord.userId,
        },
        data: {
          emailVerifiedAt: expect.any(Date),
        },
      });
    });

    it('should reject verification when the token was already consumed by another request', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValue(
        validTokenRecord,
      );

      const transactionPrismaMock = {
        emailVerificationToken: {
          findUnique: jest.fn().mockResolvedValue(validTokenRecord),
          updateMany: jest.fn().mockResolvedValue({
            count: 0,
          }),
        },
        user: {
          update: jest.fn(),
        },
      };

      prismaMock.$transaction.mockImplementation(
        async (
          callback: (
            transaction: typeof transactionPrismaMock,
          ) => Promise<unknown>,
        ) => callback(transactionPrismaMock),
      );

      await expect(service.verifyEmail(plaintextToken)).rejects.toThrow(
        ConflictException,
      );

      expect(
        transactionPrismaMock.emailVerificationToken.updateMany,
      ).toHaveBeenCalledTimes(1);

      expect(transactionPrismaMock.user.update).not.toHaveBeenCalled();
    });
  });
});
