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
      prismaMock.userPreference.findUnique.mockResolvedValue({
        currency: 'IDR',
        timezone: 'Asia/Jakarta',
      });

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

    it('should scope transaction queries to the requesting user', async () => {
      await service.getContext('user-1');

      const aggregateCalls = prismaMock.transaction.aggregate.mock.calls;

      expect(aggregateCalls.length).toBeGreaterThanOrEqual(2);

      for (const [args] of aggregateCalls) {
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
        })
        .mockResolvedValueOnce({
          _sum: { amount: { toString: () => '1750000' } },
          _count: { _all: 8 },
        });

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
  });
});
