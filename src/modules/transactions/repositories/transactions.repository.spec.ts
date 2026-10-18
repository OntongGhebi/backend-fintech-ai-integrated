import { Prisma } from '../../../../generated/prisma/client';

import { PrismaService } from 'src/database/prisma/prisma.service';
import { TransactionsRepository } from './transactions.repository';

describe('TransactionsRepository — Telegram idempotency', () => {
  let repository: TransactionsRepository;

  let prisma: {
    $transaction: jest.Mock;
    transaction: {
      create: jest.Mock;
      findUnique: jest.Mock;
    };
    telegramTransactionConfirmation: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const transaction = {
    id: 'transaction-id',
    userId: 'user-id',
    accountId: 'account-id',
    categoryId: 'category-id',
    telegramConfirmationId: 'confirmation-id',
    type: 'EXPENSE',
    amount: 25000,
    currency: 'IDR',
    description: 'beli makan',
    transactionDate: new Date('2026-09-26T10:00:00.000Z'),
    source: 'TELEGRAM',
    status: 'ACTIVE',
    account: { id: 'account-id' },
    category: { id: 'category-id' },
  };

  const confirmation = (
    status:
      'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' = 'CONFIRMED',
    existingTransaction: typeof transaction | null = null,
  ) => ({
    id: 'confirmation-id',
    userId: 'user-id',
    status,
    transaction: existingTransaction,
  });

  const transactionData = {
    userId: 'user-id',
    accountId: 'account-id',
    categoryId: 'category-id',
    type: 'EXPENSE',
    amount: 25000,
    currency: 'IDR',
    description: 'beli makan',
    transactionDate: new Date('2026-09-26T10:00:00.000Z'),
    source: 'TELEGRAM',
    status: 'ACTIVE',
    transferGroupId: null,
    metadata: Prisma.DbNull,
  } as Prisma.TransactionUncheckedCreateInput;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      transaction: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      telegramTransactionConfirmation: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );

    repository = new TransactionsRepository(prisma as unknown as PrismaService);
  });

  const callCreate = () =>
    repository.createTelegramConfirmedTransaction({
      confirmationId: 'confirmation-id',
      transactionData,
    });

  it('creates a transaction and completes the confirmation atomically', async () => {
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      confirmation('CONFIRMED'),
    );
    prisma.transaction.create.mockResolvedValue(transaction);
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await callCreate();

    expect(result).toEqual(transaction);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: {
        ...transactionData,
        telegramConfirmationId: 'confirmation-id',
      },
      include: {
        account: true,
        category: true,
      },
    });

    expect(
      prisma.telegramTransactionConfirmation.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: 'confirmation-id',
        status: {
          in: ['CONFIRMED', 'PROCESSING'],
        },
      },
      data: {
        status: 'COMPLETED',
      },
    });
  });

  it('returns the existing transaction when confirmation is already completed', async () => {
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      confirmation('COMPLETED', transaction),
    );

    const result = await callCreate();

    expect(result).toEqual(transaction);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(
      prisma.telegramTransactionConfirmation.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('rejects a completed confirmation without its transaction', async () => {
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      confirmation('COMPLETED', null),
    );

    await expect(callCreate()).rejects.toThrow(
      'TELEGRAM_COMPLETED_WITHOUT_TRANSACTION',
    );

    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('rejects when the confirmation does not exist', async () => {
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(null);

    await expect(callCreate()).rejects.toThrow(
      'TELEGRAM_CONFIRMATION_NOT_FOUND',
    );

    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('rejects a cancelled confirmation', async () => {
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      confirmation('CANCELLED'),
    );

    await expect(callCreate()).rejects.toThrow(
      'TELEGRAM_CONFIRMATION_NOT_PROCESSABLE',
    );

    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('accepts PROCESSING to support safe retries', async () => {
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      confirmation('PROCESSING'),
    );
    prisma.transaction.create.mockResolvedValue(transaction);
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await callCreate();

    expect(result).toEqual(transaction);
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
  });

  it('rejects and rolls back when the conditional completion update fails', async () => {
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      confirmation('PROCESSING'),
    );
    prisma.transaction.create.mockResolvedValue(transaction);
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(callCreate()).rejects.toThrow(
      'TELEGRAM_CONFIRMATION_STATE_CONFLICT',
    );

    // The repository uses a Prisma interactive transaction. In a real
    // database, rejection of the callback rolls back the created transaction.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
  });

  it('returns the existing transaction after a unique-constraint race', async () => {
    const uniqueError = Object.assign(
      new Error('Unique constraint violation'),
      { code: 'P2002' },
    );

    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      confirmation('PROCESSING'),
    );
    prisma.transaction.create.mockRejectedValue(uniqueError);
    prisma.transaction.findUnique.mockResolvedValue(transaction);

    const result = await callCreate();

    expect(result).toEqual(transaction);
    expect(prisma.transaction.findUnique).toHaveBeenCalledWith({
      where: {
        telegramConfirmationId: 'confirmation-id',
      },
      include: {
        account: true,
        category: true,
      },
    });
  });

  it('rethrows a unique-constraint error when no transaction exists for the confirmation', async () => {
    const uniqueError = Object.assign(
      new Error('Unique constraint violation'),
      { code: 'P2002' },
    );

    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      confirmation('PROCESSING'),
    );
    prisma.transaction.create.mockRejectedValue(uniqueError);
    prisma.transaction.findUnique.mockResolvedValue(null);

    await expect(callCreate()).rejects.toBe(uniqueError);
  });

  it('does not swallow non-unique database errors', async () => {
    const databaseError = new Error('Database unavailable');

    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      confirmation('CONFIRMED'),
    );
    prisma.transaction.create.mockRejectedValue(databaseError);

    await expect(callCreate()).rejects.toBe(databaseError);
    expect(prisma.transaction.findUnique).not.toHaveBeenCalled();
  });
});
