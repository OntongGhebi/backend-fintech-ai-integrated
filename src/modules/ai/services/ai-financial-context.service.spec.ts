import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../../../generated/prisma/client';

import { PrismaService } from '../../../database/prisma/prisma.service';
import { AIFinancialContextService } from './ai-financial-context.service';

describe('AIFinancialContextService', () => {
  let service: AIFinancialContextService;

  const prismaMock = {
    userPreference: {
      findUnique: jest.fn(),
    },
    transaction: {
      aggregate: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    budget: {
      findMany: jest.fn(),
    },
  };

  const decimal = (value: string | number) => new Prisma.Decimal(value);

  const makeBudget = (overrides: Record<string, unknown> = {}) => ({
    id: 'budget-1',
    name: 'Budget Makanan',
    amount: decimal('1000.00'),
    currency: 'IDR',
    period: 'MONTHLY',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: null,
    categoryId: null,
    ...overrides,
  });

  const isBudgetTransactionQuery = (args: any) =>
    args?.where?.type === 'EXPENSE' &&
    args?.select?.transactionDate === true &&
    args?.select?.amount === true &&
    args?.select?.categoryId === true;

  const isRecentTransactionQuery = (args: any) =>
    args?.take === 10 && args?.orderBy?.transactionDate === 'desc';

  const isCategoryExpenseQuery = (args: any) =>
    args?.where?.type === 'EXPENSE' &&
    args?.select?.amount === true &&
    args?.select?.category?.select?.name === true &&
    args?.select?.transactionDate === undefined;

  const getBudgetTransactionQuery = () =>
    prismaMock.transaction.findMany.mock.calls.find(([args]) =>
      isBudgetTransactionQuery(args),
    );

  const getBudgetTransactions = () => getBudgetTransactionQuery()?.[0];

  const getRecentTransactionQuery = () =>
    prismaMock.transaction.findMany.mock.calls.find(([args]) =>
      isRecentTransactionQuery(args),
    );

  const getCategoryExpenseQuery = () =>
    prismaMock.transaction.findMany.mock.calls.find(([args]) =>
      isCategoryExpenseQuery(args),
    );

  const mockFindManyResults = (options?: {
    categoryExpenses?: unknown[];
    recentTransactions?: unknown[];
    budgetTransactions?: unknown[];
  }) => {
    const categoryExpenses = options?.categoryExpenses ?? [];
    const recentTransactions = options?.recentTransactions ?? [];
    const budgetTransactions = options?.budgetTransactions ?? [];

    prismaMock.transaction.findMany.mockImplementation(async (args: any) => {
      if (isBudgetTransactionQuery(args)) {
        // Return fixture data directly. Date and category matching are
        // the service's responsibility, not the mock's.
        return budgetTransactions as never;
      }

      if (isRecentTransactionQuery(args)) {
        return recentTransactions as never;
      }

      if (isCategoryExpenseQuery(args)) {
        return categoryExpenses as never;
      }

      return [] as never;
    });
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    prismaMock.userPreference.findUnique.mockResolvedValue({
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
    });

    prismaMock.transaction.aggregate.mockResolvedValue({
      _sum: { amount: null },
      _count: { _all: 0 },
    });

    prismaMock.transaction.count.mockResolvedValue(0);
    prismaMock.budget.findMany.mockResolvedValue([]);

    mockFindManyResults();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIFinancialContextService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AIFinancialContextService>(AIFinancialContextService);
  });

  describe('getContext', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should return an empty financial summary when no transactions exist', async () => {
      const result = await service.getContext('user-1');

      expect(result.summary.income).toBe('0.00');
      expect(result.summary.expense).toBe('0.00');
      expect(result.summary.balance).toBe('0.00');
      expect(result.expensesByCategory).toEqual([]);
      expect(result.recentTransactions).toEqual([]);
      expect(result.budgets).toEqual([]);
    });

    it('should use the user currency and timezone preferences', async () => {
      prismaMock.userPreference.findUnique.mockResolvedValue({
        currency: 'USD',
        timezone: 'America/New_York',
      });

      const result = await service.getContext('user-1');

      expect(result.currency).toBe('USD');
      expect(result.timezone).toBe('America/New_York');
    });

    it('should fall back to IDR and Asia/Jakarta when preferences are missing', async () => {
      prismaMock.userPreference.findUnique.mockResolvedValue(null);

      const result = await service.getContext('user-1');

      expect(result.currency).toBe('IDR');
      expect(result.timezone).toBe('Asia/Jakarta');
    });

    it('should scope preference lookup to the authenticated user', async () => {
      await service.getContext('user-123');

      expect(prismaMock.userPreference.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-123' } }),
      );
    });

    it('should aggregate income and expenses separately', async () => {
      await service.getContext('user-1');

      const calls = prismaMock.transaction.aggregate.mock.calls;
      expect(calls).toHaveLength(2);

      expect(calls[0][0].where).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          type: 'INCOME',
          currency: 'IDR',
        }),
      );

      expect(calls[1][0].where).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          type: 'EXPENSE',
          currency: 'IDR',
        }),
      );
    });

    it('should exclude deleted and inactive transactions from aggregates', async () => {
      await service.getContext('user-1');

      for (const [args] of prismaMock.transaction.aggregate.mock.calls) {
        expect(args.where).toEqual(
          expect.objectContaining({
            userId: 'user-1',
            deletedAt: null,
            status: 'ACTIVE',
          }),
        );
      }
    });

    it('should scope recent transactions to the authenticated user', async () => {
      await service.getContext('user-123');

      const query = getRecentTransactionQuery();

      expect(query).toBeDefined();
      expect(query?.[0].where).toEqual(
        expect.objectContaining({
          userId: 'user-123',
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
        }),
      );
    });

    it('should limit recent transactions to ten records', async () => {
      await service.getContext('user-1');

      expect(getRecentTransactionQuery()?.[0]).toEqual(
        expect.objectContaining({
          take: 10,
          orderBy: { transactionDate: 'desc' },
        }),
      );
    });

    it('should include the expected top-level response properties', async () => {
      const result = await service.getContext('user-1');

      expect(result).toEqual(
        expect.objectContaining({
          currency: expect.any(String),
          timezone: expect.any(String),
          period: expect.objectContaining({
            start: expect.any(Date),
            end: expect.any(Date),
          }),
          summary: expect.any(Object),
          expensesByCategory: expect.any(Array),
          recentTransactions: expect.any(Array),
          budgets: expect.any(Array),
        }),
      );
    });

    it('should propagate database errors', async () => {
      prismaMock.transaction.aggregate.mockRejectedValueOnce(
        new Error('Database unavailable'),
      );

      await expect(service.getContext('user-1')).rejects.toThrow(
        'Database unavailable',
      );
    });
  });

  describe('budget query optimization', () => {
    it('should fetch budget spending transactions in a single batch query', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        makeBudget({ id: 'budget-1' }),
        makeBudget({
          id: 'budget-2',
          name: 'Budget Transportasi',
          categoryId: 'category-2',
        }),
      ]);

      await service.getContext('user-1');

      expect(
        prismaMock.transaction.findMany.mock.calls.filter(([args]) =>
          isBudgetTransactionQuery(args),
        ),
      ).toHaveLength(1);
    });

    it('should not issue a budget spending query when there are no budgets', async () => {
      await service.getContext('user-1');

      expect(getBudgetTransactionQuery()).toBeUndefined();
    });

    it('should filter the batch query by user, currency, status and expense type', async () => {
      prismaMock.budget.findMany.mockResolvedValue([makeBudget()]);

      await service.getContext('user-1');

      expect(getBudgetTransactions()?.where).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          deletedAt: null,
          status: 'ACTIVE',
          type: 'EXPENSE',
          currency: 'IDR',
        }),
      );
    });

    it('should select only fields needed for budget calculations', async () => {
      prismaMock.budget.findMany.mockResolvedValue([makeBudget()]);

      await service.getContext('user-1');

      expect(getBudgetTransactions()?.select).toEqual({
        transactionDate: true,
        amount: true,
        categoryId: true,
      });
    });

    it('should batch transactions across the union of budget date ranges', async () => {
      const now = new Date();
      const earlierStart = new Date(now);
      earlierStart.setUTCDate(earlierStart.getUTCDate() - 60);

      const laterStart = new Date(now);
      laterStart.setUTCDate(laterStart.getUTCDate() - 30);

      prismaMock.budget.findMany.mockResolvedValue([
        makeBudget({
          id: 'budget-1',
          period: 'CUSTOM',
          startDate: earlierStart,
          endDate: null,
        }),
        makeBudget({
          id: 'budget-2',
          period: 'CUSTOM',
          startDate: laterStart,
          endDate: null,
        }),
      ]);

      await service.getContext('user-1');

      const query = getBudgetTransactions();

      expect(query).toBeDefined();
      expect(query?.where.transactionDate.gte).toBeInstanceOf(Date);
      expect(query?.where.transactionDate.lt).toBeInstanceOf(Date);
      expect(query!.where.transactionDate.gte.getTime()).toBeLessThanOrEqual(
        earlierStart.getTime(),
      );
      expect(query!.where.transactionDate.lt.getTime()).toBeLessThanOrEqual(
        Date.now() + 5_000,
      );
    });
  });

  describe('budget period calculations', () => {
    const runWithBudget = async (overrides: Record<string, unknown>) => {
      prismaMock.budget.findMany.mockResolvedValue([makeBudget(overrides)]);
      return service.getContext('user-1');
    };

    it.each(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const)(
      'should calculate a %s budget range',
      async (period) => {
        await runWithBudget({ period });

        const query = getBudgetTransactions();

        expect(query).toBeDefined();
        expect(query?.where.transactionDate.gte).toBeInstanceOf(Date);
        expect(query?.where.transactionDate.lt).toBeInstanceOf(Date);
      },
    );

    it('should calculate a CUSTOM budget range', async () => {
      await runWithBudget({
        period: 'CUSTOM',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-31T00:00:00.000Z'),
      });

      const query = getBudgetTransactions();

      expect(query).toBeDefined();
      expect(query?.where.transactionDate.gte).toBeInstanceOf(Date);
      expect(query?.where.transactionDate.lt).toBeInstanceOf(Date);
    });

    it('should clamp the budget range to the configured start date', async () => {
      const configuredStart = new Date('2026-10-10T00:00:00.000Z');

      await runWithBudget({
        period: 'MONTHLY',
        startDate: configuredStart,
      });

      expect(
        getBudgetTransactions()!.where.transactionDate.gte.getTime(),
      ).toBeGreaterThanOrEqual(configuredStart.getTime());
    });

    it('should clamp the budget range to the configured end date', async () => {
      const configuredEnd = new Date('2026-10-20T00:00:00.000Z');

      await runWithBudget({
        period: 'CUSTOM',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: configuredEnd,
      });

      expect(
        getBudgetTransactions()!.where.transactionDate.lt.getTime(),
      ).toBeLessThanOrEqual(configuredEnd.getTime());
    });

    it('should skip the batch query when all budget ranges are invalid', async () => {
      await runWithBudget({
        period: 'CUSTOM',
        startDate: new Date('2026-10-20T00:00:00.000Z'),
        endDate: new Date('2026-10-01T00:00:00.000Z'),
      });

      expect(getBudgetTransactionQuery()).toBeUndefined();
    });
  });

  describe('financial precision', () => {
    it('should preserve decimal precision in income, expense and balance', async () => {
      prismaMock.transaction.aggregate
        .mockResolvedValueOnce({
          _sum: { amount: decimal('100.25') },
          _count: { _all: 1 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: decimal('30.10') },
          _count: { _all: 2 },
        });

      const result = await service.getContext('user-1');

      expect(result.summary.income).toBe('100.25');
      expect(result.summary.expense).toBe('30.10');
      expect(result.summary.balance).toBe('70.15');
    });

    it('should calculate category totals without floating-point errors', async () => {
      mockFindManyResults({
        categoryExpenses: [
          { amount: decimal('0.10'), category: { name: 'Food' } },
          { amount: decimal('0.20'), category: { name: 'Food' } },
        ],
      });

      const result = await service.getContext('user-1');

      expect(result.expensesByCategory).toContainEqual({
        category: 'Food',
        amount: '0.30',
      });
    });

    it('should calculate remaining budget accurately with decimal amounts', async () => {
      const transactionDate = new Date('2026-10-20T00:00:00.000Z');

      prismaMock.budget.findMany.mockResolvedValue([
        makeBudget({
          amount: decimal('1.00'),
          period: 'CUSTOM',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: null,
          categoryId: 'category-1',
        }),
      ]);

      mockFindManyResults({
        budgetTransactions: [
          {
            transactionDate,
            amount: decimal('0.30'),
            categoryId: 'category-1',
          },
          {
            transactionDate,
            amount: decimal('0.50'),
            categoryId: 'category-2',
          },
        ],
      });

      const result = await service.getContext('user-1');

      expect(result.budgets[0]).toEqual(
        expect.objectContaining({
          limit: '1.00',
          spent: '0.30',
          remaining: '0.70',
          usagePercentage: 30,
        }),
      );
    });

    it('should return zero values when aggregate amounts are null', async () => {
      prismaMock.transaction.aggregate
        .mockResolvedValueOnce({
          _sum: { amount: null },
          _count: { _all: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: null },
          _count: { _all: 0 },
        });

      const result = await service.getContext('user-1');

      expect(result.summary.income).toBe('0.00');
      expect(result.summary.expense).toBe('0.00');
      expect(result.summary.balance).toBe('0.00');
    });

    it('should preserve the monetary string format for zero', async () => {
      const result = await service.getContext('user-1');

      expect(result.summary.income).toBe('0.00');
      expect(result.summary.expense).toBe('0.00');
      expect(result.summary.balance).toBe('0.00');
    });
  });

  describe('financial data integrity', () => {
    it('should apply currency filtering to the budget batch query', async () => {
      prismaMock.userPreference.findUnique.mockResolvedValue({
        currency: 'IDR',
        timezone: 'Asia/Jakarta',
      });

      prismaMock.budget.findMany.mockResolvedValue([
        makeBudget({ currency: 'IDR' }),
      ]);

      await service.getContext('user-1');

      expect(getBudgetTransactions()?.where.currency).toBe('IDR');
    });

    it('should apply category matching while calculating budget spending', async () => {
      const transactionDate = new Date('2026-10-20T00:00:00.000Z');

      prismaMock.budget.findMany.mockResolvedValue([
        makeBudget({
          amount: decimal('100.00'),
          period: 'CUSTOM',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: null,
          categoryId: 'category-1',
        }),
      ]);

      mockFindManyResults({
        budgetTransactions: [
          {
            transactionDate,
            amount: decimal('20.00'),
            categoryId: 'category-1',
          },
          {
            transactionDate,
            amount: decimal('50.00'),
            categoryId: 'category-2',
          },
        ],
      });

      const result = await service.getContext('user-1');

      expect(result.budgets[0].spent).toBe('20.00');
      expect(result.budgets[0].remaining).toBe('80.00');
    });

    it('should group transactions with missing category names as Uncategorized', async () => {
      mockFindManyResults({
        categoryExpenses: [{ amount: decimal('12.50'), category: null }],
      });

      const result = await service.getContext('user-1');

      expect(result.expensesByCategory).toContainEqual({
        category: 'Uncategorized',
        amount: '12.50',
      });
    });

    it('should handle null category and description in recent transactions', async () => {
      mockFindManyResults({
        recentTransactions: [
          {
            id: 'transaction-1',
            type: 'EXPENSE',
            amount: decimal('10.00'),
            currency: 'IDR',
            description: null,
            transactionDate: new Date('2026-10-10T00:00:00.000Z'),
            category: null,
            account: null,
          },
        ],
      });

      const result = await service.getContext('user-1');

      expect(result.recentTransactions[0]).toEqual(
        expect.objectContaining({
          id: 'transaction-1',
          description: null,
          category: null,
          account: null,
          amount: '10.00',
        }),
      );
    });

    it('should exclude transfers from income and expense aggregation', async () => {
      await service.getContext('user-1');

      for (const [args] of prismaMock.transaction.aggregate.mock.calls) {
        expect(args.where.type).not.toBe('TRANSFER');
      }
    });

    it('should constrain monthly expense category queries to the current month', async () => {
      await service.getContext('user-1');

      const query = getCategoryExpenseQuery();

      expect(query).toBeDefined();
      expect(query?.[0].where).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          currency: 'IDR',
          transactionDate: expect.objectContaining({
            gte: expect.any(Date),
            lt: expect.any(Date),
          }),
        }),
      );
    });

    it('should propagate budget query errors', async () => {
      prismaMock.budget.findMany.mockRejectedValueOnce(
        new Error('Budget query failed'),
      );

      await expect(service.getContext('user-1')).rejects.toThrow(
        'Budget query failed',
      );
    });
  });
});
