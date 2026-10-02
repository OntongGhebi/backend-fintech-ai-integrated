import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { TransactionSource } from 'src/database/enums/transaction-source.enum';

import { TransactionsService } from '../../transactions/transactions.service';

import { AITransactionConfirmation } from '../types/ai-transaction-confirmation.types';

import { AITransactionPersistenceService } from './ai-transaction-persistence.service';

describe('AITransactionPersistenceService', () => {
  let service: AITransactionPersistenceService;

  const transactionsService = {
    create: jest.fn(),
    createTransfer: jest.fn(),
  };

  const transactionDate = new Date('2026-10-02T10:00:00.000Z');

  const baseConfirmation: AITransactionConfirmation = {
    id: 'confirmation-id',

    draft: {
      type: 'EXPENSE',
      amount: 50000,
      description: 'makan siang',

      accountId: 'account-1',
      categoryId: 'category-1',
      destinationAccountId: null,

      currency: 'IDR',

      status: 'READY',
      ready: true,

      unresolvedFields: [],
    },

    status: 'CONFIRMED',

    createdAt: new Date('2026-10-02T09:59:00.000Z'),

    expiresAt: new Date('2026-10-02T10:04:00.000Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AITransactionPersistenceService,
        {
          provide: TransactionsService,
          useValue: transactionsService,
        },
      ],
    }).compile();

    service = module.get<AITransactionPersistenceService>(
      AITransactionPersistenceService,
    );
  });

  describe('expense', () => {
    it('should create an expense through TransactionsService', async () => {
      const transaction = {
        id: 'transaction-1',
        userId: 'user-1',
        accountId: 'account-1',
        categoryId: 'category-1',
        type: 'EXPENSE',
        amount: 50000,
        currency: 'IDR',
        source: 'AI',
        status: 'ACTIVE',
      };

      transactionsService.create.mockResolvedValue(transaction);

      const result = await service.create(
        'user-1',
        baseConfirmation,
        transactionDate,
      );

      expect(transactionsService.create).toHaveBeenCalledTimes(1);

      expect(transactionsService.create).toHaveBeenCalledWith(
        'user-1',
        {
          accountId: 'account-1',
          categoryId: 'category-1',
          type: 'EXPENSE',
          amount: 50000,
          description: 'makan siang',
          transactionDate: transactionDate.toISOString(),
        },
        TransactionSource.AI,
      );

      expect(result).toEqual({
        type: 'EXPENSE',
        transaction,
      });
    });
  });

  describe('income', () => {
    it('should create an income through TransactionsService', async () => {
      const confirmation: AITransactionConfirmation = {
        ...baseConfirmation,

        draft: {
          ...baseConfirmation.draft,

          type: 'INCOME',
          amount: 5000000,
          description: 'gaji',
          categoryId: 'category-income',
        },
      };

      const transaction = {
        id: 'transaction-income',
        type: 'INCOME',
        amount: 5000000,
        source: 'AI',
      };

      transactionsService.create.mockResolvedValue(transaction);

      const result = await service.create(
        'user-1',
        confirmation,
        transactionDate,
      );

      expect(transactionsService.create).toHaveBeenCalledWith(
        'user-1',
        {
          accountId: 'account-1',
          categoryId: 'category-income',
          type: 'INCOME',
          amount: 5000000,
          description: 'gaji',
          transactionDate: transactionDate.toISOString(),
        },
        TransactionSource.AI,
      );

      expect(result).toEqual({
        type: 'INCOME',
        transaction,
      });
    });
  });

  describe('transfer', () => {
    it('should create a transfer through TransactionsService', async () => {
      const confirmation: AITransactionConfirmation = {
        ...baseConfirmation,

        draft: {
          ...baseConfirmation.draft,

          type: 'TRANSFER',
          amount: 100000,
          description: 'transfer ke tabungan',
          categoryId: null,
          destinationAccountId: 'account-2',
        },
      };

      const transferResult = {
        transferGroupId: 'transfer-group-1',
        transactions: [
          {
            id: 'transaction-source',
            accountId: 'account-1',
            type: 'TRANSFER',
            source: 'AI',
          },
          {
            id: 'transaction-destination',
            accountId: 'account-2',
            type: 'TRANSFER',
            source: 'AI',
          },
        ],
      };

      transactionsService.createTransfer.mockResolvedValue(transferResult);

      const result = await service.create(
        'user-1',
        confirmation,
        transactionDate,
      );

      expect(transactionsService.createTransfer).toHaveBeenCalledTimes(1);

      expect(transactionsService.createTransfer).toHaveBeenCalledWith(
        'user-1',
        {
          sourceAccountId: 'account-1',
          destinationAccountId: 'account-2',
          amount: 100000,
          description: 'transfer ke tabungan',
          transactionDate: transactionDate.toISOString(),
        },
        TransactionSource.AI,
      );

      expect(result).toEqual({
        type: 'TRANSFER',
        transferGroupId: 'transfer-group-1',
        transactions: transferResult.transactions,
      });
    });
  });

  describe('validation', () => {
    it('should reject a non-confirmed confirmation', async () => {
      const confirmation: AITransactionConfirmation = {
        ...baseConfirmation,
        status: 'PENDING',
      };

      await expect(
        service.create('user-1', confirmation, transactionDate),
      ).rejects.toThrow(
        'Transaction confirmation must be confirmed before persistence',
      );

      expect(transactionsService.create).not.toHaveBeenCalled();

      expect(transactionsService.createTransfer).not.toHaveBeenCalled();
    });

    it('should reject a cancelled confirmation', async () => {
      const confirmation: AITransactionConfirmation = {
        ...baseConfirmation,
        status: 'CANCELLED',
      };

      await expect(
        service.create('user-1', confirmation, transactionDate),
      ).rejects.toThrow(BadRequestException);

      expect(transactionsService.create).not.toHaveBeenCalled();
    });

    it('should reject an expired confirmation state', async () => {
      const confirmation: AITransactionConfirmation = {
        ...baseConfirmation,
        status: 'EXPIRED',
      };

      await expect(
        service.create('user-1', confirmation, transactionDate),
      ).rejects.toThrow(BadRequestException);

      expect(transactionsService.create).not.toHaveBeenCalled();
    });

    it('should reject a draft that is not ready', async () => {
      const confirmation: AITransactionConfirmation = {
        ...baseConfirmation,

        draft: {
          ...baseConfirmation.draft,

          ready: false,
          status: 'NEEDS_RESOLUTION',
          unresolvedFields: ['account'],
          accountId: null,
        },
      };

      await expect(
        service.create('user-1', confirmation, transactionDate),
      ).rejects.toThrow('Transaction draft is not ready for persistence');

      expect(transactionsService.create).not.toHaveBeenCalled();
    });

    it('should reject zero amount', async () => {
      const confirmation: AITransactionConfirmation = {
        ...baseConfirmation,

        draft: {
          ...baseConfirmation.draft,
          amount: 0,
        },
      };

      await expect(
        service.create('user-1', confirmation, transactionDate),
      ).rejects.toThrow('Transaction amount must be greater than zero');

      expect(transactionsService.create).not.toHaveBeenCalled();
    });

    it('should reject negative amount', async () => {
      const confirmation: AITransactionConfirmation = {
        ...baseConfirmation,

        draft: {
          ...baseConfirmation.draft,
          amount: -10000,
        },
      };

      await expect(
        service.create('user-1', confirmation, transactionDate),
      ).rejects.toThrow('Transaction amount must be greater than zero');

      expect(transactionsService.create).not.toHaveBeenCalled();
    });

    it('should reject a transfer without source account', async () => {
      const confirmation: AITransactionConfirmation = {
        ...baseConfirmation,

        draft: {
          ...baseConfirmation.draft,

          type: 'TRANSFER',
          accountId: null,
          destinationAccountId: 'account-2',
        },
      };

      await expect(
        service.create('user-1', confirmation, transactionDate),
      ).rejects.toThrow('Source account is required for transfer persistence');

      expect(transactionsService.createTransfer).not.toHaveBeenCalled();
    });

    it('should reject a transfer without destination account', async () => {
      const confirmation: AITransactionConfirmation = {
        ...baseConfirmation,

        draft: {
          ...baseConfirmation.draft,

          type: 'TRANSFER',
          destinationAccountId: null,
        },
      };

      await expect(
        service.create('user-1', confirmation, transactionDate),
      ).rejects.toThrow(
        'Destination account is required for transfer persistence',
      );

      expect(transactionsService.createTransfer).not.toHaveBeenCalled();
    });

    it('should reject a transfer using the same account', async () => {
      const confirmation: AITransactionConfirmation = {
        ...baseConfirmation,

        draft: {
          ...baseConfirmation.draft,

          type: 'TRANSFER',
          destinationAccountId: 'account-1',
        },
      };

      await expect(
        service.create('user-1', confirmation, transactionDate),
      ).rejects.toThrow('Source and destination accounts must be different');

      expect(transactionsService.createTransfer).not.toHaveBeenCalled();
    });

    it('should reject an invalid transaction date', async () => {
      await expect(
        service.create('user-1', baseConfirmation, new Date('invalid')),
      ).rejects.toThrow('Transaction date is invalid');

      expect(transactionsService.create).not.toHaveBeenCalled();
    });
  });
});
