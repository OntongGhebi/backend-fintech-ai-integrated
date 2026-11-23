import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { TransactionsRepository } from './transactions.repository';

describe('TransactionsRepository balance locking', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const accountA = '22222222-2222-4222-8222-222222222222';
  const accountB = '33333333-3333-4333-8333-333333333333';

  let repository: TransactionsRepository;
  let tx: {
    $queryRaw: jest.Mock;
    account: {
      findFirst: jest.Mock;
    };
    transaction: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
    telegramTransactionConfirmation: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
    transaction: {
      findUnique: jest.Mock;
    };
  };
  let executionOrder: string[];

  beforeEach(() => {
    executionOrder = [];

    tx = {
      $queryRaw: jest.fn().mockImplementation(async () => {
        executionOrder.push('lock');
        return [];
      }),
      account: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          if (where.id === accountA) {
            return {
              id: accountA,
              openingBalance: new Prisma.Decimal('1000.0000'),
            };
          }

          if (where.id === accountB) {
            return {
              id: accountB,
              openingBalance: new Prisma.Decimal('500.0000'),
            };
          }

          return null;
        }),
      },
      transaction: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          executionOrder.push('create');

          return {
            id: `transaction-${executionOrder.length}`,
            ...data,
          };
        }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      telegramTransactionConfirmation: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      transaction: {
        findUnique: jest.fn(),
      },
    };

    repository = new TransactionsRepository(prisma as unknown as PrismaService);
  });

  it('locks the account before creating a normal transaction', async () => {
    await repository.create({
      userId,
      accountId: accountA,
      categoryId: null,
      type: 'EXPENSE',
      amount: new Prisma.Decimal('100.0000'),
      currency: 'IDR',
      description: 'Test expense',
      transactionDate: new Date('2026-11-22T10:00:00.000Z'),
      source: 'MANUAL',
      status: 'ACTIVE',
      transferGroupId: null,
      metadata: Prisma.DbNull,
    } as Prisma.TransactionUncheckedCreateInput);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.transaction.create).toHaveBeenCalledTimes(1);
    expect(executionOrder).toEqual(['lock', 'create']);
  });

  it('locks source and destination accounts in deterministic order before creating a transfer', async () => {
    await repository.createTransfer(
      {
        userId,
        accountId: accountB,
        categoryId: null,
        type: 'TRANSFER',
        amount: new Prisma.Decimal('100.0000'),
        currency: 'IDR',
        description: 'Test transfer',
        transactionDate: new Date('2026-11-22T10:00:00.000Z'),
        source: 'MANUAL',
        status: 'ACTIVE',
        transferGroupId: '44444444-4444-4444-8444-444444444444',
        metadata: {
          direction: 'OUT',
        },
      } as Prisma.TransactionUncheckedCreateInput,
      {
        userId,
        accountId: accountA,
        categoryId: null,
        type: 'TRANSFER',
        amount: new Prisma.Decimal('100.0000'),
        currency: 'IDR',
        description: 'Test transfer',
        transactionDate: new Date('2026-11-22T10:00:00.000Z'),
        source: 'MANUAL',
        status: 'ACTIVE',
        transferGroupId: '44444444-4444-4444-8444-444444444444',
        metadata: {
          direction: 'IN',
        },
      } as Prisma.TransactionUncheckedCreateInput,
    );

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);

    const firstLockValues = tx.$queryRaw.mock.calls[0].slice(1);
    const secondLockValues = tx.$queryRaw.mock.calls[1].slice(1);

    expect(firstLockValues[0]).toBe(accountA);
    expect(secondLockValues[0]).toBe(accountB);

    expect(tx.transaction.findMany).toHaveBeenCalledWith({
      where: {
        accountId: accountB,
        userId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        type: true,
        amount: true,
        metadata: true,
      },
    });

    expect(tx.transaction.create).toHaveBeenCalledTimes(2);
  });

  it('locks both the current and target account before updating a transaction', async () => {
    tx.transaction.findFirst.mockResolvedValue({
      id: 'transaction-id',
      accountId: accountB,
      type: 'EXPENSE',
      transferGroupId: null,
    });

    tx.transaction.updateMany.mockImplementation(async () => {
      executionOrder.push('update');
      return { count: 1 };
    });

    const result = await repository.update('transaction-id', userId, {
      accountId: accountA,
    });

    expect(result).toEqual({ count: 1 });

    // First lock: transaction row.
    // Second and third locks: account rows in sorted order.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);

    const accountLockValues = tx.$queryRaw.mock.calls
      .slice(1)
      .map((call: unknown[]) => call[1]);

    expect(accountLockValues).toEqual([accountA, accountB]);
    expect(executionOrder[executionOrder.length - 1]).toBe('update');
  });

  it('locks the affected account before voiding a normal transaction', async () => {
    tx.transaction.findFirst.mockResolvedValue({
      id: 'transaction-id',
      accountId: accountA,
      type: 'EXPENSE',
      transferGroupId: null,
    });

    tx.transaction.updateMany.mockImplementation(async () => {
      executionOrder.push('void');
      return { count: 1 };
    });

    const result = await repository.voidTransaction('transaction-id', userId);

    expect(result).toEqual({ count: 1 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(executionOrder[executionOrder.length - 1]).toBe('void');

    const accountLockValues = tx.$queryRaw.mock.calls[1].slice(1);

    expect(accountLockValues[0]).toBe(accountA);
  });
});
