import { DashboardRepository } from './dashboard.repository';

describe('DashboardRepository', () => {
  let repository: DashboardRepository;

  let prisma: {
    transaction: {
      groupBy: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
    };
  };

  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    prisma = {
      transaction: {
        groupBy: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
    };

    repository = new DashboardRepository(prisma as never);
  });

  describe('getFinancialSummary', () => {
    it('should aggregate active IDR transactions for the user', async () => {
      const groupedTransactions = [
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
      ];

      prisma.transaction.groupBy.mockResolvedValue(groupedTransactions);

      prisma.transaction.count.mockResolvedValue(8);

      const result = await repository.getFinancialSummary(userId);

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith({
        by: ['type'],
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
        },
        _sum: {
          amount: true,
        },
      });

      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
        },
      });

      expect(result).toEqual({
        groupedTransactions,
        transactionCount: 8,
      });
    });

    it('should apply the start and end dates', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);

      prisma.transaction.count.mockResolvedValue(0);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getFinancialSummary(userId, {
        startDate,
        endDate,
      });

      const expectedWhere = {
        userId,
        deletedAt: null,
        status: 'ACTIVE',
        currency: 'IDR',
        transactionDate: {
          gte: startDate,
          lte: endDate,
        },
      };

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
        }),
      );

      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it('should apply only the start date', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);

      prisma.transaction.count.mockResolvedValue(0);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      await repository.getFinancialSummary(userId, {
        startDate,
      });

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            deletedAt: null,
            status: 'ACTIVE',
            currency: 'IDR',
            transactionDate: {
              gte: startDate,
            },
          },
        }),
      );
    });

    it('should apply only the end date', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);

      prisma.transaction.count.mockResolvedValue(0);

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getFinancialSummary(userId, {
        endDate,
      });

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            deletedAt: null,
            status: 'ACTIVE',
            currency: 'IDR',
            transactionDate: {
              lte: endDate,
            },
          },
        }),
      );
    });
  });

  describe('getIncomeAnalytics', () => {
    it('should aggregate only active IDR income transactions', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '7500000',
        },
      });

      prisma.transaction.count.mockResolvedValue(6);

      const result = await repository.getIncomeAnalytics(userId);

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'INCOME',
        },
        _sum: {
          amount: true,
        },
      });

      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'INCOME',
        },
      });

      expect(result).toEqual({
        totalIncome: '7500000',
        transactionCount: 6,
      });
    });

    it('should apply the date range to income analytics', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '3000000',
        },
      });

      prisma.transaction.count.mockResolvedValue(2);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getIncomeAnalytics(userId, {
        startDate,
        endDate,
      });

      const expectedWhere = {
        userId,
        deletedAt: null,
        status: 'ACTIVE',
        currency: 'IDR',
        type: 'INCOME',
        transactionDate: {
          gte: startDate,
          lte: endDate,
        },
      };

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: expectedWhere,
        _sum: {
          amount: true,
        },
      });

      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it('should apply only the start date', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '1000000',
        },
      });

      prisma.transaction.count.mockResolvedValue(1);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      await repository.getIncomeAnalytics(userId, {
        startDate,
      });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'INCOME',
          transactionDate: {
            gte: startDate,
          },
        },
        _sum: {
          amount: true,
        },
      });
    });

    it('should apply only the end date', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '1000000',
        },
      });

      prisma.transaction.count.mockResolvedValue(1);

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getIncomeAnalytics(userId, {
        endDate,
      });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'INCOME',
          transactionDate: {
            lte: endDate,
          },
        },
        _sum: {
          amount: true,
        },
      });
    });
  });

  describe('getExpenseAnalytics', () => {
    it('should aggregate only active IDR expense transactions', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '3750000',
        },
      });

      prisma.transaction.count.mockResolvedValue(10);

      const result = await repository.getExpenseAnalytics(userId);

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
        },
        _sum: {
          amount: true,
        },
      });

      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
        },
      });

      expect(result).toEqual({
        totalExpense: '3750000',
        transactionCount: 10,
      });
    });

    it('should apply the date range to expense analytics', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '3000000',
        },
      });

      prisma.transaction.count.mockResolvedValue(3);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getExpenseAnalytics(userId, {
        startDate,
        endDate,
      });

      const expectedWhere = {
        userId,
        deletedAt: null,
        status: 'ACTIVE',
        currency: 'IDR',
        type: 'EXPENSE',
        transactionDate: {
          gte: startDate,
          lte: endDate,
        },
      };

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: expectedWhere,
        _sum: {
          amount: true,
        },
      });

      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it('should apply only the start date', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '1000000',
        },
      });

      prisma.transaction.count.mockResolvedValue(1);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      await repository.getExpenseAnalytics(userId, {
        startDate,
      });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
          transactionDate: {
            gte: startDate,
          },
        },
        _sum: {
          amount: true,
        },
      });
    });

    it('should apply only the end date', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '1000000',
        },
      });

      prisma.transaction.count.mockResolvedValue(1);

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getExpenseAnalytics(userId, {
        endDate,
      });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
          transactionDate: {
            lte: endDate,
          },
        },
        _sum: {
          amount: true,
        },
      });
    });
  });
});
