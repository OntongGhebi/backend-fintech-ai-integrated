import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { AIFinancialContextService } from './ai-financial-context.service';

describe('AIFinancialContextService', () => {
  let service: AIFinancialContextService;

  const prismaMock = {
    userPreference: {
      findUnique: jest.fn(),
    },
    transaction: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    budget: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIFinancialContextService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<AIFinancialContextService>(AIFinancialContextService);

    prismaMock.userPreference.findUnique.mockResolvedValue({
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
    });

    prismaMock.transaction.aggregate.mockResolvedValue({
      _sum: { amount: null },
      _count: { _all: 0 },
    });

    prismaMock.transaction.findMany.mockResolvedValue([]);
    prismaMock.budget.findMany.mockResolvedValue([]);
  });

  describe('getContext', () => {
    it('should return an empty financial summary when the user has no transactions', async () => {
      const result = await service.getContext('user-1');

      expect(result.currency).toBe('IDR');
      expect(result.timezone).toBe('Asia/Jakarta');

      expect(result.summary).toEqual(
        expect.objectContaining({
          totalIncome: '0.00',
          totalExpense: '0.00',
          netCashFlow: '0.00',
          incomeTransactionCount: 0,
          expenseTransactionCount: 0,
        }),
      );

      expect(result.expensesByCategory).toEqual([]);
      expect(result.recentTransactions).toEqual([]);
      expect(result.budgets).toEqual([]);
    });

    it('should use the requesting user preferences', async () => {
      await service.getContext('user-123');

      expect(prismaMock.userPreference.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        select: {
          currency: true,
          timezone: true,
        },
      });
    });

    it('should use default preferences when user preferences do not exist', async () => {
      prismaMock.userPreference.findUnique.mockResolvedValue(null);

      const result = await service.getContext('user-without-preferences');

      expect(result.currency).toBe('IDR');
      expect(result.timezone).toBe('Asia/Jakarta');
    });

    it('should scope transaction and budget queries to the requesting user', async () => {
      await service.getContext('user-1');

      expect(
        prismaMock.transaction.aggregate.mock.calls.length,
      ).toBeGreaterThanOrEqual(2);

      for (const [args] of prismaMock.transaction.aggregate.mock.calls) {
        expect(args.where.userId).toBe('user-1');
        expect(args.where.deletedAt).toBeNull();
        expect(args.where.status).toBe('ACTIVE');
      }

      for (const [args] of prismaMock.transaction.findMany.mock.calls) {
        expect(args.where.userId).toBe('user-1');
        expect(args.where.deletedAt).toBeNull();
        expect(args.where.status).toBe('ACTIVE');
      }

      for (const [args] of prismaMock.budget.findMany.mock.calls) {
        expect(args.where.userId).toBe('user-1');
        expect(args.where.deletedAt).toBeNull();
        expect(args.where.status).toBe('ACTIVE');
      }
    });

    it('should aggregate income and expense separately', async () => {
      prismaMock.transaction.aggregate
        .mockResolvedValueOnce({
          _sum: { amount: { toString: () => '5000000' } },
          _count: { _all: 3 },
        } as never)
        .mockResolvedValueOnce({
          _sum: { amount: { toString: () => '1750000' } },
          _count: { _all: 8 },
        } as never);

      const result = await service.getContext('user-1');

      expect(result.summary.totalIncome).toBe('5000000.00');
      expect(result.summary.totalExpense).toBe('1750000.00');
      expect(result.summary.netCashFlow).toBe('3250000.00');
      expect(result.summary.incomeTransactionCount).toBe(3);
      expect(result.summary.expenseTransactionCount).toBe(8);

      expect(prismaMock.transaction.aggregate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            type: 'INCOME',
          }),
        }),
      );

      expect(prismaMock.transaction.aggregate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            type: 'EXPENSE',
          }),
        }),
      );
    });

    it('should query only the configured currency for summary calculations', async () => {
      await service.getContext('user-1');

      for (const [args] of prismaMock.transaction.aggregate.mock.calls) {
        expect(args.where.currency).toBe('IDR');
      }
    });

    it('should request only a limited number of recent transactions', async () => {
      await service.getContext('user-1');

      const recentTransactionQuery =
        prismaMock.transaction.findMany.mock.calls.find(
          ([args]) => args.take === 10,
        );

      expect(recentTransactionQuery).toBeDefined();

      expect(recentTransactionQuery?.[0]).toEqual(
        expect.objectContaining({
          take: 10,
          orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        }),
      );
    });

    it('should not count transfer transactions as income or expense', async () => {
      await service.getContext('user-1');

      for (const [args] of prismaMock.transaction.aggregate.mock.calls) {
        expect(['INCOME', 'EXPENSE']).toContain(args.where.type);
        expect(args.where.type).not.toBe('TRANSFER');
      }
    });

    it('should return a valid context structure for the AI prompt', async () => {
      const result = await service.getContext('user-1');

      expect(result).toEqual(
        expect.objectContaining({
          generatedAt: expect.any(String),
          currency: expect.any(String),
          timezone: expect.any(String),
          period: expect.objectContaining({
            startDate: expect.any(String),
            endDateExclusive: expect.any(String),
          }),
          summary: expect.objectContaining({
            totalIncome: expect.any(String),
            totalExpense: expect.any(String),
            netCashFlow: expect.any(String),
            incomeTransactionCount: expect.any(Number),
            expenseTransactionCount: expect.any(Number),
          }),
          expensesByCategory: expect.any(Array),
          recentTransactions: expect.any(Array),
          budgets: expect.any(Array),
        }),
      );

      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it('should propagate database errors instead of returning fabricated financial data', async () => {
      prismaMock.transaction.aggregate.mockRejectedValueOnce(
        new Error('Database connection failed'),
      );

      await expect(service.getContext('user-1')).rejects.toThrow(
        'Database connection failed',
      );
    });

    describe('budget period calculations', () => {
      const fixedNow = new Date('2026-10-21T08:00:00.000Z');

      const budgetFixture = (
        period: string,
        startDate: Date,
        endDate: Date | null = null,
      ) => ({
        name: `Budget ${period}`,
        amount: '1000000.00',
        startDate,
        endDate,
        period,
        categoryId: null,
        category: { name: 'Kebutuhan' },
      });

      beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(fixedNow);
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should calculate DAILY budget spending from local midnight to now', async () => {
        prismaMock.budget.findMany.mockResolvedValue([
          budgetFixture('DAILY', new Date('2026-10-01T00:00:00.000Z')),
        ]);

        await service.getContext('user-1');

        const budgetAggregateCall =
          prismaMock.transaction.aggregate.mock.calls[2];

        expect(budgetAggregateCall[0].where.transactionDate).toEqual({
          gte: new Date('2026-10-20T17:00:00.000Z'),
          lt: new Date('2026-10-21T08:00:00.001Z'),
        });
      });

      it('should calculate WEEKLY budget spending from Monday local midnight', async () => {
        prismaMock.budget.findMany.mockResolvedValue([
          budgetFixture('WEEKLY', new Date('2026-10-01T00:00:00.000Z')),
        ]);

        await service.getContext('user-1');

        const budgetAggregateCall =
          prismaMock.transaction.aggregate.mock.calls[2];

        expect(budgetAggregateCall[0].where.transactionDate).toEqual({
          gte: new Date('2026-10-18T17:00:00.000Z'),
          lt: new Date('2026-10-21T08:00:00.001Z'),
        });
      });

      it('should calculate MONTHLY budget spending from the first day of the month', async () => {
        prismaMock.budget.findMany.mockResolvedValue([
          budgetFixture('MONTHLY', new Date('2026-09-01T00:00:00.000Z')),
        ]);

        await service.getContext('user-1');

        const budgetAggregateCall =
          prismaMock.transaction.aggregate.mock.calls[2];

        expect(budgetAggregateCall[0].where.transactionDate).toEqual({
          gte: new Date('2026-09-30T17:00:00.000Z'),
          lt: new Date('2026-10-21T08:00:00.001Z'),
        });
      });

      it('should calculate YEARLY budget spending from January 1 local midnight', async () => {
        prismaMock.budget.findMany.mockResolvedValue([
          budgetFixture('YEARLY', new Date('2025-01-01T00:00:00.000Z')),
        ]);

        await service.getContext('user-1');

        const budgetAggregateCall =
          prismaMock.transaction.aggregate.mock.calls[2];

        expect(budgetAggregateCall[0].where.transactionDate).toEqual({
          gte: new Date('2025-12-31T17:00:00.000Z'),
          lt: new Date('2026-10-21T08:00:00.001Z'),
        });
      });

      it('should use configured startDate and endDate for CUSTOM budgets', async () => {
        prismaMock.budget.findMany.mockResolvedValue([
          budgetFixture(
            'CUSTOM',
            new Date('2026-10-01T00:00:00.000Z'),
            new Date('2026-10-31T17:00:00.000Z'),
          ),
        ]);

        await service.getContext('user-1');

        const budgetAggregateCall =
          prismaMock.transaction.aggregate.mock.calls[2];

        expect(budgetAggregateCall[0].where.transactionDate).toEqual({
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lt: new Date('2026-10-21T08:00:00.001Z'),
        });
      });

      it('should clamp recurring budget calculations to the configured budget startDate', async () => {
        prismaMock.budget.findMany.mockResolvedValue([
          budgetFixture('MONTHLY', new Date('2026-10-10T00:00:00.000Z')),
        ]);

        await service.getContext('user-1');

        const budgetAggregateCall =
          prismaMock.transaction.aggregate.mock.calls[2];

        expect(budgetAggregateCall[0].where.transactionDate.gte).toEqual(
          new Date('2026-10-10T00:00:00.000Z'),
        );
      });

      it('should clamp spending to the configured budget endDate', async () => {
        prismaMock.budget.findMany.mockResolvedValue([
          budgetFixture(
            'MONTHLY',
            new Date('2026-10-01T00:00:00.000Z'),
            new Date('2026-10-15T00:00:00.000Z'),
          ),
        ]);

        await service.getContext('user-1');

        const budgetAggregateCall =
          prismaMock.transaction.aggregate.mock.calls[2];

        expect(budgetAggregateCall[0].where.transactionDate.lt).toEqual(
          new Date('2026-10-15T00:00:00.000Z'),
        );
      });

      it('should not query spending for an empty budget period', async () => {
        prismaMock.budget.findMany.mockResolvedValue([
          budgetFixture(
            'CUSTOM',
            new Date('2026-10-22T00:00:00.000Z'),
            new Date('2026-10-25T00:00:00.000Z'),
          ),
        ]);

        await service.getContext('user-1');

        expect(prismaMock.transaction.aggregate).toHaveBeenCalledTimes(2);
      });
    });

    describe('financial amount precision', () => {
      const decimal = (value: string) => ({
        toString: () => value,
      });

      it('should preserve decimal precision in income, expense, and net cash flow', async () => {
        prismaMock.transaction.aggregate
          .mockResolvedValueOnce({
            _sum: { amount: decimal('0.30') },
            _count: { _all: 2 },
          } as never)
          .mockResolvedValueOnce({
            _sum: { amount: decimal('0.10') },
            _count: { _all: 2 },
          } as never);

        const result = await service.getContext('user-1');

        expect(result.summary.totalIncome).toBe('0.30');
        expect(result.summary.totalExpense).toBe('0.10');
        expect(result.summary.netCashFlow).toBe('0.20');
      });

      it('should preserve cents when aggregating expenses by category', async () => {
        prismaMock.transaction.findMany
          .mockResolvedValueOnce([
            {
              amount: decimal('0.10'),
              category: { name: 'Makanan' },
            },
            {
              amount: decimal('0.20'),
              category: { name: 'Makanan' },
            },
            {
              amount: decimal('0.30'),
              category: { name: 'Transportasi' },
            },
          ] as never)
          .mockResolvedValueOnce([] as never);

        const result = await service.getContext('user-1');

        expect(result.expensesByCategory).toHaveLength(2);

        expect(result.expensesByCategory).toEqual(
          expect.arrayContaining([
            {
              category: 'Makanan',
              amount: '0.30',
              transactionCount: 2,
            },
            {
              category: 'Transportasi',
              amount: '0.30',
              transactionCount: 1,
            },
          ]),
        );
      });

      it('should calculate remaining budget accurately with decimal amounts', async () => {
        prismaMock.budget.findMany.mockResolvedValue([
          {
            name: 'Budget Makanan',
            amount: decimal('1.00'),
            startDate: new Date('2026-10-01T00:00:00.000Z'),
            endDate: null,
            period: 'MONTHLY',
            categoryId: 'category-1',
            category: { name: 'Makanan' },
          },
        ] as never);

        prismaMock.transaction.aggregate
          .mockResolvedValueOnce({
            _sum: { amount: decimal('0.30') },
            _count: { _all: 1 },
          } as never)
          .mockResolvedValueOnce({
            _sum: { amount: decimal('0.10') },
            _count: { _all: 1 },
          } as never)
          .mockResolvedValueOnce({
            _sum: { amount: decimal('0.30') },
            _count: { _all: 2 },
          } as never);

        const result = await service.getContext('user-1');

        expect(result.budgets).toHaveLength(1);

        expect(result.budgets[0]).toMatchObject({
          name: 'Budget Makanan',
          limit: '1.00',
          spent: '0.30',
          remaining: '0.70',
          usagePercentage: 30,
          currency: 'IDR',
        });
      });

      it('should return zero values when aggregate amounts are null', async () => {
        const result = await service.getContext('user-1');

        expect(result.summary.totalIncome).toBe('0.00');
        expect(result.summary.totalExpense).toBe('0.00');
        expect(result.summary.netCashFlow).toBe('0.00');
      });

      it('should return monetary values as strings with two decimal places', async () => {
        prismaMock.transaction.aggregate
          .mockResolvedValueOnce({
            _sum: { amount: decimal('1234567.89') },
            _count: { _all: 1 },
          } as never)
          .mockResolvedValueOnce({
            _sum: { amount: decimal('234567.89') },
            _count: { _all: 1 },
          } as never);

        const result = await service.getContext('user-1');

        expect(result.summary.totalIncome).toBe('1234567.89');
        expect(result.summary.totalExpense).toBe('234567.89');
        expect(result.summary.netCashFlow).toBe('1000000.00');

        expect(typeof result.summary.totalIncome).toBe('string');
        expect(typeof result.summary.totalExpense).toBe('string');
        expect(typeof result.summary.netCashFlow).toBe('string');
      });
    });
  });
});
