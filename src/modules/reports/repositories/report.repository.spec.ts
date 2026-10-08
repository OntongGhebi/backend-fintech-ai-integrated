import { ReportRepository } from './report.repository';

import { DashboardService } from '../../dashboard/dashboard.service';

import type { DashboardAggregation } from '../../dashboard/types/dashboard.types';

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

describe('ReportRepository', () => {
  let repository: ReportRepository;

  let dashboardService: {
    getDashboardAggregation: jest.Mock;
  };

  beforeEach(() => {
    dashboardService = {
      getDashboardAggregation: jest.fn(),
    };

    repository = new ReportRepository(
      dashboardService as unknown as DashboardService,
    );
  });

  describe('getFinancialReportData', () => {
    it('should retrieve financial report data from dashboard service', async () => {
      const aggregation = createDashboardAggregationMock();

      dashboardService.getDashboardAggregation.mockResolvedValue(aggregation);

      const options = {
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T23:59:59.999Z'),
      };

      const result = await repository.getFinancialReportData('user-1', options);

      expect(dashboardService.getDashboardAggregation).toHaveBeenCalledTimes(1);

      expect(dashboardService.getDashboardAggregation).toHaveBeenCalledWith(
        'user-1',
        options,
      );

      expect(result).toEqual(aggregation);
    });

    it('should forward empty options', async () => {
      const aggregation = createDashboardAggregationMock();

      dashboardService.getDashboardAggregation.mockResolvedValue(aggregation);

      const result = await repository.getFinancialReportData('user-1', {});

      expect(dashboardService.getDashboardAggregation).toHaveBeenCalledWith(
        'user-1',
        {},
      );

      expect(result).toEqual(aggregation);
    });

    it('should propagate dashboard service errors', async () => {
      const error = new Error('Dashboard aggregation failed');

      dashboardService.getDashboardAggregation.mockRejectedValue(error);

      await expect(
        repository.getFinancialReportData('user-1', {}),
      ).rejects.toThrow(error);
    });

    it('should forward all report filters to dashboard aggregation', async () => {
      const aggregation = createDashboardAggregationMock();

      dashboardService.getDashboardAggregation.mockResolvedValue(aggregation);

      const options = {
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T23:59:59.999Z'),
        type: 'EXPENSE' as const,
        accountId: '11111111-1111-4111-8111-111111111111',
        categoryId: '22222222-2222-4222-8222-222222222222',
      };

      const result = await repository.getFinancialReportData('user-1', options);

      expect(dashboardService.getDashboardAggregation).toHaveBeenCalledWith(
        'user-1',
        options,
      );

      expect(result).toEqual(aggregation);
    });
  });
});
