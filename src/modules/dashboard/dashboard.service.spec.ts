import { BadRequestException } from '@nestjs/common';

import { DashboardRepository } from './repositories/dashboard.repository';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;

  let dashboardRepository: {
    getFinancialSummary: jest.Mock;
    getIncomeAnalytics: jest.Mock;
    getExpenseAnalytics: jest.Mock;
  };

  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    dashboardRepository = {
      getFinancialSummary: jest.fn(),
      getIncomeAnalytics: jest.fn(),
      getExpenseAnalytics: jest.fn(),
    };

    service = new DashboardService(
      dashboardRepository as unknown as DashboardRepository,
    );
  });

  describe('getArchitecture', () => {
    it('should return the dashboard architecture contract', () => {
      expect(service.getArchitecture()).toEqual({
        module: 'dashboard',
        sourceOfTruth: 'transactions',
        currency: 'IDR',
        supportsDateRange: true,
      });
    });
  });

  describe('normalizeQuery', () => {
    it('should return an empty normalized query', () => {
      expect(service.normalizeQuery()).toEqual({
        startDate: undefined,
        endDate: undefined,
      });
    });

    it('should preserve the provided date range', () => {
      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      expect(
        service.normalizeQuery({
          startDate,
          endDate,
        }),
      ).toEqual({
        startDate,
        endDate,
      });
    });

    it('should reject an invalid date range', () => {
      const startDate = new Date('2026-09-30T00:00:00.000Z');

      const endDate = new Date('2026-09-01T00:00:00.000Z');

      expect(() =>
        service.normalizeQuery({
          startDate,
          endDate,
        }),
      ).toThrow(
        new BadRequestException(
          'startDate must be earlier than or equal to endDate',
        ),
      );
    });
  });

  describe('getFinancialSummary', () => {
    it('should calculate income, expense, net cash flow, and transaction count', async () => {
      dashboardRepository.getFinancialSummary.mockResolvedValue({
        groupedTransactions: [
          {
            type: 'INCOME',
            _sum: {
              amount: '5000000',
            },
          },
          {
            type: 'EXPENSE',
            _sum: {
              amount: '1750000',
            },
          },
        ],
        transactionCount: 8,
      });

      const result = await service.getFinancialSummary(userId);

      expect(dashboardRepository.getFinancialSummary).toHaveBeenCalledWith(
        userId,
        {
          startDate: undefined,
          endDate: undefined,
        },
      );

      expect(result).toEqual({
        currency: 'IDR',
        totalIncome: '5000000',
        totalExpense: '1750000',
        netCashFlow: '3250000',
        transactionCount: 8,
      });
    });

    it('should return zero values when there are no transactions', async () => {
      dashboardRepository.getFinancialSummary.mockResolvedValue({
        groupedTransactions: [],
        transactionCount: 0,
      });

      const result = await service.getFinancialSummary(userId);

      expect(result).toEqual({
        currency: 'IDR',
        totalIncome: '0',
        totalExpense: '0',
        netCashFlow: '0',
        transactionCount: 0,
      });
    });

    it('should calculate negative net cash flow when expenses exceed income', async () => {
      dashboardRepository.getFinancialSummary.mockResolvedValue({
        groupedTransactions: [
          {
            type: 'INCOME',
            _sum: {
              amount: '1000000',
            },
          },
          {
            type: 'EXPENSE',
            _sum: {
              amount: '1500000',
            },
          },
        ],
        transactionCount: 5,
      });

      const result = await service.getFinancialSummary(userId);

      expect(result).toEqual({
        currency: 'IDR',
        totalIncome: '1000000',
        totalExpense: '1500000',
        netCashFlow: '-500000',
        transactionCount: 5,
      });
    });

    it('should ignore transfer transactions when calculating cash flow', async () => {
      dashboardRepository.getFinancialSummary.mockResolvedValue({
        groupedTransactions: [
          {
            type: 'INCOME',
            _sum: {
              amount: '5000000',
            },
          },
          {
            type: 'EXPENSE',
            _sum: {
              amount: '1000000',
            },
          },
          {
            type: 'TRANSFER',
            _sum: {
              amount: '2000000',
            },
          },
        ],
        transactionCount: 3,
      });

      const result = await service.getFinancialSummary(userId);

      expect(result).toEqual({
        currency: 'IDR',
        totalIncome: '5000000',
        totalExpense: '1000000',
        netCashFlow: '4000000',
        transactionCount: 3,
      });
    });

    it('should forward the date range to the repository', async () => {
      dashboardRepository.getFinancialSummary.mockResolvedValue({
        groupedTransactions: [],
        transactionCount: 0,
      });

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await service.getFinancialSummary(userId, {
        startDate,
        endDate,
      });

      expect(dashboardRepository.getFinancialSummary).toHaveBeenCalledWith(
        userId,
        {
          startDate,
          endDate,
        },
      );
    });
  });

  describe('getIncomeAnalytics', () => {
    it('should calculate total income and average income', async () => {
      dashboardRepository.getIncomeAnalytics.mockResolvedValue({
        totalIncome: '7500000',
        transactionCount: 6,
      });

      const result = await service.getIncomeAnalytics(userId);

      expect(dashboardRepository.getIncomeAnalytics).toHaveBeenCalledWith(
        userId,
        {
          startDate: undefined,
          endDate: undefined,
        },
      );

      expect(result).toEqual({
        currency: 'IDR',
        totalIncome: '7500000',
        transactionCount: 6,
        averageIncome: '1250000',
      });
    });

    it('should return zero average income when there are no income transactions', async () => {
      dashboardRepository.getIncomeAnalytics.mockResolvedValue({
        totalIncome: null,
        transactionCount: 0,
      });

      const result = await service.getIncomeAnalytics(userId);

      expect(result).toEqual({
        currency: 'IDR',
        totalIncome: '0',
        transactionCount: 0,
        averageIncome: '0',
      });
    });

    it('should preserve decimal precision when calculating average income', async () => {
      dashboardRepository.getIncomeAnalytics.mockResolvedValue({
        totalIncome: '1000000.50',
        transactionCount: 4,
      });

      const result = await service.getIncomeAnalytics(userId);

      expect(result).toEqual({
        currency: 'IDR',
        totalIncome: '1000000.50',
        transactionCount: 4,
        averageIncome: '250000.125',
      });
    });

    it('should reject an invalid date range', async () => {
      const startDate = new Date('2026-09-30T00:00:00.000Z');

      const endDate = new Date('2026-09-01T00:00:00.000Z');

      await expect(
        service.getIncomeAnalytics(userId, {
          startDate,
          endDate,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'startDate must be earlier than or equal to endDate',
        ),
      );

      expect(dashboardRepository.getIncomeAnalytics).not.toHaveBeenCalled();
    });
  });
  describe('getExpenseAnalytics', () => {
    it('should calculate total expense and average expense', async () => {
      dashboardRepository.getExpenseAnalytics.mockResolvedValue({
        totalExpense: '3750000',
        transactionCount: 10,
      });

      const result = await service.getExpenseAnalytics(userId);

      expect(dashboardRepository.getExpenseAnalytics).toHaveBeenCalledWith(
        userId,
        {
          startDate: undefined,
          endDate: undefined,
        },
      );

      expect(result).toEqual({
        currency: 'IDR',
        totalExpense: '3750000',
        transactionCount: 10,
        averageExpense: '375000',
      });
    });

    it('should return zero average expense when there are no expense transactions', async () => {
      dashboardRepository.getExpenseAnalytics.mockResolvedValue({
        totalExpense: null,
        transactionCount: 0,
      });

      const result = await service.getExpenseAnalytics(userId);

      expect(result).toEqual({
        currency: 'IDR',
        totalExpense: '0',
        transactionCount: 0,
        averageExpense: '0',
      });
    });

    it('should preserve decimal precision when calculating average expense', async () => {
      dashboardRepository.getExpenseAnalytics.mockResolvedValue({
        totalExpense: '1000000.50',
        transactionCount: 4,
      });

      const result = await service.getExpenseAnalytics(userId);

      expect(result).toEqual({
        currency: 'IDR',
        totalExpense: '1000000.50',
        transactionCount: 4,
        averageExpense: '250000.125',
      });
    });

    it('should forward the date range to the repository', async () => {
      dashboardRepository.getExpenseAnalytics.mockResolvedValue({
        totalExpense: '3000000',
        transactionCount: 3,
      });

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await service.getExpenseAnalytics(userId, {
        startDate,
        endDate,
      });

      expect(dashboardRepository.getExpenseAnalytics).toHaveBeenCalledWith(
        userId,
        {
          startDate,
          endDate,
        },
      );
    });

    it('should reject an invalid date range', async () => {
      const startDate = new Date('2026-09-30T00:00:00.000Z');

      const endDate = new Date('2026-09-01T00:00:00.000Z');

      await expect(
        service.getExpenseAnalytics(userId, {
          startDate,
          endDate,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'startDate must be earlier than or equal to endDate',
        ),
      );

      expect(dashboardRepository.getExpenseAnalytics).not.toHaveBeenCalled();
    });
  });
});
