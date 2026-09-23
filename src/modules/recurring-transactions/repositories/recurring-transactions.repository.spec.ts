import { Prisma } from '../../../../generated/prisma/client';

import { TransactionDomainService } from 'src/modules/transactions/transaction-domain.service.js';

import { RecurringTransactionsRepository } from './recurring-transactions.repository';
import { PrismaService } from 'src/database/prisma/prisma.service';

describe('RecurringTransactionsRepository', () => {
  let repository: RecurringTransactionsRepository;

  const recurringTransactionCreateMock = jest.fn();
  const recurringTransactionFindUniqueMock = jest.fn();
  const recurringTransactionUpdateManyMock = jest.fn();
  const transactionFindUniqueMock = jest.fn();

  const prismaTransaction = {
    recurringTransaction: {
      findUnique: recurringTransactionFindUniqueMock,
      updateMany: recurringTransactionUpdateManyMock,
    },
    transaction: {
      findUnique: transactionFindUniqueMock,
    },
  };

  const prisma = {
    recurringTransaction: {
      create: recurringTransactionCreateMock,
    },
    $transaction: jest.fn(
      async (callback: (tx: typeof prismaTransaction) => Promise<unknown>) =>
        callback(prismaTransaction),
    ),
  } as unknown as PrismaService;

  const transactionDomainService = {
    createSystemTransaction: jest.fn(),
  } as unknown as TransactionDomainService;

  beforeEach(() => {
    jest.clearAllMocks();

    repository = new RecurringTransactionsRepository(
      prisma,
      transactionDomainService,
    );
  });

  describe('executeDueTransaction', () => {
    const recurringTransactionId = '11111111-1111-4111-8111-111111111111';

    const userId = '22222222-2222-4222-8222-222222222222';

    const accountId = '33333333-3333-4333-8333-333333333333';

    const categoryId = '44444444-4444-4444-8444-444444444444';

    const scheduledAt = new Date('2026-09-23T00:00:00.000Z');

    const nextRunAt = new Date('2026-10-23T00:00:00.000Z');

    const recurringTransaction = {
      id: recurringTransactionId,
      userId,
      accountId,
      categoryId,
      type: 'EXPENSE',
      amount: new Prisma.Decimal('150000'),
      description: 'Monthly internet',
      isActive: true,
      nextRunAt: scheduledAt,
    };

    it('should execute a due recurring transaction successfully', async () => {
      const createdTransaction = {
        id: '55555555-5555-4555-8555-555555555555',
        userId,
        accountId,
        categoryId,
        recurringTransactionId,
        recurringExecutionKey: `${recurringTransactionId}:${scheduledAt.toISOString()}`,
        type: 'EXPENSE',
        amount: new Prisma.Decimal('150000'),
        source: 'SYSTEM',
        status: 'ACTIVE',
      };

      const updatedRecurringTransaction = {
        ...recurringTransaction,
        lastRunAt: scheduledAt,
        nextRunAt,
        isActive: true,
      };

      recurringTransactionFindUniqueMock
        .mockResolvedValueOnce(recurringTransaction)
        .mockResolvedValueOnce(updatedRecurringTransaction);

      transactionFindUniqueMock.mockResolvedValue(null);

      (
        transactionDomainService.createSystemTransaction as jest.Mock
      ).mockResolvedValue(createdTransaction);

      recurringTransactionUpdateManyMock.mockResolvedValue({
        count: 1,
      });

      const result = await repository.executeDueTransaction(
        recurringTransactionId,
        scheduledAt,
        nextRunAt,
        true,
      );

      const recurringExecutionKey = `${recurringTransactionId}:${scheduledAt.toISOString()}`;

      expect(transactionFindUniqueMock).toHaveBeenCalledWith({
        where: {
          recurringExecutionKey,
        },
      });

      expect(
        transactionDomainService.createSystemTransaction,
      ).toHaveBeenCalledWith(prismaTransaction, {
        userId,
        accountId,
        categoryId,
        type: 'EXPENSE',
        amount: recurringTransaction.amount,
        transactionDate: scheduledAt,
        description: 'Monthly internet',
        recurringTransactionId,
        recurringExecutionKey,
        metadata: {
          recurringTransactionId,
          recurringScheduledAt: scheduledAt.toISOString(),
          recurringExecutionKey,
        },
      });

      expect(recurringTransactionUpdateManyMock).toHaveBeenCalledWith({
        where: {
          id: recurringTransactionId,
          isActive: true,
          nextRunAt: scheduledAt,
        },
        data: {
          lastRunAt: scheduledAt,
          nextRunAt,
          isActive: true,
        },
      });

      expect(result).toEqual({
        transaction: createdTransaction,
        recurringTransaction: updatedRecurringTransaction,
        alreadyExecuted: false,
      });
    });

    it('should return null when recurring transaction does not exist', async () => {
      recurringTransactionFindUniqueMock.mockResolvedValue(null);

      const result = await repository.executeDueTransaction(
        recurringTransactionId,
        scheduledAt,
        nextRunAt,
        true,
      );

      expect(result).toBeNull();

      expect(transactionFindUniqueMock).not.toHaveBeenCalled();

      expect(
        transactionDomainService.createSystemTransaction,
      ).not.toHaveBeenCalled();
    });

    it('should return null when recurring transaction is inactive', async () => {
      recurringTransactionFindUniqueMock.mockResolvedValue({
        ...recurringTransaction,
        isActive: false,
      });

      const result = await repository.executeDueTransaction(
        recurringTransactionId,
        scheduledAt,
        nextRunAt,
        true,
      );

      expect(result).toBeNull();

      expect(transactionFindUniqueMock).not.toHaveBeenCalled();

      expect(
        transactionDomainService.createSystemTransaction,
      ).not.toHaveBeenCalled();
    });

    it('should return existing transaction when occurrence was already executed', async () => {
      const existingTransaction = {
        id: '55555555-5555-4555-8555-555555555555',
        recurringTransactionId,
        recurringExecutionKey: `${recurringTransactionId}:${scheduledAt.toISOString()}`,
        source: 'SYSTEM',
      };

      recurringTransactionFindUniqueMock.mockResolvedValue(
        recurringTransaction,
      );

      transactionFindUniqueMock.mockResolvedValue(existingTransaction);

      const result = await repository.executeDueTransaction(
        recurringTransactionId,
        scheduledAt,
        nextRunAt,
        true,
      );

      expect(result).toEqual({
        transaction: existingTransaction,
        recurringTransaction,
        alreadyExecuted: true,
      });

      expect(
        transactionDomainService.createSystemTransaction,
      ).not.toHaveBeenCalled();

      expect(recurringTransactionUpdateManyMock).not.toHaveBeenCalled();
    });

    it('should return null when nextRunAt no longer matches scheduledAt', async () => {
      const changedNextRunAt = new Date('2026-09-24T00:00:00.000Z');

      recurringTransactionFindUniqueMock.mockResolvedValue({
        ...recurringTransaction,
        nextRunAt: changedNextRunAt,
      });

      transactionFindUniqueMock.mockResolvedValue(null);

      const result = await repository.executeDueTransaction(
        recurringTransactionId,
        scheduledAt,
        nextRunAt,
        true,
      );

      expect(result).toBeNull();

      expect(
        transactionDomainService.createSystemTransaction,
      ).not.toHaveBeenCalled();

      expect(recurringTransactionUpdateManyMock).not.toHaveBeenCalled();
    });

    it('should throw when recurring execution state update affects no rows', async () => {
      recurringTransactionFindUniqueMock.mockResolvedValueOnce(
        recurringTransaction,
      );

      transactionFindUniqueMock.mockResolvedValue(null);

      (
        transactionDomainService.createSystemTransaction as jest.Mock
      ).mockResolvedValue({
        id: '55555555-5555-4555-8555-555555555555',
      });

      recurringTransactionUpdateManyMock.mockResolvedValue({
        count: 0,
      });

      await expect(
        repository.executeDueTransaction(
          recurringTransactionId,
          scheduledAt,
          nextRunAt,
          true,
        ),
      ).rejects.toThrow(
        'Recurring transaction execution state changed unexpectedly',
      );
    });
  });
});
