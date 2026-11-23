import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { TransactionsRepository } from './transactions.repository';

describe('TransactionsRepository — Telegram confirmation ownership', () => {
  const confirmationId = 'confirmation-id';
  const userId = 'user-1';
  const otherUserId = 'user-2';

  const transactionData = {
    userId,
    accountId: 'account-id',
    categoryId: null,
    type: 'EXPENSE',
    amount: 100,
    currency: 'IDR',
    transactionDate: new Date('2026-11-21T10:00:00.000Z'),
    source: 'TELEGRAM',
    status: 'ACTIVE',
    transferGroupId: null,
    metadata: Prisma.DbNull,
  } as Prisma.TransactionUncheckedCreateInput;

  let repository: TransactionsRepository;
  let tx: {
    $queryRaw: jest.Mock;
    telegramTransactionConfirmation: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    transaction: {
      create: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
    transaction: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramTransactionConfirmation: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      transaction: {
        create: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      transaction: {
        findUnique: jest.fn(),
      },
    };

    repository = new TransactionsRepository(prisma as unknown as PrismaService);
  });

  it('rejects a confirmation owned by another user before creating a transaction', async () => {
    tx.telegramTransactionConfirmation.findUnique.mockResolvedValue({
      id: confirmationId,
      userId: otherUserId,
      status: 'CONFIRMED',
      transaction: null,
    });

    await expect(
      repository.createTelegramConfirmedTransaction({
        confirmationId,
        transactionData,
      }),
    ).rejects.toThrow('TELEGRAM_CONFIRMATION_NOT_FOUND');

    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(
      tx.telegramTransactionConfirmation.updateMany,
    ).not.toHaveBeenCalled();
    expect(prisma.transaction.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a completed confirmation whose linked transaction has a different owner', async () => {
    tx.telegramTransactionConfirmation.findUnique.mockResolvedValue({
      id: confirmationId,
      userId,
      status: 'COMPLETED',
      transaction: {
        id: 'foreign-transaction',
        userId: otherUserId,
      },
    });

    await expect(
      repository.createTelegramConfirmedTransaction({
        confirmationId,
        transactionData,
      }),
    ).rejects.toThrow('TELEGRAM_CONFIRMATION_TRANSACTION_OWNERSHIP_MISMATCH');

    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('does not return a transaction owned by another user after a unique-constraint race', async () => {
    const uniqueViolation = Object.assign(new Error('Unique constraint'), {
      code: 'P2002',
    });

    tx.telegramTransactionConfirmation.findUnique.mockResolvedValue({
      id: confirmationId,
      userId,
      status: 'PROCESSING',
      transaction: null,
    });
    tx.transaction.create.mockRejectedValue(uniqueViolation);
    prisma.transaction.findUnique.mockResolvedValue({
      id: 'existing-transaction',
      userId: otherUserId,
    });

    await expect(
      repository.createTelegramConfirmedTransaction({
        confirmationId,
        transactionData,
      }),
    ).rejects.toBe(uniqueViolation);

    expect(prisma.transaction.findUnique).toHaveBeenCalledWith({
      where: { telegramConfirmationId: confirmationId },
      include: { account: true, category: true },
    });
  });
});
