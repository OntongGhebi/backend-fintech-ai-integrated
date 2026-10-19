import { randomUUID } from 'node:crypto';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { TransactionsRepository } from '../src/modules/transactions/repositories/transactions.repository';
import {
  AccountType,
  TelegramTransactionConfirmationStatus,
  TransactionSource,
  TransactionType,
} from '../generated/prisma/enums';

jest.setTimeout(30000);

describe('Telegram confirmed transaction — PostgreSQL integration', () => {
  let prisma: PrismaService;
  let repository: TransactionsRepository;

  let userId: string;
  let accountId: string;
  let telegramAccountId: string;
  let confirmationId: string;

  const suffix = randomUUID();
  const chatId = `integration-${suffix}`;
  const telegramUserId = BigInt(
    Date.now() + Math.floor(Math.random() * 100000),
  );

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is missing. Configure it in backend/.env.test with a dedicated test database.',
      );
    }

    prisma = new PrismaService();
    await prisma.$connect();

    repository = new TransactionsRepository(prisma);

    const user = await prisma.user.create({
      data: {
        email: `telegram-atomic-${suffix}@example.com`,
        passwordHash: 'integration-test-hash',
        name: 'Telegram Atomic Integration Test',
      },
    });

    userId = user.id;

    const account = await prisma.account.create({
      data: {
        userId,
        name: 'Integration Test Account',
        type: AccountType.BANK,
        currency: 'IDR',
        openingBalance: 0,
      },
    });

    accountId = account.id;

    const telegramAccount = await prisma.telegramAccount.create({
      data: {
        userId,
        telegramUserId,
        isVerified: true,
      },
    });

    telegramAccountId = telegramAccount.id;

    const confirmation = await prisma.telegramTransactionConfirmation.create({
      data: {
        userId,
        telegramAccountId,
        chatId,
        sourceMessageId: `source-${suffix}`,
        telegramUserId,
        intent: {
          intent: 'CREATE_TRANSACTION',
          transactionType: 'EXPENSE',
          amount: 25000,
          description: 'Atomic integration test',
          source: 'DETERMINISTIC',
          confidence: 1,
        },
        status: TelegramTransactionConfirmationStatus.CONFIRMED,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    confirmationId = confirmation.id;
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }

    if (userId) {
      // Delete dependent transaction records before their confirmation.
      await prisma.transaction.deleteMany({
        where: { userId },
      });

      await prisma.telegramTransactionConfirmation.deleteMany({
        where: { userId },
      });

      await prisma.telegramAccount.deleteMany({
        where: { userId },
      });

      await prisma.account.deleteMany({
        where: { userId },
      });

      await prisma.user.deleteMany({
        where: { id: userId },
      });
    }

    await prisma.$disconnect();
  });

  function transactionData(): Prisma.TransactionUncheckedCreateInput {
    return {
      userId,
      accountId,
      categoryId: null,
      type: TransactionType.EXPENSE,
      amount: 25000,
      currency: 'IDR',
      description: 'Atomic integration test',
      transactionDate: new Date(),
      source: TransactionSource.TELEGRAM,
    };
  }

  it('creates one transaction and marks its confirmation COMPLETED', async () => {
    const transaction = await repository.createTelegramConfirmedTransaction({
      confirmationId,
      transactionData: transactionData(),
    });

    const [persistedTransaction, persistedConfirmation] = await Promise.all([
      prisma.transaction.findUnique({
        where: { id: transaction.id },
      }),
      prisma.telegramTransactionConfirmation.findUnique({
        where: { id: confirmationId },
      }),
    ]);

    expect(persistedTransaction).not.toBeNull();
    expect(persistedTransaction?.telegramConfirmationId).toBe(confirmationId);

    expect(persistedConfirmation?.status).toBe(
      TelegramTransactionConfirmationStatus.COMPLETED,
    );
  });

  it('returns the existing transaction when the completed confirmation is retried', async () => {
    const first = await repository.createTelegramConfirmedTransaction({
      confirmationId,
      transactionData: transactionData(),
    });

    const second = await repository.createTelegramConfirmedTransaction({
      confirmationId,
      transactionData: transactionData(),
    });

    expect(second.id).toBe(first.id);

    const count = await prisma.transaction.count({
      where: {
        userId,
        telegramConfirmationId: confirmationId,
      },
    });

    expect(count).toBe(1);
  });

  it('returns the same transaction for concurrent retries', async () => {
    const results = await Promise.all([
      repository.createTelegramConfirmedTransaction({
        confirmationId,
        transactionData: transactionData(),
      }),
      repository.createTelegramConfirmedTransaction({
        confirmationId,
        transactionData: transactionData(),
      }),
    ]);

    expect(results[0].id).toBe(results[1].id);

    const count = await prisma.transaction.count({
      where: {
        userId,
        telegramConfirmationId: confirmationId,
      },
    });

    expect(count).toBe(1);
  });
});
