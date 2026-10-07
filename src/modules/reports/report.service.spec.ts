import { ReportService } from './report.service';

import { DashboardService } from '../dashboard/dashboard.service';

import type { DashboardAggregation } from '../dashboard/types/dashboard.types';

const createDashboardAggregationMock = (): DashboardAggregation => ({
  currency: 'IDR',

  summary: {
    currency: 'IDR',
    totalIncome: '5000000',
    totalExpense: '2000000',
    netCashFlow: '3000000',
    transactionCount: 10,
  },

  income: {
    currency: 'IDR',
    totalIncome: '5000000',
    transactionCount: 3,
    averageIncome: '1666666.6666666666666667',
  },

  expense: {
    currency: 'IDR',
    totalExpense: '2000000',
    transactionCount: 7,
    averageExpense: '285714.28571428571428571',
  },

  categoryAnalytics: {
    currency: 'IDR',
    type: 'EXPENSE',
    categories: [],
    totalAmount: '2000000',
    transactionCount: 7,
  },

  accountAnalytics: {
    currency: 'IDR',
    type: 'EXPENSE',
    accounts: [],
    totalAmount: '2000000',
    transactionCount: 7,
  },

  budgetPerformance: {
    currency: 'IDR',
    budgets: [],
    totalBudgetAmount: '0',
    totalActualAmount: '0',
    totalRemainingAmount: '0',
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

    startDate: '2026-01-01T00:00:00.000Z',

    endDate: '2026-09-30T23:59:59.999Z',

    months: [],

    totalIncome: '5000000',
    totalExpense: '2000000',
    totalNetCashFlow: '3000000',
    totalTransactionCount: 10,

    averageMonthlyIncome: '555555.55555555555555556',

    averageMonthlyExpense: '222222.22222222222222222',
  },

  cashFlow: {
    currency: 'IDR',

    startDate: '2026-01-01T00:00:00.000Z',

    endDate: '2026-09-30T23:59:59.999Z',

    period: 'MONTH',

    cashFlows: [],

    totalIncome: '5000000',
    totalExpense: '2000000',
    totalNetCashFlow: '3000000',
    totalTransactionCount: 10,
  },
});

describe('ReportService', () => {
  let service: ReportService;

  let dashboardService: {
    getDashboardAggregation: jest.Mock;
  };

  beforeEach(() => {
    dashboardService = {
      getDashboardAggregation: jest.fn(),
    };

    service = new ReportService(
      dashboardService as unknown as DashboardService,
    );
  });

  describe('getFinancialReport', () => {
    it('should build a financial report from the dashboard aggregation', async () => {
      const dashboard = createDashboardAggregationMock();

      dashboardService.getDashboardAggregation.mockResolvedValue(dashboard);

      const result = await service.getFinancialReport('user-1', {
        startDate: new Date('2026-01-01T00:00:00.000Z'),

        endDate: new Date('2026-09-30T23:59:59.999Z'),
      });

      expect(dashboardService.getDashboardAggregation).toHaveBeenCalledTimes(1);

      expect(dashboardService.getDashboardAggregation).toHaveBeenCalledWith(
        'user-1',
        {
          startDate: new Date('2026-01-01T00:00:00.000Z'),

          endDate: new Date('2026-09-30T23:59:59.999Z'),
        },
      );

      expect(result.reportType).toBe('FINANCIAL');

      expect(result.currency).toBe('IDR');

      expect(result.startDate).toBe('2026-01-01T00:00:00.000Z');

      expect(result.endDate).toBe('2026-09-30T23:59:59.999Z');

      expect(result.generatedAt).toBeInstanceOf(Date);

      expect(result.summary).toEqual(dashboard.summary);

      expect(result.income).toEqual(dashboard.income);

      expect(result.expense).toEqual(dashboard.expense);

      expect(result.categoryAnalytics).toEqual(dashboard.categoryAnalytics);

      expect(result.accountAnalytics).toEqual(dashboard.accountAnalytics);

      expect(result.budgetPerformance).toEqual(dashboard.budgetPerformance);

      expect(result.recurringPerformance).toEqual(
        dashboard.recurringPerformance,
      );

      expect(result.monthlyFinancialSummary).toEqual(
        dashboard.monthlyFinancialSummary,
      );

      expect(result.cashFlow).toEqual(dashboard.cashFlow);
    });

    it('should forward empty options to the dashboard service', async () => {
      const dashboard = createDashboardAggregationMock();

      dashboardService.getDashboardAggregation.mockResolvedValue(dashboard);

      const result = await service.getFinancialReport('user-1');

      expect(dashboardService.getDashboardAggregation).toHaveBeenCalledWith(
        'user-1',
        {},
      );

      expect(result.reportType).toBe('FINANCIAL');

      expect(result.currency).toBe('IDR');
    });

    it('should propagate dashboard service errors', async () => {
      const error = new Error('Dashboard aggregation failed');

      dashboardService.getDashboardAggregation.mockRejectedValue(error);

      await expect(service.getFinancialReport('user-1')).rejects.toThrow(error);
    });
  });
});
