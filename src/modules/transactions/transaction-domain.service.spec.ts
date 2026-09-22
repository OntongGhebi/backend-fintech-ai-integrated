import { BadRequestException, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';

import { TransactionDomainService } from './transaction-domain.service';

describe('TransactionDomainService', () => {
  let service: TransactionDomainService;

  const transactionCreateMock = jest.fn();
  const accountFindFirstMock = jest.fn();
  const categoryFindFirstMock = jest.fn();

  const tx = {
    account: {
      findFirst: accountFindFirstMock,
    },
    category: {
      findFirst: categoryFindFirstMock,
    },
    transaction: {
      create: transactionCreateMock,
    },
  } as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new TransactionDomainService();
  });

  describe('createSystemTransaction', () => {
    const baseParams = {
      userId: 'user-uuid',
      accountId: 'account-uuid',
      categoryId: 'category-uuid',
      type: 'EXPENSE' as const,
      amount: '150000',
      transactionDate: new Date('2026-09-22T12:00:00.000Z'),
      description: 'Monthly expense',
      metadata: {
        recurringExecutionKey: 'recurring-uuid:2026-09-22',
      },
    };

    it('should create a SYSTEM transaction successfully', async () => {
      const account = {
        id: baseParams.accountId,
        userId: baseParams.userId,
        isActive: true,
        currency: 'IDR',
        deletedAt: null,
      };

      const category = {
        id: baseParams.categoryId,
        userId: baseParams.userId,
        isActive: true,
        deletedAt: null,
        type: 'EXPENSE',
      };

      const transaction = {
        id: 'transaction-uuid',
        userId: baseParams.userId,
        accountId: baseParams.accountId,
        categoryId: baseParams.categoryId,
        type: 'EXPENSE',
        amount: '150000',
        currency: 'IDR',
        source: 'SYSTEM',
        status: 'ACTIVE',
      };

      accountFindFirstMock.mockResolvedValue(account);
      categoryFindFirstMock.mockResolvedValue(category);
      transactionCreateMock.mockResolvedValue(transaction);

      const result = await service.createSystemTransaction(tx, baseParams);

      expect(accountFindFirstMock).toHaveBeenCalledWith({
        where: {
          id: baseParams.accountId,
          userId: baseParams.userId,
          deletedAt: null,
        },
      });

      expect(categoryFindFirstMock).toHaveBeenCalledWith({
        where: {
          id: baseParams.categoryId,
          userId: baseParams.userId,
          deletedAt: null,
        },
      });

      expect(transactionCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: baseParams.userId,
          accountId: baseParams.accountId,
          categoryId: baseParams.categoryId,
          type: 'EXPENSE',
          amount: baseParams.amount,
          currency: 'IDR',
          description: baseParams.description,
          transactionDate: baseParams.transactionDate,
          source: 'SYSTEM',
          status: 'ACTIVE',
          transferGroupId: null,
          metadata: baseParams.metadata,
        }),
        include: {
          account: true,
          category: true,
        },
      });

      expect(result).toEqual(transaction);
    });

    it('should reject when account does not exist', async () => {
      accountFindFirstMock.mockResolvedValue(null);

      await expect(
        service.createSystemTransaction(tx, baseParams),
      ).rejects.toThrow(new NotFoundException('Account not found'));

      expect(categoryFindFirstMock).not.toHaveBeenCalled();
      expect(transactionCreateMock).not.toHaveBeenCalled();
    });

    it('should reject when account is inactive', async () => {
      accountFindFirstMock.mockResolvedValue({
        id: baseParams.accountId,
        userId: baseParams.userId,
        isActive: false,
        currency: 'IDR',
        deletedAt: null,
      });

      await expect(
        service.createSystemTransaction(tx, baseParams),
      ).rejects.toThrow(new BadRequestException('Account is inactive'));

      expect(categoryFindFirstMock).not.toHaveBeenCalled();
      expect(transactionCreateMock).not.toHaveBeenCalled();
    });

    it('should reject when account currency is not IDR', async () => {
      accountFindFirstMock.mockResolvedValue({
        id: baseParams.accountId,
        userId: baseParams.userId,
        isActive: true,
        currency: 'USD',
        deletedAt: null,
      });

      await expect(
        service.createSystemTransaction(tx, baseParams),
      ).rejects.toThrow(
        new BadRequestException('Account currency must be IDR'),
      );

      expect(categoryFindFirstMock).not.toHaveBeenCalled();
      expect(transactionCreateMock).not.toHaveBeenCalled();
    });

    it('should reject when category does not exist', async () => {
      accountFindFirstMock.mockResolvedValue({
        id: baseParams.accountId,
        userId: baseParams.userId,
        isActive: true,
        currency: 'IDR',
        deletedAt: null,
      });

      categoryFindFirstMock.mockResolvedValue(null);

      await expect(
        service.createSystemTransaction(tx, baseParams),
      ).rejects.toThrow(new NotFoundException('Category not found'));

      expect(transactionCreateMock).not.toHaveBeenCalled();
    });

    it('should reject when category is inactive', async () => {
      accountFindFirstMock.mockResolvedValue({
        id: baseParams.accountId,
        userId: baseParams.userId,
        isActive: true,
        currency: 'IDR',
        deletedAt: null,
      });

      categoryFindFirstMock.mockResolvedValue({
        id: baseParams.categoryId,
        userId: baseParams.userId,
        isActive: false,
        deletedAt: null,
        type: 'EXPENSE',
      });

      await expect(
        service.createSystemTransaction(tx, baseParams),
      ).rejects.toThrow(new BadRequestException('Category is inactive'));

      expect(transactionCreateMock).not.toHaveBeenCalled();
    });

    it('should reject when category has been deleted', async () => {
      accountFindFirstMock.mockResolvedValue({
        id: baseParams.accountId,
        userId: baseParams.userId,
        isActive: true,
        currency: 'IDR',
        deletedAt: null,
      });

      // The Prisma query explicitly requires deletedAt: null,
      // so a soft-deleted category is not returned.
      categoryFindFirstMock.mockResolvedValue(null);

      await expect(
        service.createSystemTransaction(tx, baseParams),
      ).rejects.toThrow(new NotFoundException('Category not found'));

      expect(categoryFindFirstMock).toHaveBeenCalledWith({
        where: {
          id: baseParams.categoryId,
          userId: baseParams.userId,
          deletedAt: null,
        },
      });

      expect(transactionCreateMock).not.toHaveBeenCalled();
    });

    it('should reject when EXPENSE uses an INCOME category', async () => {
      accountFindFirstMock.mockResolvedValue({
        id: baseParams.accountId,
        userId: baseParams.userId,
        isActive: true,
        currency: 'IDR',
        deletedAt: null,
      });

      categoryFindFirstMock.mockResolvedValue({
        id: baseParams.categoryId,
        userId: baseParams.userId,
        isActive: true,
        deletedAt: null,
        type: 'INCOME',
      });

      await expect(
        service.createSystemTransaction(tx, baseParams),
      ).rejects.toThrow(
        new BadRequestException(
          'Expense transaction requires an expense category',
        ),
      );

      expect(transactionCreateMock).not.toHaveBeenCalled();
    });

    it('should reject when INCOME uses an EXPENSE category', async () => {
      accountFindFirstMock.mockResolvedValue({
        id: baseParams.accountId,
        userId: baseParams.userId,
        isActive: true,
        currency: 'IDR',
        deletedAt: null,
      });

      categoryFindFirstMock.mockResolvedValue({
        id: baseParams.categoryId,
        userId: baseParams.userId,
        isActive: true,
        deletedAt: null,
        type: 'EXPENSE',
      });

      await expect(
        service.createSystemTransaction(tx, {
          ...baseParams,
          type: 'INCOME',
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Income transaction requires an income category',
        ),
      );

      expect(transactionCreateMock).not.toHaveBeenCalled();
    });

    it('should reject TRANSFER with a category', async () => {
      accountFindFirstMock.mockResolvedValue({
        id: baseParams.accountId,
        userId: baseParams.userId,
        isActive: true,
        currency: 'IDR',
        deletedAt: null,
      });

      await expect(
        service.createSystemTransaction(tx, {
          ...baseParams,
          type: 'TRANSFER',
        }),
      ).rejects.toThrow(
        new BadRequestException('Transfer transaction cannot have a category'),
      );

      expect(categoryFindFirstMock).not.toHaveBeenCalled();
      expect(transactionCreateMock).not.toHaveBeenCalled();
    });

    it('should allow TRANSFER without a category', async () => {
      accountFindFirstMock.mockResolvedValue({
        id: baseParams.accountId,
        userId: baseParams.userId,
        isActive: true,
        currency: 'IDR',
        deletedAt: null,
      });

      const transaction = {
        id: 'transfer-transaction-uuid',
        type: 'TRANSFER',
        source: 'SYSTEM',
      };

      transactionCreateMock.mockResolvedValue(transaction);

      const result = await service.createSystemTransaction(tx, {
        ...baseParams,
        type: 'TRANSFER',
        categoryId: null,
      });

      expect(categoryFindFirstMock).not.toHaveBeenCalled();

      expect(transactionCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          categoryId: null,
          type: 'TRANSFER',
          source: 'SYSTEM',
          status: 'ACTIVE',
        }),
        include: {
          account: true,
          category: true,
        },
      });

      expect(result).toEqual(transaction);
    });

    it('should use Prisma.DbNull when metadata is omitted', async () => {
      accountFindFirstMock.mockResolvedValue({
        id: baseParams.accountId,
        userId: baseParams.userId,
        isActive: true,
        currency: 'IDR',
        deletedAt: null,
      });

      categoryFindFirstMock.mockResolvedValue({
        id: baseParams.categoryId,
        userId: baseParams.userId,
        isActive: true,
        deletedAt: null,
        type: 'EXPENSE',
      });

      transactionCreateMock.mockResolvedValue({
        id: 'transaction-uuid',
      });

      await service.createSystemTransaction(tx, {
        ...baseParams,
        metadata: undefined,
      });

      expect(transactionCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: Prisma.DbNull,
        }),
        include: {
          account: true,
          category: true,
        },
      });
    });

    it('should trim description before creating the transaction', async () => {
      accountFindFirstMock.mockResolvedValue({
        id: baseParams.accountId,
        userId: baseParams.userId,
        isActive: true,
        currency: 'IDR',
        deletedAt: null,
      });

      categoryFindFirstMock.mockResolvedValue({
        id: baseParams.categoryId,
        userId: baseParams.userId,
        isActive: true,
        deletedAt: null,
        type: 'EXPENSE',
      });

      transactionCreateMock.mockResolvedValue({
        id: 'transaction-uuid',
      });

      await service.createSystemTransaction(tx, {
        ...baseParams,
        description: '   Monthly expense   ',
      });

      expect(transactionCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          description: 'Monthly expense',
        }),
        include: {
          account: true,
          category: true,
        },
      });
    });
  });
});
