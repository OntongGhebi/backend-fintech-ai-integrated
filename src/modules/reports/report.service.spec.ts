import { ReportService } from './report.service';
import { ReportRepository } from './repositories/report.repository';
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

  let reportRepository: {
    getFinancialReportData: jest.Mock;
  };

  beforeEach(() => {
    reportRepository = {
      getFinancialReportData: jest.fn(),
    };

    service = new ReportService(
      reportRepository as unknown as ReportRepository,
    );
  });

  describe('getFinancialReport', () => {
    it('should build a financial report from report repository data', async () => {
      const reportData = createDashboardAggregationMock();

      reportRepository.getFinancialReportData.mockResolvedValue(reportData);

      const result = await service.getFinancialReport('user-1', {
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T23:59:59.999Z'),
      });

      expect(reportRepository.getFinancialReportData).toHaveBeenCalledTimes(1);

      expect(reportRepository.getFinancialReportData).toHaveBeenCalledWith(
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

      expect(result.summary).toEqual(reportData.summary);

      expect(result.income).toEqual(reportData.income);

      expect(result.expense).toEqual(reportData.expense);

      expect(result.categoryAnalytics).toEqual(reportData.categoryAnalytics);

      expect(result.accountAnalytics).toEqual(reportData.accountAnalytics);

      expect(result.budgetPerformance).toEqual(reportData.budgetPerformance);

      expect(result.recurringPerformance).toEqual(
        reportData.recurringPerformance,
      );

      expect(result.monthlyFinancialSummary).toEqual(
        reportData.monthlyFinancialSummary,
      );

      expect(result.cashFlow).toEqual(reportData.cashFlow);
    });

    it('should forward empty options to the report repository', async () => {
      const reportData = createDashboardAggregationMock();

      reportRepository.getFinancialReportData.mockResolvedValue(reportData);

      const result = await service.getFinancialReport('user-1');

      expect(reportRepository.getFinancialReportData).toHaveBeenCalledWith(
        'user-1',
        {},
      );

      expect(result.reportType).toBe('FINANCIAL');

      expect(result.currency).toBe('IDR');
    });

    it('should propagate report repository errors', async () => {
      const error = new Error('Report data retrieval failed');

      reportRepository.getFinancialReportData.mockRejectedValue(error);

      await expect(service.getFinancialReport('user-1')).rejects.toThrow(error);
    });
  });
});
