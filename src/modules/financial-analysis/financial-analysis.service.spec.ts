import { Test, TestingModule } from '@nestjs/testing';

import { DashboardService } from '../dashboard/dashboard.service';
import { DashboardAggregation } from '../dashboard/types/dashboard.types';

import { FinancialAnalysisService } from './financial-analysis.service';

describe('FinancialAnalysisService', () => {
  let service: FinancialAnalysisService;

  const dashboardServiceMock = {
    getDashboardAggregation: jest.fn(),
  };

  const createAggregation = (
    overrides: Partial<DashboardAggregation> = {},
  ): DashboardAggregation => {
    const base: DashboardAggregation = {
      currency: 'IDR',
      totalCurrentBalance: '5000000.00',

      summary: {
        currency: 'IDR',
        totalIncome: '5000000.00',
        totalExpense: '3000000.00',
        netCashFlow: '2000000.00',
        transactionCount: 12,
      },

      income: {
        currency: 'IDR',
        totalIncome: '5000000.00',
        transactionCount: 3,
        averageIncome: '1666666.67',
      },

      expense: {
        currency: 'IDR',
        totalExpense: '3000000.00',
        transactionCount: 9,
        averageExpense: '333333.33',
      },

      categoryAnalytics: {
        currency: 'IDR',
        type: 'EXPENSE',
        totalAmount: '3000000.00',
        transactionCount: 9,
        categories: [
          {
            categoryId: 'food-category',
            categoryName: 'Food',
            totalAmount: '1800000.00',
            transactionCount: 5,
            percentage: '60',
          },
          {
            categoryId: 'transport-category',
            categoryName: 'Transport',
            totalAmount: '1200000.00',
            transactionCount: 4,
            percentage: '40',
          },
        ],
      },

      accountAnalytics: {
        currency: 'IDR',
        type: 'EXPENSE',
        totalAmount: '3000000.00',
        transactionCount: 9,
        accounts: [],
      },

      budgetPerformance: {
        currency: 'IDR',
        totalBudgetAmount: '4000000.00',
        totalActualAmount: '3000000.00',
        totalRemainingAmount: '1000000.00',
        budgets: [
          {
            budgetId: 'budget-1',
            budgetName: 'Food Budget',
            categoryId: 'food-category',
            categoryName: 'Food',
            budgetAmount: '1500000.00',
            actualAmount: '1800000.00',
            remainingAmount: '-300000.00',
            usagePercentage: '120',
            transactionCount: 5,
            status: 'OVER_BUDGET',
          },
          {
            budgetId: 'budget-2',
            budgetName: 'Transport Budget',
            categoryId: 'transport-category',
            categoryName: 'Transport',
            budgetAmount: '2500000.00',
            actualAmount: '1200000.00',
            remainingAmount: '1300000.00',
            usagePercentage: '48',
            transactionCount: 4,
            status: 'ON_TRACK',
          },
        ],
      },

      recurringPerformance: {
        currency: 'IDR',
        recurringTransactions: [],
        totalExpectedAmount: '0',
        totalExecutedAmount: '0',
        totalExpectedOccurrences: 0,
        totalExecutedOccurrences: 0,
        totalMissedOccurrences: 0,
      },

      monthlyFinancialSummary: {
        currency: 'IDR',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-11-30T23:59:59.999Z',
        totalIncome: '5000000.00',
        totalExpense: '3000000.00',
        totalNetCashFlow: '2000000.00',
        totalTransactionCount: 12,
        averageMonthlyIncome: '2500000.00',
        averageMonthlyExpense: '1500000.00',
        months: [
          {
            month: '2026-10',
            income: '2000000.00',
            expense: '1000000.00',
            netCashFlow: '1000000.00',
            transactionCount: 5,
            savingsRate: '50',
          },
          {
            month: '2026-11',
            income: '3000000.00',
            expense: '2000000.00',
            netCashFlow: '1000000.00',
            transactionCount: 7,
            savingsRate: '33.33',
          },
        ],
      },

      cashFlow: {
        currency: 'IDR',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-11-30T23:59:59.999Z',
        period: 'MONTH',
        totalIncome: '5000000.00',
        totalExpense: '3000000.00',
        totalNetCashFlow: '2000000.00',
        totalTransactionCount: 12,
        cashFlows: [],
      },
    };

    return {
      ...base,
      ...overrides,
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialAnalysisService,
        {
          provide: DashboardService,
          useValue: dashboardServiceMock,
        },
      ],
    }).compile();

    service = module.get(FinancialAnalysisService);
  });

  describe('getOverview', () => {
    it('should request dashboard aggregation for the authenticated user', async () => {
      dashboardServiceMock.getDashboardAggregation.mockResolvedValue(
        createAggregation(),
      );

      const startDate = new Date('2026-10-01T00:00:00.000Z');
      const endDate = new Date('2026-11-30T16:59:59.999Z');

      await service.getOverview('user-1', {
        startDate,
        endDate,
      });

      expect(dashboardServiceMock.getDashboardAggregation).toHaveBeenCalledWith(
        'user-1',
        {
          startDate,
          endDate,
        },
      );
    });

    it('should return the deterministic financial analysis overview', async () => {
      dashboardServiceMock.getDashboardAggregation.mockResolvedValue(
        createAggregation(),
      );

      const result = await service.getOverview('user-1');

      expect(result.currency).toBe('IDR');

      expect(result.summary).toEqual(
        expect.objectContaining({
          totalIncome: '5000000',
          totalExpense: '3000000',
          netCashFlow: '2000000',
          transactionCount: 12,
          savingsRate: 40,
          expenseToIncomeRatio: 60,
          cashFlowStatus: 'POSITIVE',
        }),
      );

      expect(result.period).toEqual({
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-11-30T23:59:59.999Z',
      });
    });
  });

  describe('buildOverview', () => {
    it('should calculate budget utilization and budget status counts', () => {
      const result = service.buildOverview(createAggregation());

      expect(result.budgetHealth).toEqual(
        expect.objectContaining({
          totalAllocation: '4000000',
          totalSpent: '3000000',
          remaining: '1000000.00',
          utilizationPercentage: 75,
          budgetCount: 2,
          onTrackCount: 1,
          nearLimitCount: 0,
          overBudgetCount: 1,
        }),
      );
    });

    it('should sort spending categories by amount descending', () => {
      const result = service.buildOverview(createAggregation());

      expect(result.spendingPatterns.topCategories[0]).toEqual(
        expect.objectContaining({
          categoryId: 'food-category',
          categoryName: 'Food',
          totalAmount: '1800000.00',
          transactionCount: 5,
          percentage: 60,
        }),
      );

      expect(result.spendingPatterns.topCategoryConcentration).toBe(60);
    });

    it('should calculate monthly income, expense, and cash flow trends', () => {
      const result = service.buildOverview(createAggregation());

      expect(result.trends.income).toEqual(
        expect.objectContaining({
          direction: 'INCREASED',
          previousPeriod: '2026-10',
          currentPeriod: '2026-11',
          previousAmount: '2000000',
          currentAmount: '3000000',
          changeAmount: '1000000',
          changePercentage: 50,
        }),
      );

      expect(result.trends.expense).toEqual(
        expect.objectContaining({
          direction: 'INCREASED',
          changePercentage: 100,
        }),
      );

      expect(result.trends.netCashFlow.direction).toBe('UNCHANGED');
    });

    it('should generate financial signals from backend-calculated facts', () => {
      const result = service.buildOverview(createAggregation());

      expect(result.signals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'BUDGET_OVER_BUDGET',
            severity: 'WARNING',
          }),
          expect.objectContaining({
            code: 'HIGH_SPENDING_CONCENTRATION',
            severity: 'INFO',
          }),
        ]),
      );
    });

    it('should return null ratios when there is no income', () => {
      const aggregation = createAggregation({
        summary: {
          currency: 'IDR',
          totalIncome: '0',
          totalExpense: '100000',
          netCashFlow: '-100000',
          transactionCount: 2,
        },
        income: {
          currency: 'IDR',
          totalIncome: '0',
          transactionCount: 0,
          averageIncome: '0',
        },
      });

      const result = service.buildOverview(aggregation);

      expect(result.summary.savingsRate).toBeNull();
      expect(result.summary.expenseToIncomeRatio).toBeNull();
      expect(result.summary.cashFlowStatus).toBe('NO_INCOME_DATA');

      expect(result.signals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'NO_INCOME_DATA',
          }),
        ]),
      );
    });

    it('should identify negative cash flow', () => {
      const aggregation = createAggregation({
        summary: {
          currency: 'IDR',
          totalIncome: '1000000',
          totalExpense: '1500000',
          netCashFlow: '-500000',
          transactionCount: 5,
        },
      });

      const result = service.buildOverview(aggregation);

      expect(result.summary.cashFlowStatus).toBe('NEGATIVE');

      expect(result.signals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'NEGATIVE_CASH_FLOW',
            severity: 'WARNING',
          }),
        ]),
      );
    });

    it('should return insufficient trend data when fewer than two months exist', () => {
      const aggregation = createAggregation({
        monthlyFinancialSummary: {
          currency: 'IDR',
          startDate: '2026-11-01T00:00:00.000Z',
          endDate: '2026-11-30T23:59:59.999Z',
          totalIncome: '1000000',
          totalExpense: '500000',
          totalNetCashFlow: '500000',
          totalTransactionCount: 2,
          averageMonthlyIncome: '1000000',
          averageMonthlyExpense: '500000',
          months: [
            {
              month: '2026-11',
              income: '1000000',
              expense: '500000',
              netCashFlow: '500000',
              transactionCount: 2,
              savingsRate: '50',
            },
          ],
        },
      });

      const result = service.buildOverview(aggregation);

      expect(result.trends.income.direction).toBe('INSUFFICIENT_DATA');
      expect(result.trends.expense.direction).toBe('INSUFFICIENT_DATA');
      expect(result.trends.netCashFlow.direction).toBe('INSUFFICIENT_DATA');
    });

    it('should not produce a concentration signal without spending categories', () => {
      const aggregation = createAggregation({
        categoryAnalytics: {
          currency: 'IDR',
          type: 'EXPENSE',
          totalAmount: '0',
          transactionCount: 0,
          categories: [],
        },
      });

      const result = service.buildOverview(aggregation);

      expect(result.spendingPatterns.topCategoryConcentration).toBe(0);

      expect(result.signals).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'HIGH_SPENDING_CONCENTRATION',
          }),
        ]),
      );
    });
  });
});
