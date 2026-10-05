import { BadRequestException } from '@nestjs/common';

import { DashboardRepository } from './repositories/dashboard.repository';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;

  let dashboardRepository: {
    getFinancialSummary: jest.Mock;
  };

  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    dashboardRepository = {
      getFinancialSummary: jest.fn(),
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
        currency: 'IDR',
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
        currency: 'IDR',
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
          currency: 'IDR',
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
          currency: 'IDR',
        },
      );
    });
  });
});
