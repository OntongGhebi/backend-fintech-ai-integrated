import { FinancialWellBeingService } from './financial-well-being.service';
import { FinancialAnalysisService } from './financial-analysis.service';

describe('FinancialWellBeingService', () => {
  let service: FinancialWellBeingService;

  const financialAnalysisServiceMock = {
    getOverview: jest.fn(),
  };

  const prismaMock = {
    budgetRecommendation: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const createOverview = (overrides: Record<string, any> = {}) => ({
    generatedAt: '2026-12-01T00:00:00.000Z',
    currency: 'IDR',
    period: {
      startDate: '2026-12-01T00:00:00.000Z',
      endDate: '2026-12-31T23:59:59.999Z',
    },
    summary: {
      totalIncome: '5000000',
      totalExpense: '3000000',
      netCashFlow: '2000000',
      transactionCount: 12,
      savingsRate: 40,
      expenseToIncomeRatio: 60,
      cashFlowStatus: 'POSITIVE',
    },
    spendingPatterns: {
      totalExpense: '3000000',
      transactionCount: 12,
      topCategories: [],
      topCategoryConcentration: 0,
    },
    budgetHealth: {
      totalAllocation: '4000000',
      totalSpent: '3000000',
      remaining: '1000000',
      utilizationPercentage: 75,
      budgetCount: 2,
      onTrackCount: 2,
      nearLimitCount: 0,
      overBudgetCount: 0,
    },
    trends: {
      monthly: [],
      income: {
        direction: 'UNCHANGED',
        previousPeriod: null,
        currentPeriod: null,
        previousAmount: null,
        currentAmount: null,
        changeAmount: null,
        changePercentage: null,
      },
      expense: {
        direction: 'UNCHANGED',
        previousPeriod: null,
        currentPeriod: null,
        previousAmount: null,
        currentAmount: null,
        changeAmount: null,
        changePercentage: null,
      },
      netCashFlow: {
        direction: 'UNCHANGED',
        previousPeriod: null,
        currentPeriod: null,
        previousAmount: null,
        currentAmount: null,
        changeAmount: null,
        changePercentage: null,
      },
    },
    signals: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    service = new FinancialWellBeingService(
      prismaMock as any,
      financialAnalysisServiceMock as unknown as FinancialAnalysisService,
    );

    financialAnalysisServiceMock.getOverview.mockResolvedValue(
      createOverview(),
    );

    prismaMock.budgetRecommendation.groupBy.mockResolvedValue([
      {
        status: 'PENDING',
        _count: {
          _all: 2,
        },
      },
      {
        status: 'ACCEPTED',
        _count: {
          _all: 1,
        },
      },
      {
        status: 'APPLIED',
        _count: {
          _all: 1,
        },
      },
    ]);

    prismaMock.budgetRecommendation.findMany.mockResolvedValue([
      {
        id: 'recommendation-1',
        budgetId: 'budget-1',
        targetMonth: new Date('2026-12-01T00:00:00.000Z'),
        currentAllocation: '1000000',
        proposedAllocation: '1200000',
        changeAmount: '200000',
        changePercentage: '20',
        action: 'INCREASE',
        status: 'PENDING',
        reason: 'Pengeluaran aktual konsisten melebihi alokasi.',
        deferredUntil: null,
        createdAt: new Date('2026-11-20T00:00:00.000Z'),
      },
    ]);
  });

  describe('getDashboard', () => {
    it('should combine financial analysis and recommendation lifecycle data', async () => {
      const result = await service.getDashboard('user-1', '2026-12');

      expect(result.period.month).toBe('2026-12');
      expect(result.currency).toBe('IDR');
      expect(result.analysis.summary.totalIncome).toBe('5000000');

      expect(result.recommendations.total).toBe(4);
      expect(result.recommendations.statusCounts).toEqual([
        { status: 'PENDING', count: 2 },
        { status: 'ACCEPTED', count: 1 },
        { status: 'REJECTED', count: 0 },
        { status: 'DEFERRED', count: 0 },
        { status: 'APPLIED', count: 1 },
        { status: 'EVALUATED', count: 0 },
      ]);

      expect(result.recommendations.actionCenter).toHaveLength(1);
      expect(result.recommendations.actionCenter[0]).toEqual(
        expect.objectContaining({
          id: 'recommendation-1',
          budgetId: 'budget-1',
          action: 'INCREASE',
          status: 'PENDING',
          currentAllocation: '1000000',
          proposedAllocation: '1200000',
          changeAmount: '200000',
          changePercentage: '20',
        }),
      );

      expect(result.dataSufficiency.level).toBe('SUFFICIENT');
    });

    it('should use the selected month for the financial analysis period', async () => {
      await service.getDashboard('user-1', '2026-12');

      expect(financialAnalysisServiceMock.getOverview).toHaveBeenCalledWith(
        'user-1',
        {
          startDate: new Date('2026-12-01T00:00:00.000+07:00'),
          endDate: new Date('2026-12-31T16:59:59.999Z'),
        },
      );
    });

    it('should scope recommendation queries to the authenticated user and selected month', async () => {
      await service.getDashboard('user-1', '2026-12');

      expect(prismaMock.budgetRecommendation.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['status'],
          where: {
            userId: 'user-1',
            targetMonth: new Date('2026-12-01T00:00:00.000Z'),
          },
        }),
      );

      expect(prismaMock.budgetRecommendation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            targetMonth: new Date('2026-12-01T00:00:00.000Z'),
            status: {
              in: ['PENDING', 'ACCEPTED', 'DEFERRED'],
            },
          },
          take: 20,
        }),
      );
    });

    it('should return zero counts when no recommendations exist', async () => {
      prismaMock.budgetRecommendation.groupBy.mockResolvedValue([]);
      prismaMock.budgetRecommendation.findMany.mockResolvedValue([]);

      const result = await service.getDashboard('user-1', '2026-12');

      expect(result.recommendations.total).toBe(0);
      expect(result.recommendations.actionCenter).toEqual([]);
      expect(result.recommendations.statusCounts).toHaveLength(6);

      expect(
        result.recommendations.statusCounts.every((item) => item.count === 0),
      ).toBe(true);
    });

    it('should mark data sufficiency as insufficient when there are no transactions and budgets', async () => {
      financialAnalysisServiceMock.getOverview.mockResolvedValue(
        createOverview({
          summary: {
            totalIncome: '0',
            totalExpense: '0',
            netCashFlow: '0',
            transactionCount: 0,
            savingsRate: null,
            expenseToIncomeRatio: null,
            cashFlowStatus: 'NO_INCOME_DATA',
          },
          budgetHealth: {
            totalAllocation: '0',
            totalSpent: '0',
            remaining: '0',
            utilizationPercentage: null,
            budgetCount: 0,
            onTrackCount: 0,
            nearLimitCount: 0,
            overBudgetCount: 0,
          },
        }),
      );

      const result = await service.getDashboard('user-1', '2026-12');

      expect(result.dataSufficiency).toEqual({
        level: 'INSUFFICIENT',
        transactionCount: 0,
        budgetCount: 0,
        messages: expect.arrayContaining([
          expect.stringContaining('Belum terdapat transaksi'),
          expect.stringContaining('Belum ada budget aktif'),
        ]),
      });
    });

    it('should mark data sufficiency as limited when transaction history is sparse', async () => {
      financialAnalysisServiceMock.getOverview.mockResolvedValue(
        createOverview({
          summary: {
            totalIncome: '1000000',
            totalExpense: '500000',
            netCashFlow: '500000',
            transactionCount: 3,
            savingsRate: 50,
            expenseToIncomeRatio: 50,
            cashFlowStatus: 'POSITIVE',
          },
        }),
      );

      const result = await service.getDashboard('user-1', '2026-12');

      expect(result.dataSufficiency.level).toBe('LIMITED');
      expect(result.dataSufficiency.messages).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Jumlah transaksi masih sedikit'),
        ]),
      );
    });

    it('should default to the current Jakarta month when month is omitted', async () => {
      const result = await service.getDashboard('user-1');

      expect(result.period.month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    });

    it('should propagate analysis errors', async () => {
      financialAnalysisServiceMock.getOverview.mockRejectedValueOnce(
        new Error('Financial analysis failed'),
      );

      await expect(service.getDashboard('user-1', '2026-12')).rejects.toThrow(
        'Financial analysis failed',
      );
    });

    it('should propagate recommendation query errors', async () => {
      prismaMock.budgetRecommendation.groupBy.mockRejectedValueOnce(
        new Error('Recommendation query failed'),
      );

      await expect(service.getDashboard('user-1', '2026-12')).rejects.toThrow(
        'Recommendation query failed',
      );
    });
  });
});
