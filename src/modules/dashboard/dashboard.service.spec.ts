import { BadRequestException } from '@nestjs/common';

import { DashboardRepository } from './repositories/dashboard.repository';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;

  let dashboardRepository: {
    getFinancialSummary: jest.Mock;
    getIncomeAnalytics: jest.Mock;
    getExpenseAnalytics: jest.Mock;
    getCategoryAnalytics: jest.Mock;
    getAccountAnalytics: jest.Mock;
    getBudgetPerformance: jest.Mock;
  };

  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    dashboardRepository = {
      getFinancialSummary: jest.fn(),
      getIncomeAnalytics: jest.fn(),
      getExpenseAnalytics: jest.fn(),
      getCategoryAnalytics: jest.fn(),
      getAccountAnalytics: jest.fn(),
      getBudgetPerformance: jest.fn(),
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

  describe('getCategoryAnalytics', () => {
    it('should calculate category breakdown', async () => {
      dashboardRepository.getCategoryAnalytics.mockResolvedValue({
        groupedCategories: [
          {
            categoryId: '11111111-1111-4111-8111-111111111111',
            _sum: {
              amount: '2500000',
            },
            _count: {
              _all: 8,
            },
          },
          {
            categoryId: '22222222-2222-4222-8222-222222222222',
            _sum: {
              amount: '1500000',
            },
            _count: {
              _all: 5,
            },
          },
        ],
        categories: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Food',
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Transport',
          },
        ],
        totalAmount: '4000000',
        transactionCount: 13,
      });

      const result = await service.getCategoryAnalytics(userId, 'EXPENSE');

      expect(dashboardRepository.getCategoryAnalytics).toHaveBeenCalledWith(
        userId,
        'EXPENSE',
        {
          startDate: undefined,
          endDate: undefined,
        },
      );

      expect(result).toEqual({
        currency: 'IDR',
        type: 'EXPENSE',
        categories: [
          {
            categoryId: '11111111-1111-4111-8111-111111111111',
            categoryName: 'Food',
            totalAmount: '2500000',
            transactionCount: 8,
            percentage: '62.5',
          },
          {
            categoryId: '22222222-2222-4222-8222-222222222222',
            categoryName: 'Transport',
            totalAmount: '1500000',
            transactionCount: 5,
            percentage: '37.5',
          },
        ],
        totalAmount: '4000000',
        transactionCount: 13,
      });
    });

    it('should default to expense analytics', async () => {
      dashboardRepository.getCategoryAnalytics.mockResolvedValue({
        groupedCategories: [],
        categories: [],
        totalAmount: null,
        transactionCount: 0,
      });

      const result = await service.getCategoryAnalytics(userId);

      expect(dashboardRepository.getCategoryAnalytics).toHaveBeenCalledWith(
        userId,
        'EXPENSE',
        {
          startDate: undefined,
          endDate: undefined,
        },
      );

      expect(result).toEqual({
        currency: 'IDR',
        type: 'EXPENSE',
        categories: [],
        totalAmount: '0',
        transactionCount: 0,
      });
    });

    it('should support income category analytics', async () => {
      dashboardRepository.getCategoryAnalytics.mockResolvedValue({
        groupedCategories: [
          {
            categoryId: '11111111-1111-4111-8111-111111111111',
            _sum: {
              amount: '5000000',
            },
            _count: {
              _all: 2,
            },
          },
        ],
        categories: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Salary',
          },
        ],
        totalAmount: '5000000',
        transactionCount: 2,
      });

      const result = await service.getCategoryAnalytics(userId, 'INCOME');

      expect(result).toEqual({
        currency: 'IDR',
        type: 'INCOME',
        categories: [
          {
            categoryId: '11111111-1111-4111-8111-111111111111',
            categoryName: 'Salary',
            totalAmount: '5000000',
            transactionCount: 2,
            percentage: '100',
          },
        ],
        totalAmount: '5000000',
        transactionCount: 2,
      });
    });

    it('should sort categories by total amount descending', async () => {
      dashboardRepository.getCategoryAnalytics.mockResolvedValue({
        groupedCategories: [
          {
            categoryId: '11111111-1111-4111-8111-111111111111',
            _sum: {
              amount: '500000',
            },
            _count: {
              _all: 1,
            },
          },
          {
            categoryId: '22222222-2222-4222-8222-222222222222',
            _sum: {
              amount: '2000000',
            },
            _count: {
              _all: 3,
            },
          },
        ],
        categories: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Small',
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Large',
          },
        ],
        totalAmount: '2500000',
        transactionCount: 4,
      });

      const result = await service.getCategoryAnalytics(userId, 'EXPENSE');

      expect(
        result.categories.map((category) => category.categoryName),
      ).toEqual(['Large', 'Small']);
    });

    it('should reject an invalid transaction type', async () => {
      await expect(
        service.getCategoryAnalytics(
          userId,
          'TRANSFER' as 'INCOME' | 'EXPENSE',
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Category analytics only supports income and expense transactions',
        ),
      );

      expect(dashboardRepository.getCategoryAnalytics).not.toHaveBeenCalled();
    });

    it('should reject an invalid date range', async () => {
      const startDate = new Date('2026-09-30T00:00:00.000Z');

      const endDate = new Date('2026-09-01T00:00:00.000Z');

      await expect(
        service.getCategoryAnalytics(userId, 'EXPENSE', {
          startDate,
          endDate,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'startDate must be earlier than or equal to endDate',
        ),
      );

      expect(dashboardRepository.getCategoryAnalytics).not.toHaveBeenCalled();
    });
  });

  describe('getAccountAnalytics', () => {
    it('should calculate account breakdown', async () => {
      dashboardRepository.getAccountAnalytics.mockResolvedValue({
        groupedAccounts: [
          {
            accountId: '11111111-1111-4111-8111-111111111111',
            _sum: {
              amount: '2500000',
            },
            _count: {
              _all: 8,
            },
          },
          {
            accountId: '22222222-2222-4222-8222-222222222222',
            _sum: {
              amount: '1500000',
            },
            _count: {
              _all: 5,
            },
          },
        ],
        accounts: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'BCA',
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Cash',
          },
        ],
        totalAmount: '4000000',
        transactionCount: 13,
      });

      const result = await service.getAccountAnalytics(userId, 'EXPENSE');

      expect(dashboardRepository.getAccountAnalytics).toHaveBeenCalledWith(
        userId,
        'EXPENSE',
        {
          startDate: undefined,
          endDate: undefined,
        },
      );

      expect(result).toEqual({
        currency: 'IDR',
        type: 'EXPENSE',
        accounts: [
          {
            accountId: '11111111-1111-4111-8111-111111111111',
            accountName: 'BCA',
            totalAmount: '2500000',
            transactionCount: 8,
            percentage: '62.5',
          },
          {
            accountId: '22222222-2222-4222-8222-222222222222',
            accountName: 'Cash',
            totalAmount: '1500000',
            transactionCount: 5,
            percentage: '37.5',
          },
        ],
        totalAmount: '4000000',
        transactionCount: 13,
      });
    });

    it('should default to expense analytics', async () => {
      dashboardRepository.getAccountAnalytics.mockResolvedValue({
        groupedAccounts: [],
        accounts: [],
        totalAmount: null,
        transactionCount: 0,
      });

      const result = await service.getAccountAnalytics(userId);

      expect(dashboardRepository.getAccountAnalytics).toHaveBeenCalledWith(
        userId,
        'EXPENSE',
        {
          startDate: undefined,
          endDate: undefined,
        },
      );

      expect(result).toEqual({
        currency: 'IDR',
        type: 'EXPENSE',
        accounts: [],
        totalAmount: '0',
        transactionCount: 0,
      });
    });

    it('should support income account analytics', async () => {
      dashboardRepository.getAccountAnalytics.mockResolvedValue({
        groupedAccounts: [
          {
            accountId: '11111111-1111-4111-8111-111111111111',
            _sum: {
              amount: '5000000',
            },
            _count: {
              _all: 2,
            },
          },
        ],
        accounts: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'BCA',
          },
        ],
        totalAmount: '5000000',
        transactionCount: 2,
      });

      const result = await service.getAccountAnalytics(userId, 'INCOME');

      expect(result).toEqual({
        currency: 'IDR',
        type: 'INCOME',
        accounts: [
          {
            accountId: '11111111-1111-4111-8111-111111111111',
            accountName: 'BCA',
            totalAmount: '5000000',
            transactionCount: 2,
            percentage: '100',
          },
        ],
        totalAmount: '5000000',
        transactionCount: 2,
      });
    });

    it('should sort accounts by total amount descending', async () => {
      dashboardRepository.getAccountAnalytics.mockResolvedValue({
        groupedAccounts: [
          {
            accountId: '11111111-1111-4111-8111-111111111111',
            _sum: {
              amount: '500000',
            },
            _count: {
              _all: 1,
            },
          },
          {
            accountId: '22222222-2222-4222-8222-222222222222',
            _sum: {
              amount: '2000000',
            },
            _count: {
              _all: 3,
            },
          },
        ],
        accounts: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Cash',
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'BCA',
          },
        ],
        totalAmount: '2500000',
        transactionCount: 4,
      });

      const result = await service.getAccountAnalytics(userId, 'EXPENSE');

      expect(result.accounts.map((account) => account.accountName)).toEqual([
        'BCA',
        'Cash',
      ]);
    });

    it('should reject an invalid transaction type', async () => {
      await expect(
        service.getAccountAnalytics(userId, 'TRANSFER' as 'INCOME' | 'EXPENSE'),
      ).rejects.toThrow(
        new BadRequestException(
          'Account analytics only supports income and expense transactions',
        ),
      );

      expect(dashboardRepository.getAccountAnalytics).not.toHaveBeenCalled();
    });

    it('should reject an invalid date range', async () => {
      const startDate = new Date('2026-09-30T00:00:00.000Z');

      const endDate = new Date('2026-09-01T00:00:00.000Z');

      await expect(
        service.getAccountAnalytics(userId, 'EXPENSE', {
          startDate,
          endDate,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'startDate must be earlier than or equal to endDate',
        ),
      );

      expect(dashboardRepository.getAccountAnalytics).not.toHaveBeenCalled();
    });
  });

  describe('getBudgetPerformance', () => {
    const foodCategoryId = '11111111-1111-4111-8111-111111111111';

    const transportCategoryId = '22222222-2222-4222-8222-222222222222';

    it('should calculate budget performance', async () => {
      dashboardRepository.getBudgetPerformance.mockResolvedValue({
        budgets: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            name: 'Food Budget',
            categoryId: foodCategoryId,
            amount: '3000000',
            category: {
              id: foodCategoryId,
              name: 'Food',
            },
          },
          {
            id: '44444444-4444-4444-8444-444444444444',
            name: 'Transport Budget',
            categoryId: transportCategoryId,
            amount: '2000000',
            category: {
              id: transportCategoryId,
              name: 'Transport',
            },
          },
        ],
        transactions: [
          {
            categoryId: foodCategoryId,
            _sum: {
              amount: '2250000',
            },
            _count: {
              _all: 12,
            },
          },
          {
            categoryId: transportCategoryId,
            _sum: {
              amount: '500000',
            },
            _count: {
              _all: 3,
            },
          },
        ],
      });

      const result = await service.getBudgetPerformance(userId);

      expect(dashboardRepository.getBudgetPerformance).toHaveBeenCalledWith(
        userId,
        {
          startDate: undefined,
          endDate: undefined,
        },
      );

      expect(result).toEqual({
        currency: 'IDR',
        budgets: [
          {
            budgetId: '33333333-3333-4333-8333-333333333333',
            budgetName: 'Food Budget',
            categoryId: foodCategoryId,
            categoryName: 'Food',
            budgetAmount: '3000000',
            actualAmount: '2250000',
            remainingAmount: '750000',
            usagePercentage: '75',
            transactionCount: 12,
            status: 'ON_TRACK',
          },
          {
            budgetId: '44444444-4444-4444-8444-444444444444',
            budgetName: 'Transport Budget',
            categoryId: transportCategoryId,
            categoryName: 'Transport',
            budgetAmount: '2000000',
            actualAmount: '500000',
            remainingAmount: '1500000',
            usagePercentage: '25',
            transactionCount: 3,
            status: 'ON_TRACK',
          },
        ],
        totalBudgetAmount: '5000000',
        totalActualAmount: '2750000',
        totalRemainingAmount: '2250000',
      });
    });

    it('should mark budget as near limit at 80 percent', async () => {
      dashboardRepository.getBudgetPerformance.mockResolvedValue({
        budgets: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            name: 'Food Budget',
            categoryId: foodCategoryId,
            amount: '1000000',
            category: {
              id: foodCategoryId,
              name: 'Food',
            },
          },
        ],
        transactions: [
          {
            categoryId: foodCategoryId,
            _sum: {
              amount: '800000',
            },
            _count: {
              _all: 5,
            },
          },
        ],
      });

      const result = await service.getBudgetPerformance(userId);

      expect(result.budgets[0].usagePercentage).toBe('80');

      expect(result.budgets[0].status).toBe('NEAR_LIMIT');
    });

    it('should mark budget as over budget when usage exceeds 100 percent', async () => {
      dashboardRepository.getBudgetPerformance.mockResolvedValue({
        budgets: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            name: 'Food Budget',
            categoryId: foodCategoryId,
            amount: '1000000',
            category: {
              id: foodCategoryId,
              name: 'Food',
            },
          },
        ],
        transactions: [
          {
            categoryId: foodCategoryId,
            _sum: {
              amount: '1250000',
            },
            _count: {
              _all: 10,
            },
          },
        ],
      });

      const result = await service.getBudgetPerformance(userId);

      expect(result.budgets[0].usagePercentage).toBe('125');

      expect(result.budgets[0].remainingAmount).toBe('-250000');

      expect(result.budgets[0].status).toBe('OVER_BUDGET');
    });

    it('should return zero actual amount when a budget has no transactions', async () => {
      dashboardRepository.getBudgetPerformance.mockResolvedValue({
        budgets: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            name: 'Food Budget',
            categoryId: foodCategoryId,
            amount: '3000000',
            category: {
              id: foodCategoryId,
              name: 'Food',
            },
          },
        ],
        transactions: [],
      });

      const result = await service.getBudgetPerformance(userId);

      expect(result).toEqual({
        currency: 'IDR',
        budgets: [
          {
            budgetId: '33333333-3333-4333-8333-333333333333',
            budgetName: 'Food Budget',
            categoryId: foodCategoryId,
            categoryName: 'Food',
            budgetAmount: '3000000',
            actualAmount: '0',
            remainingAmount: '3000000',
            usagePercentage: '0',
            transactionCount: 0,
            status: 'ON_TRACK',
          },
        ],
        totalBudgetAmount: '3000000',
        totalActualAmount: '0',
        totalRemainingAmount: '3000000',
      });
    });

    it('should validate the date range', async () => {
      const startDate = new Date('2026-09-30T00:00:00.000Z');

      const endDate = new Date('2026-09-01T00:00:00.000Z');

      await expect(
        service.getBudgetPerformance(userId, {
          startDate,
          endDate,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'startDate must be earlier than or equal to endDate',
        ),
      );

      expect(dashboardRepository.getBudgetPerformance).not.toHaveBeenCalled();
    });
  });
});
