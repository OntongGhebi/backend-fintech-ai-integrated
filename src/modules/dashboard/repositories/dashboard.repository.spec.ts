import { expect } from '@jest/globals';
import { DashboardRepository } from './dashboard.repository';
import { Prisma } from '../../../../generated/prisma/client';
import {
  getBudgetMonthRange,
  getBudgetMonthRanges,
} from '../../budgets/utils/budget-month.util';

describe('DashboardRepository', () => {
  let repository: DashboardRepository;
  let budgetScopeEngine: { resolveCategoryIds: jest.Mock };

  let prisma: {
    transaction: {
      groupBy: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
      findMany: jest.Mock;
    };
    category: { findMany: jest.Mock };
    account: { findMany: jest.Mock };
    budget: { findMany: jest.Mock };
    userPreference: { findUnique: jest.Mock };
    recurringTransaction: { findMany: jest.Mock };
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
      category: { findMany: jest.fn() },
      account: { findMany: jest.fn() },
      budget: { findMany: jest.fn() },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Jakarta' }),
      },
      recurringTransaction: { findMany: jest.fn() },
    };

    budgetScopeEngine = {
      resolveCategoryIds: jest.fn().mockResolvedValue([]),
    };

    repository = new DashboardRepository(
      prisma as never,
      budgetScopeEngine as never,
    );
  });

  describe('getTotalCurrentBalance', () => {
    it('should sum current balances of active non-deleted IDR accounts using ledger transfer directions', async () => {
      prisma.account.findMany.mockResolvedValue([
        { id: 'account-1', openingBalance: new Prisma.Decimal('1000') },
        { id: 'account-2', openingBalance: new Prisma.Decimal('500') },
      ]);
      prisma.transaction.findMany.mockResolvedValue([
        {
          accountId: 'account-1',
          type: 'INCOME',
          amount: new Prisma.Decimal('200'),
          metadata: null,
        },
        {
          accountId: 'account-1',
          type: 'TRANSFER',
          amount: new Prisma.Decimal('300'),
          metadata: { direction: 'OUT' },
        },
        {
          accountId: 'account-2',
          type: 'TRANSFER',
          amount: new Prisma.Decimal('300'),
          metadata: { direction: 'IN' },
        },
        {
          accountId: 'account-2',
          type: 'EXPENSE',
          amount: new Prisma.Decimal('800'),
          metadata: null,
        },
      ] as never);

      await expect(repository.getTotalCurrentBalance(userId)).resolves.toBe(
        '900.0000',
      );
      expect(prisma.account.findMany).toHaveBeenCalledWith({
        where: { userId, isActive: true, deletedAt: null, currency: 'IDR' },
        select: { id: true, openingBalance: true },
      });
      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          accountId: { in: ['account-1', 'account-2'] },
          status: 'ACTIVE',
          deletedAt: null,
          currency: 'IDR',
        },
        select: { accountId: true, type: true, amount: true, metadata: true },
      });
    });

    it('should return zero without querying transactions when there are no active accounts', async () => {
      prisma.account.findMany.mockResolvedValue([]);
      await expect(repository.getTotalCurrentBalance(userId)).resolves.toBe(
        '0.0000',
      );
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getFinancialSummary', () => {
    it('should aggregate active IDR transactions for the user', async () => {
      const groupedTransactions = [
        {
          type: 'INCOME',
          _sum: { amount: '5000000' },
          _count: { _all: 5 },
        },
        {
          type: 'EXPENSE',
          _sum: { amount: '1750000' },
          _count: { _all: 3 },
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
        _sum: { amount: true },
        _count: { _all: true },
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

      await repository.getFinancialSummary(userId, { startDate, endDate });

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            deletedAt: null,
            status: 'ACTIVE',
            currency: 'IDR',
            transactionDate: { gte: startDate, lte: endDate },
          },
        }),
      );
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should apply only the start date', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.transaction.count.mockResolvedValue(0);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      await repository.getFinancialSummary(userId, { startDate });

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            deletedAt: null,
            status: 'ACTIVE',
            currency: 'IDR',
            transactionDate: { gte: startDate },
          },
        }),
      );
    });

    it('should apply only the end date', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.transaction.count.mockResolvedValue(0);

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getFinancialSummary(userId, { endDate });

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            deletedAt: null,
            status: 'ACTIVE',
            currency: 'IDR',
            transactionDate: { lte: endDate },
          },
        }),
      );
    });
  });

  describe('getIncomeAnalytics', () => {
    it('should aggregate only active IDR income transactions', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: '7500000' },
        _count: { _all: 6 },
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
        _sum: { amount: true },
        _count: { _all: true },
      });
      expect(result).toEqual({
        totalIncome: '7500000',
        transactionCount: 6,
      });
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should apply the date range to income analytics', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: '3000000' },
        _count: { _all: 2 },
      });

      const startDate = new Date('2026-09-01T00:00:00.000Z');
      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getIncomeAnalytics(userId, { startDate, endDate });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'INCOME',
          transactionDate: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should apply only the start date', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: '1000000' },
        _count: { _all: 1 },
      });

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      await repository.getIncomeAnalytics(userId, { startDate });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'INCOME',
          transactionDate: { gte: startDate },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should apply only the end date', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: '1000000' },
        _count: { _all: 1 },
      });

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getIncomeAnalytics(userId, { endDate });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'INCOME',
          transactionDate: { lte: endDate },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should scope analytics queries by userId', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: '1000000' },
        _count: { _all: 1 },
      });

      await repository.getExpenseAnalytics('user-123');

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-123' }),
        }),
      );
    });

    it('should exclude deleted and inactive transactions from analytics', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: '1000000' },
        _count: { _all: 1 },
      });

      await repository.getExpenseAnalytics('user-1');

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('should only include IDR transactions', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: '1000000' },
        _count: { _all: 1 },
      });

      await repository.getIncomeAnalytics('user-1');

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ currency: 'IDR' }),
        }),
      );
    });
  });

  describe('getExpenseAnalytics', () => {
    it('should aggregate only active IDR expense transactions', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: '3750000' },
        _count: { _all: 10 },
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
        _sum: { amount: true },
        _count: { _all: true },
      });
      expect(prisma.transaction.count).not.toHaveBeenCalled();
      expect(result).toEqual({
        totalExpense: '3750000',
        transactionCount: 10,
      });
    });

    it('should apply the date range to expense analytics', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: '3000000' },
        _count: { _all: 3 },
      });

      const startDate = new Date('2026-09-01T00:00:00.000Z');
      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getExpenseAnalytics(userId, { startDate, endDate });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
          transactionDate: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should apply only the start date', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: '1000000' },
        _count: { _all: 1 },
      });

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      await repository.getExpenseAnalytics(userId, { startDate });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
          transactionDate: { gte: startDate },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should apply only the end date', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: '1000000' },
        _count: { _all: 1 },
      });

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getExpenseAnalytics(userId, { endDate });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
          transactionDate: { lte: endDate },
        },
        _sum: { amount: true },
        _count: { _all: true },
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
          _sum: { amount: '2500000' },
          _count: { _all: 8 },
        },
      ]);
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: '2500000' },
      });
      prisma.transaction.count.mockResolvedValue(8);
      prisma.category.findMany.mockResolvedValue([
        { id: categoryId, name: 'Food' },
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
          categoryId: { not: null },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: [categoryId] },
          userId,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });
      expect(prisma.transaction.aggregate).not.toHaveBeenCalled();
      expect(prisma.transaction.count).not.toHaveBeenCalled();
      expect(result).toEqual({
        groupedCategories: [
          {
            categoryId,
            _sum: { amount: '2500000' },
            _count: { _all: 8 },
          },
        ],
        categories: [{ id: categoryId, name: 'Food' }],
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

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            deletedAt: null,
            status: 'ACTIVE',
            currency: 'IDR',
            type: 'INCOME',
            categoryId: { not: null },
            transactionDate: { gte: startDate, lte: endDate },
          },
          _count: { _all: true },
        }),
      );
      expect(prisma.transaction.aggregate).not.toHaveBeenCalled();
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should not query categories when there are no grouped categories', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: null },
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
          _sum: { amount: '2500000' },
          _count: { _all: 8 },
        },
      ]);
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: '2500000' },
      });
      prisma.transaction.count.mockResolvedValue(8);
      prisma.account.findMany.mockResolvedValue([
        { id: accountId, name: 'BCA' },
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
        _sum: { amount: true },
        _count: { _all: true },
      });
      expect(prisma.account.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: [accountId] },
          userId,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });
      expect(prisma.transaction.aggregate).not.toHaveBeenCalled();
      expect(prisma.transaction.count).not.toHaveBeenCalled();
      expect(result).toEqual({
        groupedAccounts: [
          {
            accountId,
            _sum: { amount: '2500000' },
            _count: { _all: 8 },
          },
        ],
        accounts: [{ id: accountId, name: 'BCA' }],
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

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            deletedAt: null,
            status: 'ACTIVE',
            currency: 'IDR',
            type: 'INCOME',
            transactionDate: { gte: startDate, lte: endDate },
          },
          _count: { _all: true },
        }),
      );
      expect(prisma.transaction.aggregate).not.toHaveBeenCalled();
      expect(prisma.transaction.count).not.toHaveBeenCalled();
    });

    it('should not query accounts when there are no grouped accounts', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: null },
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
          _sum: { amount: '5000000' },
          _count: { _all: 5 },
        },
        {
          type: 'EXPENSE',
          _sum: { amount: '2000000' },
          _count: { _all: 3 },
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
          type: { in: ['INCOME', 'EXPENSE'] },
          transactionDate: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });
      expect(prisma.transaction.count).not.toHaveBeenCalled();
      expect(prisma.transaction.aggregate).not.toHaveBeenCalled();
    });

    it('should apply report filters to transaction aggregation', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);

      const options = {
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T23:59:59.999Z'),
        type: 'EXPENSE' as const,
        accountId: '11111111-1111-4111-8111-111111111111',
        categoryId: '22222222-2222-4222-8222-222222222222',
      };

      await repository.getIncomeExpenseAnalyticsBase('user-1', options);

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith({
        by: ['type'],
        where: {
          userId: 'user-1',
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
          accountId: '11111111-1111-4111-8111-111111111111',
          categoryId: '22222222-2222-4222-8222-222222222222',
          transactionDate: {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lte: new Date('2026-09-30T23:59:59.999Z'),
          },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });
    });

    it('should exclude transfer transactions from financial analytics', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);

      await repository.getIncomeExpenseAnalyticsBase('user-1');

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: { in: ['INCOME', 'EXPENSE'] },
          }),
        }),
      );
    });
  });

  describe('getBudgetPerformance', () => {
    const foodCategoryId = '11111111-1111-4111-8111-111111111111';
    const transportCategoryId = '22222222-2222-4222-8222-222222222222';

    const createBudget = (overrides: Record<string, unknown> = {}) => {
      const month = getBudgetMonthRange(new Date(), 'Asia/Jakarta');

      return {
        id: 'budget-1',
        name: 'Food Budget',
        categoryId: foodCategoryId,
        scopeType: 'CATEGORY',
        scopeCategoryId: foodCategoryId,
        amount: '9999999',
        allocations: [
          {
            periodStart: month.periodStart,
            amount: '3000000',
          },
        ],
        category: {
          id: foodCategoryId,
          name: 'Food',
        },
        scopeCategory: {
          id: foodCategoryId,
          name: 'Food',
        },
        categoryScopes: [],
        ...overrides,
      };
    };

    it('should load monthly allocations, resolve budget scopes, and fetch raw expense transactions', async () => {
      const month = getBudgetMonthRange(new Date(), 'Asia/Jakarta');
      const budget = createBudget();

      prisma.budget.findMany.mockResolvedValue([budget] as never);
      budgetScopeEngine.resolveCategoryIds.mockResolvedValue([foodCategoryId]);
      prisma.transaction.findMany.mockResolvedValue([
        {
          id: 'transaction-1',
          categoryId: foodCategoryId,
          amount: new Prisma.Decimal('2250000'),
        },
      ] as never);

      const result = await repository.getBudgetPerformance(userId);

      expect(prisma.userPreference.findUnique).toHaveBeenCalledWith({
        where: { userId },
        select: { timezone: true },
      });
      expect(prisma.budget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            deletedAt: null,
            startDate: { lte: month.periodEndDate },
            OR: [{ endDate: null }, { endDate: { gte: month.periodStart } }],
          }),
          include: {
            category: true,
            scopeCategory: true,
            categoryScopes: true,
            allocations: {
              where: { periodStart: { in: [month.periodStart] } },
              orderBy: { periodStart: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(budgetScopeEngine.resolveCategoryIds).toHaveBeenCalledWith(budget);
      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
          transactionDate: {
            gte: month.start,
            lte: new Date(month.end.getTime() - 1),
          },
        },
        select: {
          id: true,
          categoryId: true,
          amount: true,
        },
      });

      expect(result.budgets).toHaveLength(1);
      expect(result.budgets[0]).toEqual(
        expect.objectContaining({
          id: 'budget-1',
          categoryIds: [foodCategoryId],
          scopeType: 'CATEGORY',
          periodStart: month.periodStart,
        }),
      );
      expect(result.budgets[0].amount.toString()).toBe('3000000');
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].id).toBe('transaction-1');
    });

    it('should interpret UTC-midnight date filters as local calendar dates', async () => {
      const startDate = new Date('2026-11-01T00:00:00.000Z');
      const endDate = new Date('2026-11-30T00:00:00.000Z');
      const month = getBudgetMonthRange(
        new Date('2026-11-01T12:00:00.000Z'),
        'Asia/Jakarta',
      );

      prisma.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'november-budget',
          allocations: [{ periodStart: month.periodStart, amount: '1500000' }],
        }),
      ] as never);
      budgetScopeEngine.resolveCategoryIds.mockResolvedValue([foodCategoryId]);
      prisma.transaction.findMany.mockResolvedValue([
        {
          id: 'november-transaction',
          categoryId: foodCategoryId,
          amount: new Prisma.Decimal('117000'),
        },
      ] as never);

      const result = await repository.getBudgetPerformance(userId, {
        startDate,
        endDate,
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            transactionDate: {
              gte: new Date('2026-10-31T17:00:00.000Z'),
              lte: new Date('2026-11-30T16:59:59.999Z'),
            },
          }),
        }),
      );
      expect(result.transactions).toEqual([
        expect.objectContaining({
          id: 'november-transaction',
          categoryId: foodCategoryId,
          amount: expect.any(Prisma.Decimal),
        }),
      ]);
    });

    it('should sum monthly allocations across a multi-month report range', async () => {
      const startDate = new Date('2026-09-01T00:00:00.000Z');
      const endDate = new Date('2026-11-30T16:59:59.999Z');
      const months = getBudgetMonthRanges(startDate, endDate, 'Asia/Jakarta');

      prisma.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'multi-month-budget',
          allocations: [
            { periodStart: months[0].periodStart, amount: '1000000' },
            { periodStart: months[1].periodStart, amount: '1200000' },
            { periodStart: months[2].periodStart, amount: '1400000' },
          ],
        }),
      ] as never);
      budgetScopeEngine.resolveCategoryIds.mockResolvedValue([foodCategoryId]);
      prisma.transaction.findMany.mockResolvedValue([]);

      const result = await repository.getBudgetPerformance(userId, {
        startDate,
        endDate,
      });

      expect(prisma.budget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            allocations: {
              where: {
                periodStart: {
                  in: months.map((month) => month.periodStart),
                },
              },
              orderBy: { periodStart: 'asc' },
            },
          }),
        }),
      );
      expect(result.budgets[0].amount.toString()).toBe('3600000');
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            transactionDate: {
              gte: months[0].start,
              lte: new Date(months[2].end.getTime() - 1),
            },
          }),
        }),
      );
    });

    it('should return empty data without querying transactions when there are no budgets', async () => {
      prisma.budget.findMany.mockResolvedValue([]);

      const result = await repository.getBudgetPerformance(userId);

      expect(result).toEqual({ budgets: [], transactions: [] });
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
      expect(budgetScopeEngine.resolveCategoryIds).not.toHaveBeenCalled();
    });

    it('should omit budgets that do not have an allocation in the selected range', async () => {
      prisma.budget.findMany.mockResolvedValue([
        createBudget({ allocations: [] }),
      ] as never);

      const result = await repository.getBudgetPerformance(userId);

      expect(result).toEqual({ budgets: [], transactions: [] });
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
      expect(budgetScopeEngine.resolveCategoryIds).not.toHaveBeenCalled();
    });

    it('should preserve ALL_EXPENSES scope as null so uncategorized expenses can be matched', async () => {
      const budget = createBudget({
        id: 'all-expenses-budget',
        categoryId: null,
        scopeType: 'ALL_EXPENSES',
        scopeCategoryId: null,
        category: null,
        scopeCategory: null,
      });

      prisma.budget.findMany.mockResolvedValue([budget] as never);
      budgetScopeEngine.resolveCategoryIds.mockResolvedValue(null);
      prisma.transaction.findMany.mockResolvedValue([
        {
          id: 'categorized-expense',
          categoryId: foodCategoryId,
          amount: new Prisma.Decimal('100000'),
        },
        {
          id: 'uncategorized-expense',
          categoryId: null,
          amount: new Prisma.Decimal('50000'),
        },
      ] as never);

      const result = await repository.getBudgetPerformance(userId);

      expect(result.budgets[0].categoryIds).toBeNull();
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            categoryId: expect.anything(),
          }),
        }),
      );
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[1].categoryId).toBeNull();
    });

    it('should fetch all expense transactions once for independent budget scope matching', async () => {
      prisma.budget.findMany.mockResolvedValue([
        createBudget({ id: 'food-budget' }),
        createBudget({
          id: 'transport-budget',
          name: 'Transport Budget',
          categoryId: transportCategoryId,
          scopeType: 'CATEGORY',
          scopeCategoryId: transportCategoryId,
          category: { id: transportCategoryId, name: 'Transport' },
          scopeCategory: { id: transportCategoryId, name: 'Transport' },
        }),
      ] as never);
      budgetScopeEngine.resolveCategoryIds
        .mockResolvedValueOnce([foodCategoryId])
        .mockResolvedValueOnce([transportCategoryId]);
      prisma.transaction.findMany.mockResolvedValue([]);

      const result = await repository.getBudgetPerformance(userId);

      expect(result.budgets).toHaveLength(2);
      expect(budgetScopeEngine.resolveCategoryIds).toHaveBeenCalledTimes(2);
      expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'EXPENSE',
            userId,
          }),
        }),
      );
    });

    it('should apply the requested date range to raw expense transactions', async () => {
      const startDate = new Date('2026-09-01T00:00:00.000Z');
      const endDate = new Date('2026-09-30T16:59:59.999Z');
      const month = getBudgetMonthRange(startDate, 'Asia/Jakarta');

      prisma.budget.findMany.mockResolvedValue([
        createBudget({
          allocations: [{ periodStart: month.periodStart, amount: '3000000' }],
        }),
      ] as never);
      budgetScopeEngine.resolveCategoryIds.mockResolvedValue([foodCategoryId]);
      prisma.transaction.findMany.mockResolvedValue([]);

      await repository.getBudgetPerformance(userId, { startDate, endDate });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            transactionDate: {
              gte: new Date('2026-08-31T17:00:00.000Z'),
              lte: new Date('2026-09-30T16:59:59.999Z'),
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
            type: { in: ['INCOME', 'EXPENSE'] },
          }),
          orderBy: { transactionDate: 'asc' },
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
          type: { in: ['INCOME', 'EXPENSE'] },
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
        orderBy: { transactionDate: 'asc' },
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
