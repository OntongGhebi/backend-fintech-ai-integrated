import { ReportRepository } from './report.repository';

import { DashboardService } from '../../dashboard/dashboard.service';

import { PrismaService } from '../../../database/prisma/prisma.service';

describe('ReportRepository', () => {
  let repository: ReportRepository;

  let dashboardService: {
    getDashboardAggregation: jest.Mock;
  };

  let prisma: {
    transaction: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(() => {
    dashboardService = {
      getDashboardAggregation: jest.fn(),
    };

    prisma = {
      transaction: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    repository = new ReportRepository(
      dashboardService as unknown as DashboardService,
      prisma as unknown as PrismaService,
    );
  });

  describe('getFinancialReportData', () => {
    it('should retrieve financial report data from dashboard service', async () => {
      const aggregation = {
        currency: 'IDR',
      };

      dashboardService.getDashboardAggregation.mockResolvedValue(aggregation);

      const options = {
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T23:59:59.999Z'),
      };

      const result = await repository.getFinancialReportData('user-1', options);

      expect(dashboardService.getDashboardAggregation).toHaveBeenCalledWith(
        'user-1',
        options,
      );

      expect(result).toEqual(aggregation);
    });
  });

  describe('getPaginatedTransactions', () => {
    it('should return the first page using default pagination', async () => {
      const transactionDate = new Date('2026-09-30T10:00:00.000Z');

      prisma.transaction.findMany.mockResolvedValue([
        {
          id: 'transaction-1',
          accountId: 'account-1',
          categoryId: 'category-1',
          type: 'EXPENSE',
          amount: '150000',
          currency: 'IDR',
          description: 'Lunch',
          transactionDate,
          source: 'MANUAL',
        },
      ]);

      prisma.transaction.count.mockResolvedValue(21);

      const result = await repository.getPaginatedTransactions('user-1');

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: {
            in: ['INCOME', 'EXPENSE'],
          },
        },
        orderBy: [
          {
            transactionDate: 'desc',
          },
          {
            createdAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        skip: 0,
        take: 20,
        select: {
          id: true,
          accountId: true,
          categoryId: true,
          type: true,
          amount: true,
          currency: true,
          description: true,
          transactionDate: true,
          source: true,
        },
      });

      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: {
            in: ['INCOME', 'EXPENSE'],
          },
        },
      });

      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 21,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      });

      expect(result.data).toEqual([
        {
          id: 'transaction-1',
          accountId: 'account-1',
          categoryId: 'category-1',
          type: 'EXPENSE',
          amount: '150000',
          currency: 'IDR',
          description: 'Lunch',
          transactionDate,
          source: 'MANUAL',
        },
      ]);
    });

    it('should calculate skip correctly for later pages', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      prisma.transaction.count.mockResolvedValue(45);

      const result = await repository.getPaginatedTransactions('user-1', {
        page: 3,
        limit: 10,
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );

      expect(result.meta).toEqual({
        page: 3,
        limit: 10,
        total: 45,
        totalPages: 5,
        hasNextPage: true,
        hasPreviousPage: true,
      });
    });

    it('should apply all report filters', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      prisma.transaction.count.mockResolvedValue(5);

      const options = {
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T23:59:59.999Z'),
        type: 'EXPENSE' as const,
        accountId: 'account-1',
        categoryId: 'category-1',
        page: 2,
        limit: 10,
      };

      await repository.getPaginatedTransactions('user-1', options);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            deletedAt: null,
            status: 'ACTIVE',
            currency: 'IDR',
            type: 'EXPENSE',
            accountId: 'account-1',
            categoryId: 'category-1',
            transactionDate: {
              gte: options.startDate,
              lte: options.endDate,
            },
          },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('should return empty pagination metadata when there are no transactions', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      prisma.transaction.count.mockResolvedValue(0);

      const result = await repository.getPaginatedTransactions('user-1', {
        page: 1,
        limit: 20,
      });

      expect(result).toEqual({
        data: [],
        meta: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    });

    it('should mark the last page correctly', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      prisma.transaction.count.mockResolvedValue(21);

      const result = await repository.getPaginatedTransactions('user-1', {
        page: 2,
        limit: 20,
      });

      expect(result.meta).toEqual({
        page: 2,
        limit: 20,
        total: 21,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      });
    });
  });
});
