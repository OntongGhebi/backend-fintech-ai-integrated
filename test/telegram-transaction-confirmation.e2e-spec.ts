import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';

import { TelegramTransactionConfirmationStatus } from '../generated/prisma/enums';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { EmailVerificationService } from '../src/modules/auth/services/email-verification.service';
import { TelegramTransactionConfirmationRepository } from '../src/modules/telegram/repositories/telegram-transaction-confirmation.repository';
import { TelegramTransactionConfirmationService } from '../src/modules/telegram/transaction-message/services/telegram-transaction-confirmation.service';
import { TelegramTransactionConfirmationRecoveryService } from '../src/modules/telegram/services/telegram-transaction-confirmation-recovery.service';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(60000);

describe('Telegram transaction confirmation integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emailVerificationService: EmailVerificationService;
  let confirmationRepository: TelegramTransactionConfirmationRepository;
  let confirmationService: TelegramTransactionConfirmationService;
  let recoveryService: TelegramTransactionConfirmationRecoveryService;

  let userId: string;
  let telegramAccountId: string;
  let accountId: string;

  const email = `telegram-confirmation-${randomUUID()}@example.com`;
  const password = 'Password123!';
  const telegramUserId = BigInt(
    `0x${randomUUID().replace(/-/g, '').slice(0, 15)}`,
  );
  const chatId = `telegram-e2e-${randomUUID()}`;

  const createdConfirmationIds: string[] = [];
  const createdTransactionIds: string[] = [];

  const createIntent = (overrides: Record<string, unknown> = {}) => ({
    intent: 'CREATE_TRANSACTION' as const,
    transactionType: 'EXPENSE' as const,
    amount: 25000,
    description: 'Makan siang E2E',
    accountId,
    transactionDate: new Date(),
    confidence: 1,
    source: 'DETERMINISTIC' as const,
    originalIntent: {
      intent: 'CREATE_TRANSACTION' as const,
      transactionType: 'EXPENSE' as const,
      amount: 25000,
      description: 'Makan siang E2E',
      confidence: 1,
      source: 'DETERMINISTIC' as const,
    },
    ...overrides,
  });

  async function createConfirmation(sourceMessageId: string) {
    const confirmation = await confirmationRepository.create({
      userId,
      chatId,
      sourceMessageId,
      telegramAccountId,
      telegramUserId,
      intent: createIntent() as never,
    });

    createdConfirmationIds.push(confirmation.id);
    return confirmation;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createE2EApp(moduleFixture.createNestApplication());

    prisma = app.get(PrismaService);
    emailVerificationService = app.get(EmailVerificationService);
    confirmationRepository = app.get(TelegramTransactionConfirmationRepository);
    confirmationService = app.get(TelegramTransactionConfirmationService);
    recoveryService = app.get(TelegramTransactionConfirmationRecoveryService);

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        name: 'Telegram Confirmation E2E',
      })
      .expect(201);

    userId = registration.body.id as string;

    const token = await emailVerificationService.createToken(userId);
    await emailVerificationService.verifyEmail(token);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const accessToken = login.body.accessToken as string;

    const accountResponse = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `Telegram E2E ${randomUUID()}`,
        type: 'CASH',
        openingBalance: 500000,
        currency: 'IDR',
      })
      .expect(201);

    accountId = accountResponse.body.id as string;

    const telegramAccount = await prisma.telegramAccount.create({
      data: {
        userId,
        telegramUserId,
        telegramUsername: 'confirmation_e2e',
        firstName: 'Confirmation',
        lastName: 'Test',
        isVerified: true,
        linkedAt: new Date(),
      },
    });

    telegramAccountId = telegramAccount.id;
  });

  afterEach(async () => {
    if (createdTransactionIds.length > 0) {
      await prisma.transaction.deleteMany({
        where: { id: { in: [...createdTransactionIds] } },
      });
      createdTransactionIds.length = 0;
    }

    if (createdConfirmationIds.length > 0) {
      await prisma.telegramTransactionConfirmation.deleteMany({
        where: { id: { in: [...createdConfirmationIds] } },
      });
      createdConfirmationIds.length = 0;
    }
  });

  afterAll(async () => {
    if (!app) return;

    if (userId) {
      // Remove user-owned records before deleting the test user.
      await prisma.transaction.deleteMany({ where: { userId } });
      await prisma.telegramTransactionConfirmation.deleteMany({
        where: { userId },
      });
      await prisma.telegramAccount.deleteMany({
        where: { id: telegramAccountId },
      });
      await prisma.account.deleteMany({
        where: { id: accountId, userId },
      });
      await prisma.user.deleteMany({ where: { id: userId } });
    }

    await app.close();
  });

  describe('Phase 14.4.3.1 — successful confirmation', () => {
    it('creates exactly one transaction and completes the confirmation', async () => {
      const confirmation = await createConfirmation(randomUUID());

      const result = await confirmationService.handle({
        userId,
        chatId,
        sourceMessageId: confirmation.sourceMessageId,
        telegramAccountId,
        telegramUserId,
        text: 'YA',
      });

      expect(result.handled).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.transactionId).toEqual(expect.any(String));

      const storedConfirmation =
        await prisma.telegramTransactionConfirmation.findUniqueOrThrow({
          where: { id: confirmation.id },
          include: { transaction: true },
        });

      expect(storedConfirmation.status).toBe(
        TelegramTransactionConfirmationStatus.COMPLETED,
      );
      expect(storedConfirmation.transaction).not.toBeNull();
      expect(storedConfirmation.transaction?.userId).toBe(userId);
      expect(Number(storedConfirmation.transaction?.amount)).toBe(25000);

      createdTransactionIds.push(result.transactionId!);
    });
  });

  describe('Phase 14.4.3.2 — retries and duplicate confirmation', () => {
    it('returns the completed result without creating a second transaction', async () => {
      const confirmation = await createConfirmation(randomUUID());

      const firstResult = await confirmationService.handle({
        userId,
        chatId,
        sourceMessageId: confirmation.sourceMessageId,
        telegramAccountId,
        telegramUserId,
        text: 'YA',
      });

      expect(firstResult.status).toBe('COMPLETED');
      expect(firstResult.transactionId).toEqual(expect.any(String));

      createdTransactionIds.push(firstResult.transactionId!);

      const secondResult = await confirmationService.handle({
        userId,
        chatId,
        sourceMessageId: confirmation.sourceMessageId,
        telegramAccountId,
        telegramUserId,
        text: 'YA',
      });

      expect(secondResult.status).toBe('COMPLETED');
      expect(secondResult.transactionId).toBe(firstResult.transactionId);

      const transactionCount = await prisma.transaction.count({
        where: { telegramConfirmationId: confirmation.id },
      });

      expect(transactionCount).toBe(1);
    });

    it('returns the existing confirmation for a duplicate source message', async () => {
      const sourceMessageId = randomUUID();

      const first = await createConfirmation(sourceMessageId);
      const second = await confirmationRepository.create({
        userId,
        chatId,
        sourceMessageId,
        telegramAccountId,
        telegramUserId,
        intent: createIntent() as never,
      });

      expect(second.id).toBe(first.id);
      expect(
        await prisma.telegramTransactionConfirmation.count({
          where: { chatId, sourceMessageId },
        }),
      ).toBe(1);
    });
  });

  describe('Phase 14.4.3.3 — expiration and recovery', () => {
    it('does not create a transaction for an expired confirmation', async () => {
      const confirmation = await createConfirmation(randomUUID());

      await prisma.telegramTransactionConfirmation.update({
        where: { id: confirmation.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const result = await confirmationService.handle({
        userId,
        chatId,
        sourceMessageId: confirmation.sourceMessageId,
        telegramAccountId,
        telegramUserId,
        text: 'YA',
      });

      expect(result.status).toBe('EXPIRED');

      const stored =
        await prisma.telegramTransactionConfirmation.findUniqueOrThrow({
          where: { id: confirmation.id },
        });

      expect(stored.status).toBe(TelegramTransactionConfirmationStatus.EXPIRED);

      expect(
        await prisma.transaction.count({
          where: { telegramConfirmationId: confirmation.id },
        }),
      ).toBe(0);
    });

    it('cancels a pending confirmation without creating a transaction', async () => {
      const confirmation = await createConfirmation(randomUUID());

      const result = await confirmationService.handle({
        userId,
        chatId,
        sourceMessageId: confirmation.sourceMessageId,
        telegramAccountId,
        telegramUserId,
        text: 'BATAL',
      });

      expect(result.status).toBe('CANCELLED');

      const stored =
        await prisma.telegramTransactionConfirmation.findUniqueOrThrow({
          where: { id: confirmation.id },
        });

      expect(stored.status).toBe(
        TelegramTransactionConfirmationStatus.CANCELLED,
      );

      expect(
        await prisma.transaction.count({
          where: { telegramConfirmationId: confirmation.id },
        }),
      ).toBe(0);
    });

    it('expires pending confirmations through the recovery service', async () => {
      const confirmation = await createConfirmation(randomUUID());

      await prisma.telegramTransactionConfirmation.update({
        where: { id: confirmation.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await recoveryService.recover();

      const stored =
        await prisma.telegramTransactionConfirmation.findUniqueOrThrow({
          where: { id: confirmation.id },
        });

      expect(stored.status).toBe(TelegramTransactionConfirmationStatus.EXPIRED);
    });
  });

  describe('Phase 14.4.3.4 — database-backed regression', () => {
    it('does not allow a cancelled confirmation to create a transaction', async () => {
      const confirmation = await createConfirmation(randomUUID());

      await confirmationRepository.cancel(confirmation.id);

      const result = await confirmationService.handle({
        userId,
        chatId,
        sourceMessageId: confirmation.sourceMessageId,
        telegramAccountId,
        telegramUserId,
        text: 'YA',
      });

      expect(result.status).not.toBe('COMPLETED');

      expect(
        await prisma.transaction.count({
          where: { telegramConfirmationId: confirmation.id },
        }),
      ).toBe(0);
    });

    it('preserves the unique source-message constraint under concurrent duplicate creation', async () => {
      const sourceMessageId = randomUUID();

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          confirmationRepository.create({
            userId,
            chatId,
            sourceMessageId,
            telegramAccountId,
            telegramUserId,
            intent: createIntent() as never,
          }),
        ),
      );

      expect(new Set(results.map((item) => item.id)).size).toBe(1);

      expect(
        await prisma.telegramTransactionConfirmation.count({
          where: { chatId, sourceMessageId },
        }),
      ).toBe(1);

      createdConfirmationIds.push(results[0].id);
    });
  });
});
