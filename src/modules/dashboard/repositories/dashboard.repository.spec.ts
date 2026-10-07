import { expect } from '@jest/globals';
import { DashboardRepository } from './dashboard.repository';
import { Prisma } from '../../../../generated/prisma/client';

describe('DashboardRepository', () => {
  let repository: DashboardRepository;

  let prisma: {
    transaction: {
      groupBy: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
      findMany: jest.Mock;
    };
    category: {
      findMany: jest.Mock;
    };
    account: {
      findMany: jest.Mock;
    };
    budget: {
      findMany: jest.Mock;
    };
    recurringTransaction: {
      findMany: jest.Mock;
    };
  };

  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    prisma = {
      transaction: {
        groupBy: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        findMany: jest.fn(),
      },
      category: {
        findMany: jest.fn(),
      },
      account: {
        findMany: jest.fn(),
      },
      budget: {
        findMany: jest.fn(),
      },
      recurringTransaction: {
        findMany: jest.fn(),
      },
    };

    repository = new DashboardRepository(prisma as never);
  });

  describe('getFinancialSummary', () => {
    it('should aggregate active IDR transactions for the user', async () => {
      const groupedTransactions = [
        {
          type: 'INCOME',
          _sum: {
            amount: '5000000',
          },
          _count: {
            _all: 5,
          },
        },
        {
          type: 'EXPENSE',
          _sum: {
            amount: '1750000',
          },
          _count: {
            _all: 3,
          },
        },
      ];

      prisma.transaction.groupBy.mockResolvedValue(groupedTransactions);

      prisma.transaction.count.mockResolvedValue(8);

      const result = await repository.getFinancialSummary(userId);

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith({
        by: ['type'],
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });

      expect(prisma.transaction.count).not.toHaveBeenCalled();

      expect(result).toEqual({
        groupedTransactions,
        transactionCount: 8,
      });
    });

    it('should apply the start and end dates', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);

      prisma.transaction.count.mockResolvedValue(0);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getFinancialSummary(userId, {
        startDate,
        endDate,
      });

      const expectedWhere = {
        userId,
        deletedAt: null,
        status: 'ACTIVE',
        currency: 'IDR',
        transactionDate: {
          gte: startDate,
          lte: endDate,
        },
      };

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
        }),
      );

      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should apply only the start date', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);

      prisma.transaction.count.mockResolvedValue(0);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      await repository.getFinancialSummary(userId, {
        startDate,
      });

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            deletedAt: null,
            status: 'ACTIVE',
            currency: 'IDR',
            transactionDate: {
              gte: startDate,
            },
          },
        }),
      );
    });

    it('should apply only the end date', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);

      prisma.transaction.count.mockResolvedValue(0);

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getFinancialSummary(userId, {
        endDate,
      });

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            deletedAt: null,
            status: 'ACTIVE',
            currency: 'IDR',
            transactionDate: {
              lte: endDate,
            },
          },
        }),
      );
    });
  });

  describe('getIncomeAnalytics', () => {
    it('should aggregate only active IDR income transactions', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '7500000',
        },
        _count: {
          _all: 6,
        },
      });

      const result = await repository.getIncomeAnalytics(userId);

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'INCOME',
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });

      expect(result).toEqual({
        totalIncome: '7500000',
        transactionCount: 6,
      });

      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should apply the date range to income analytics', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '3000000',
        },
        _count: {
          _all: 2,
        },
      });

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getIncomeAnalytics(userId, {
        startDate,
        endDate,
      });

      const expectedWhere = {
        userId,
        deletedAt: null,
        status: 'ACTIVE',
        currency: 'IDR',
        type: 'INCOME',
        transactionDate: {
          gte: startDate,
          lte: endDate,
        },
      };

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: expectedWhere,
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });

      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should apply only the start date', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '1000000',
        },
        _count: {
          _all: 1,
        },
      });

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      await repository.getIncomeAnalytics(userId, {
        startDate,
      });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'INCOME',
          transactionDate: {
            gte: startDate,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should apply only the end date', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '1000000',
        },
        _count: {
          _all: 1,
        },
      });

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getIncomeAnalytics(userId, {
        endDate,
      });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'INCOME',
          transactionDate: {
            lte: endDate,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });
  });

  describe('getExpenseAnalytics', () => {
    it('should aggregate only active IDR expense transactions', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '3750000',
        },
        _count: {
          _all: 10,
        },
      });

      prisma.transaction.count.mockResolvedValue(10);

      const result = await repository.getExpenseAnalytics(userId);

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });

      expect(prisma.transaction.count).not.toHaveBeenCalled();

      expect(result).toEqual({
        totalExpense: '3750000',
        transactionCount: 10,
      });
    });

    it('should apply the date range to expense analytics', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '3000000',
        },
        _count: {
          _all: 3,
        },
      });

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getExpenseAnalytics(userId, {
        startDate,
        endDate,
      });

      const expectedWhere = {
        userId,
        deletedAt: null,
        status: 'ACTIVE',
        currency: 'IDR',
        type: 'EXPENSE',
        transactionDate: {
          gte: startDate,
          lte: endDate,
        },
      };

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: expectedWhere,
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });

      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should apply only the start date', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '1000000',
        },
        _count: {
          _all: 1,
        },
      });

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      await repository.getExpenseAnalytics(userId, {
        startDate,
      });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
          transactionDate: {
            gte: startDate,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should apply only the end date', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '1000000',
        },
        _count: {
          _all: 1,
        },
      });

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getExpenseAnalytics(userId, {
        endDate,
      });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
          transactionDate: {
            lte: endDate,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });
  });

  describe('getCategoryAnalytics', () => {
    it('should aggregate categories and resolve category names', async () => {
      const categoryId = '11111111-1111-4111-8111-111111111111';

      prisma.transaction.groupBy.mockResolvedValue([
        {
          categoryId,
          _sum: {
            amount: '2500000',
          },
          _count: {
            _all: 8,
          },
        },
      ]);

      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '2500000',
        },
      });

      prisma.transaction.count.mockResolvedValue(8);

      prisma.category.findMany.mockResolvedValue([
        {
          id: categoryId,
          name: 'Food',
        },
      ]);

      const result = await repository.getCategoryAnalytics(userId, 'EXPENSE');

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith({
        by: ['categoryId'],
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
          categoryId: {
            not: null,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: [categoryId],
          },
          userId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
        },
      });

      expect(prisma.transaction.aggregate).not.toHaveBeenCalled();

      expect(prisma.transaction.count).not.toHaveBeenCalled();

      expect(result).toEqual({
        groupedCategories: [
          {
            categoryId,
            _sum: {
              amount: '2500000',
            },
            _count: {
              _all: 8,
            },
          },
        ],
        categories: [
          {
            id: categoryId,
            name: 'Food',
          },
        ],
        totalAmount: '2500000',
        transactionCount: 8,
      });
    });

    it('should apply date range', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.category.findMany.mockResolvedValue([]);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getCategoryAnalytics(userId, 'INCOME', {
        startDate,
        endDate,
      });

      const expectedWhere = {
        userId,
        deletedAt: null,
        status: 'ACTIVE',
        currency: 'IDR',
        type: 'INCOME',
        categoryId: {
          not: null,
        },
        transactionDate: {
          gte: startDate,
          lte: endDate,
        },
      };

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
          _count: {
            _all: true,
          },
        }),
      );

      expect(prisma.transaction.aggregate).not.toHaveBeenCalled();
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should not query categories when there are no grouped categories', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: null,
        },
      });
      prisma.transaction.count.mockResolvedValue(0);

      const result = await repository.getCategoryAnalytics(userId, 'EXPENSE');

      expect(prisma.category.findMany).not.toHaveBeenCalled();

      expect(result).toEqual({
        groupedCategories: [],
        categories: [],
        totalAmount: null,
        transactionCount: 0,
      });
    });
  });

  describe('getAccountAnalytics', () => {
    it('should aggregate accounts and resolve account names', async () => {
      const accountId = '11111111-1111-4111-8111-111111111111';

      prisma.transaction.groupBy.mockResolvedValue([
        {
          accountId,
          _sum: {
            amount: '2500000',
          },
          _count: {
            _all: 8,
          },
        },
      ]);

      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '2500000',
        },
      });

      prisma.transaction.count.mockResolvedValue(8);

      prisma.account.findMany.mockResolvedValue([
        {
          id: accountId,
          name: 'BCA',
        },
      ]);

      const result = await repository.getAccountAnalytics(userId, 'EXPENSE');

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith({
        by: ['accountId'],
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });

      expect(prisma.account.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: [accountId],
          },
          userId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
        },
      });

      expect(prisma.transaction.aggregate).not.toHaveBeenCalled();

      expect(prisma.transaction.count).not.toHaveBeenCalled();

      expect(result).toEqual({
        groupedAccounts: [
          {
            accountId,
            _sum: {
              amount: '2500000',
            },
            _count: {
              _all: 8,
            },
          },
        ],
        accounts: [
          {
            id: accountId,
            name: 'BCA',
          },
        ],
        totalAmount: '2500000',
        transactionCount: 8,
      });
    });

    it('should apply date range', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.account.findMany.mockResolvedValue([]);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getAccountAnalytics(userId, 'INCOME', {
        startDate,
        endDate,
      });

      const expectedWhere = {
        userId,
        deletedAt: null,
        status: 'ACTIVE',
        currency: 'IDR',
        type: 'INCOME',
        transactionDate: {
          gte: startDate,
          lte: endDate,
        },
      };

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
          _count: {
            _all: true,
          },
        }),
      );

      expect(prisma.transaction.aggregate).not.toHaveBeenCalled();
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should not query accounts when there are no grouped accounts', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: null,
        },
      });
      prisma.transaction.count.mockResolvedValue(0);

      const result = await repository.getAccountAnalytics(userId, 'EXPENSE');

      expect(prisma.account.findMany).not.toHaveBeenCalled();

      expect(result).toEqual({
        groupedAccounts: [],
        accounts: [],
        totalAmount: null,
        transactionCount: 0,
      });
    });
  });

  describe('getIncomeExpenseAnalyticsBase', () => {
    it('should aggregate income and expense in one grouped query', async () => {
      const groupedTransactions = [
        {
          type: 'INCOME',
          _sum: {
            amount: '5000000',
          },
          _count: {
            _all: 5,
          },
        },
        {
          type: 'EXPENSE',
          _sum: {
            amount: '2000000',
          },
          _count: {
            _all: 3,
          },
        },
      ];

      prisma.transaction.groupBy.mockResolvedValue(groupedTransactions);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      const result = await repository.getIncomeExpenseAnalyticsBase(userId, {
        startDate,
        endDate,
      });

      expect(result).toEqual(groupedTransactions);

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith({
        by: ['type'],
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: {
            in: ['INCOME', 'EXPENSE'],
          },
          transactionDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });

      expect(prisma.transaction.count).not.toHaveBeenCalled();

      expect(prisma.transaction.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('getBudgetPerformance', () => {
    it('should load budgets and aggregate actual expenses', async () => {
      const categoryId = '11111111-1111-4111-8111-111111111111';

      const budgetId = '22222222-2222-4222-8222-222222222222';

      prisma.budget.findMany.mockResolvedValue([
        {
          id: budgetId,
          name: 'Food Budget',
          categoryId,
          amount: '3000000',
          category: {
            id: categoryId,
            name: 'Food',
          },
        },
      ]);

      prisma.transaction.groupBy.mockResolvedValue([
        {
          categoryId,
          _sum: {
            amount: '2250000',
          },
          _count: {
            _all: 12,
          },
        },
      ]);

      const result = await repository.getBudgetPerformance(userId);

      expect(prisma.budget.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
        },
        include: {
          category: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith({
        by: ['categoryId'],
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
          categoryId: {
            in: [categoryId],
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });

      expect(result).toEqual({
        budgets: [
          {
            id: budgetId,
            name: 'Food Budget',
            categoryId,
            amount: '3000000',
            category: {
              id: categoryId,
              name: 'Food',
            },
          },
        ],
        transactions: [
          {
            categoryId,
            _sum: {
              amount: '2250000',
            },
            _count: {
              _all: 12,
            },
          },
        ],
      });
    });

    it('should return empty data without querying transactions when there are no budgets', async () => {
      prisma.budget.findMany.mockResolvedValue([]);

      const result = await repository.getBudgetPerformance(userId);

      expect(prisma.transaction.groupBy).not.toHaveBeenCalled();

      expect(result).toEqual({
        budgets: [],
        transactions: [],
      });
    });

    it('should apply date range to transaction analytics', async () => {
      prisma.budget.findMany.mockResolvedValue([
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Food Budget',
          categoryId: '11111111-1111-4111-8111-111111111111',
          amount: '3000000',
          category: {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Food',
          },
        },
      ]);

      prisma.transaction.groupBy.mockResolvedValue([]);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getBudgetPerformance(userId, {
        startDate,
        endDate,
      });

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            transactionDate: {
              gte: startDate,
              lte: endDate,
            },
          }),
        }),
      );
    });
  });

  describe('getRecurringPerformance', () => {
    it('should load active recurring transactions for the user', async () => {
      prisma.recurringTransaction.findMany.mockResolvedValue([
        {
          id: 'recurring-1',
          userId: 'user-1',
          isActive: true,
          amount: new Prisma.Decimal(100000),
          type: 'EXPENSE',
          frequency: 'MONTHLY',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: null,
          description: 'Netflix',
        },
      ] as never);

      prisma.transaction.findMany.mockResolvedValue([
        {
          id: 'transaction-1',
          recurringTransactionId: 'recurring-1',
          amount: new Prisma.Decimal(100000),
          transactionDate: new Date('2026-01-01T00:00:00.000Z'),
        },
      ] as never);

      const result = await repository.getRecurringPerformance('user-1');

      expect(prisma.recurringTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            isActive: true,
          }),
        }),
      );

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            currency: 'IDR',
            status: 'ACTIVE',
          }),
        }),
      );

      expect(result.recurringTransactions).toHaveLength(1);

      expect(result.transactions).toHaveLength(1);
    });

    it('should return empty transaction data when there are no recurring transactions', async () => {
      prisma.recurringTransaction.findMany.mockResolvedValue([]);

      const result = await repository.getRecurringPerformance('user-1');

      expect(result).toEqual({
        recurringTransactions: [],
        transactions: [],
      });

      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getCashFlow', () => {
    it('should return only active IDR income and expense transactions', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        {
          id: 'transaction-1',
          type: 'INCOME',
          amount: new Prisma.Decimal(5000000),
          transactionDate: new Date('2026-09-01T00:00:00.000Z'),
        },
      ] as never);

      const result = await repository.getCashFlow('user-1', {
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T23:59:59.999Z'),
        period: 'MONTH',
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            deletedAt: null,
            status: 'ACTIVE',
            currency: 'IDR',
            type: {
              in: ['INCOME', 'EXPENSE'],
            },
          }),
          orderBy: {
            transactionDate: 'asc',
          },
        }),
      );

      expect(result).toHaveLength(1);
    });

    it('should return an empty array when there are no transactions', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      const result = await repository.getCashFlow('user-1', {
        period: 'MONTH',
      });

      expect(result).toEqual([]);
    });
  });

  describe('getMonthlyFinancialSummary', () => {
    it('should find only active IDR income and expense transactions', async () => {
      const transactions = [
        {
          id: 'transaction-1',
          type: 'INCOME',
          amount: new Prisma.Decimal('5000000'),
          transactionDate: new Date('2026-09-01T00:00:00.000Z'),
        },
      ];

      prisma.transaction.findMany.mockResolvedValue(transactions as never);

      const result = await repository.getMonthlyFinancialSummary('user-id', {
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T23:59:59.999Z'),
      });

      expect(result).toEqual(transactions);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-id',
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: {
            in: ['INCOME', 'EXPENSE'],
          },
          transactionDate: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lte: new Date('2026-09-30T23:59:59.999Z'),
          },
        },
        select: {
          id: true,
          type: true,
          amount: true,
          transactionDate: true,
        },
        orderBy: {
          transactionDate: 'asc',
        },
      });
    });

    it('should support an empty result', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      const result = await repository.getMonthlyFinancialSummary('user-id', {});

      expect(result).toEqual([]);
    });

    it('should apply only the provided start date', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      await repository.getMonthlyFinancialSummary('user-id', {
        startDate: new Date('2026-01-01T00:00:00.000Z'),
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            transactionDate: {
              gte: new Date('2026-01-01T00:00:00.000Z'),
            },
          }),
        }),
      );
    });

    it('should apply only the provided end date', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      await repository.getMonthlyFinancialSummary('user-id', {
        endDate: new Date('2026-12-31T23:59:59.999Z'),
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            transactionDate: {
              lte: new Date('2026-12-31T23:59:59.999Z'),
            },
          }),
        }),
      );
    });
  });
});
