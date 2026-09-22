import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';

import { RecurringTransactionsRepository } from './repositories/recurring-transactions.repository';
import { RecurringTransactionsService } from './recurring-transactions.service';

import { RecurringFrequency } from 'src/database/enums/recurring-frequency.enum';
import { TransactionType } from 'src/database/enums/transaction-type.enum';

describe('RecurringTransactionsService', () => {
  let service: RecurringTransactionsService;

  let recurringTransactionsRepository: {
    create: jest.Mock;
    findById: jest.Mock;
    findByIdAndUserId: jest.Mock;
    findManyByUserId: jest.Mock;
    findManyActiveByUserId: jest.Mock;
    findManyDue: jest.Mock;
    update: jest.Mock;
    setEnabled: jest.Mock;
    delete: jest.Mock;
    executeDueTransaction: jest.Mock;
  };

  let accountsService: {
    findById: jest.Mock;
  };

  let categoriesService: {
    findById: jest.Mock;
  };

  const userId = '11111111-1111-4111-8111-111111111111';

  const recurringTransactionId = '22222222-2222-4222-8222-222222222222';

  const accountId = '33333333-3333-4333-8333-333333333333';

  const categoryId = '44444444-4444-4444-8444-444444444444';

  beforeEach(async () => {
    recurringTransactionsRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdAndUserId: jest.fn(),
      findManyByUserId: jest.fn(),
      findManyActiveByUserId: jest.fn(),
      findManyDue: jest.fn(),
      update: jest.fn(),
      setEnabled: jest.fn(),
      delete: jest.fn(),
      executeDueTransaction: jest.fn(),
    };

    accountsService = {
      findById: jest.fn(),
    };

    categoriesService = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringTransactionsService,
        {
          provide: RecurringTransactionsRepository,
          useValue: recurringTransactionsRepository,
        },
        {
          provide: AccountsService,
          useValue: accountsService,
        },
        {
          provide: CategoriesService,
          useValue: categoriesService,
        },
      ],
    }).compile();

    service = module.get<RecurringTransactionsService>(
      RecurringTransactionsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    it('should execute a due recurring transaction', async () => {
      const scheduledAt = new Date('2026-09-20T00:00:00.000Z');

      const nextRunAt = new Date('2026-09-21T00:00:00.000Z');

      const recurringTransaction = {
        id: recurringTransactionId,
        userId,
        accountId,
        categoryId,
        type: TransactionType.EXPENSE,
        amount: '150000',
        description: 'Daily expense',
        frequency: RecurringFrequency.DAILY,
        startDate: new Date('2026-09-19T00:00:00.000Z'),
        endDate: null,
        nextRunAt: scheduledAt,
        lastRunAt: null,
        isActive: true,
      };

      const transaction = {
        id: '55555555-5555-4555-8555-555555555555',
        userId,
        accountId,
        categoryId,
        type: TransactionType.EXPENSE,
        amount: '150000',
        currency: 'IDR',
        description: 'Daily expense',
        transactionDate: scheduledAt,
        source: 'SYSTEM',
        status: 'ACTIVE',
      };

      const updatedRecurringTransaction = {
        ...recurringTransaction,
        lastRunAt: scheduledAt,
        nextRunAt,
      };

      recurringTransactionsRepository.findByIdAndUserId.mockResolvedValue(
        recurringTransaction,
      );

      recurringTransactionsRepository.executeDueTransaction.mockResolvedValue({
        transaction,
        recurringTransaction: updatedRecurringTransaction,
      });

      const result = await service.execute(userId, recurringTransactionId);

      expect(
        recurringTransactionsRepository.findByIdAndUserId,
      ).toHaveBeenCalledWith(recurringTransactionId, userId);

      expect(
        recurringTransactionsRepository.executeDueTransaction,
      ).toHaveBeenCalledWith(
        recurringTransactionId,
        scheduledAt,
        expect.any(Date),
        true,
      );

      expect(result).toEqual({
        transaction,
        recurringTransaction: updatedRecurringTransaction,
      });
    });

    it('should reject a recurring transaction that does not exist', async () => {
      recurringTransactionsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.execute(userId, recurringTransactionId),
      ).rejects.toThrow(NotFoundException);

      expect(
        recurringTransactionsRepository.executeDueTransaction,
      ).not.toHaveBeenCalled();
    });

    it('should reject an inactive recurring transaction', async () => {
      recurringTransactionsRepository.findByIdAndUserId.mockResolvedValue({
        id: recurringTransactionId,
        userId,
        accountId,
        categoryId,
        type: TransactionType.EXPENSE,
        amount: '150000',
        description: 'Disabled expense',
        frequency: RecurringFrequency.DAILY,
        startDate: new Date('2026-09-19T00:00:00.000Z'),
        endDate: null,
        nextRunAt: new Date('2026-09-20T00:00:00.000Z'),
        lastRunAt: null,
        isActive: false,
      });

      await expect(
        service.execute(userId, recurringTransactionId),
      ).rejects.toThrow(BadRequestException);

      expect(
        recurringTransactionsRepository.executeDueTransaction,
      ).not.toHaveBeenCalled();
    });

    it('should reject a recurring transaction that is not due yet', async () => {
      const futureRunAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      recurringTransactionsRepository.findByIdAndUserId.mockResolvedValue({
        id: recurringTransactionId,
        userId,
        accountId,
        categoryId,
        type: TransactionType.EXPENSE,
        amount: '150000',
        description: 'Future expense',
        frequency: RecurringFrequency.DAILY,
        startDate: new Date(),
        endDate: null,
        nextRunAt: futureRunAt,
        lastRunAt: null,
        isActive: true,
      });

      await expect(
        service.execute(userId, recurringTransactionId),
      ).rejects.toThrow(BadRequestException);

      expect(
        recurringTransactionsRepository.executeDueTransaction,
      ).not.toHaveBeenCalled();
    });

    it('should deactivate the recurring transaction when the next run exceeds endDate', async () => {
      const scheduledAt = new Date('2026-09-20T00:00:00.000Z');

      const endDate = new Date('2026-09-20T00:00:00.000Z');

      const recurringTransaction = {
        id: recurringTransactionId,
        userId,
        accountId,
        categoryId,
        type: TransactionType.EXPENSE,
        amount: '150000',
        description: 'Last scheduled expense',
        frequency: RecurringFrequency.DAILY,
        startDate: new Date('2026-09-19T00:00:00.000Z'),
        endDate,
        nextRunAt: scheduledAt,
        lastRunAt: null,
        isActive: true,
      };

      recurringTransactionsRepository.findByIdAndUserId.mockResolvedValue(
        recurringTransaction,
      );

      recurringTransactionsRepository.executeDueTransaction.mockResolvedValue({
        transaction: {
          id: '55555555-5555-4555-8555-555555555555',
        },
        recurringTransaction: {
          ...recurringTransaction,
          lastRunAt: scheduledAt,
          nextRunAt: null,
          isActive: false,
        },
      });

      const result = await service.execute(userId, recurringTransactionId);

      expect(
        recurringTransactionsRepository.executeDueTransaction,
      ).toHaveBeenCalledWith(recurringTransactionId, scheduledAt, null, false);

      expect(result.recurringTransaction.isActive).toBe(false);

      expect(result.recurringTransaction.nextRunAt).toBeNull();
    });

    it('should preserve ownership by using userId when executing', async () => {
      recurringTransactionsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.execute(userId, recurringTransactionId),
      ).rejects.toThrow(NotFoundException);

      expect(
        recurringTransactionsRepository.findByIdAndUserId,
      ).toHaveBeenCalledWith(recurringTransactionId, userId);
    });

    it('should not execute when repository execution fails', async () => {
      const scheduledAt = new Date('2026-09-20T00:00:00.000Z');

      recurringTransactionsRepository.findByIdAndUserId.mockResolvedValue({
        id: recurringTransactionId,
        userId,
        accountId,
        categoryId,
        type: TransactionType.EXPENSE,
        amount: '150000',
        description: 'Daily expense',
        frequency: RecurringFrequency.DAILY,
        startDate: new Date('2026-09-19T00:00:00.000Z'),
        endDate: null,
        nextRunAt: scheduledAt,
        lastRunAt: null,
        isActive: true,
      });

      recurringTransactionsRepository.executeDueTransaction.mockResolvedValue(
        null,
      );

      await expect(
        service.execute(userId, recurringTransactionId),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
