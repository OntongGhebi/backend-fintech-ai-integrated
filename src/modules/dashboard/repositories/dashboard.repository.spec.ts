import { DashboardRepository } from './dashboard.repository';

describe('DashboardRepository', () => {
  let repository: DashboardRepository;

  let prisma: {
    transaction: {
      groupBy: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
    };
    category: {
      findMany: jest.Mock;
    };
    account: {
      findMany: jest.Mock;
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
      category: {
        findMany: jest.fn(),
      },
      account: {
        findMany: jest.fn(),
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

  describe('getCategoryAnalytics', () => {
    it('should aggregate categories and resolve category names', async () => {
      const categoryId = '11111111-1111-4111-8111-111111111111';

      prisma.transaction.groupBy.mockResolvedValue([
        {
          categoryId,
          _sum: {
            amount: '2500000',
          },
          _count: {
            _all: 8,
          },
        },
      ]);

      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '2500000',
        },
      });

      prisma.transaction.count.mockResolvedValue(8);

      prisma.category.findMany.mockResolvedValue([
        {
          id: categoryId,
          name: 'Food',
        },
      ]);

      const result = await repository.getCategoryAnalytics(userId, 'EXPENSE');

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith({
        by: ['categoryId'],
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: 'IDR',
          type: 'EXPENSE',
          categoryId: {
            not: null,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      });

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: [categoryId],
          },
          userId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
        },
      });

      expect(result).toEqual({
        groupedCategories: [
          {
            categoryId,
            _sum: {
              amount: '2500000',
            },
            _count: {
              _all: 8,
            },
          },
        ],
        categories: [
          {
            id: categoryId,
            name: 'Food',
          },
        ],
        totalAmount: '2500000',
        transactionCount: 8,
      });
    });

    it('should apply date range', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: null,
        },
      });
      prisma.transaction.count.mockResolvedValue(0);
      prisma.category.findMany.mockResolvedValue([]);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getCategoryAnalytics(userId, 'INCOME', {
        startDate,
        endDate,
      });

      const expectedWhere = {
        userId,
        deletedAt: null,
        status: 'ACTIVE',
        currency: 'IDR',
        type: 'INCOME',
        categoryId: {
          not: null,
        },
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

    it('should not query categories when there are no grouped categories', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: null,
        },
      });
      prisma.transaction.count.mockResolvedValue(0);

      const result = await repository.getCategoryAnalytics(userId, 'EXPENSE');

      expect(prisma.category.findMany).not.toHaveBeenCalled();

      expect(result).toEqual({
        groupedCategories: [],
        categories: [],
        totalAmount: null,
        transactionCount: 0,
      });
    });
  });

  describe('getAccountAnalytics', () => {
    it('should aggregate accounts and resolve account names', async () => {
      const accountId = '11111111-1111-4111-8111-111111111111';

      prisma.transaction.groupBy.mockResolvedValue([
        {
          accountId,
          _sum: {
            amount: '2500000',
          },
          _count: {
            _all: 8,
          },
        },
      ]);

      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: '2500000',
        },
      });

      prisma.transaction.count.mockResolvedValue(8);

      prisma.account.findMany.mockResolvedValue([
        {
          id: accountId,
          name: 'BCA',
        },
      ]);

      const result = await repository.getAccountAnalytics(userId, 'EXPENSE');

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith({
        by: ['accountId'],
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
        _count: {
          _all: true,
        },
      });

      expect(prisma.account.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: [accountId],
          },
          userId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
        },
      });

      expect(result).toEqual({
        groupedAccounts: [
          {
            accountId,
            _sum: {
              amount: '2500000',
            },
            _count: {
              _all: 8,
            },
          },
        ],
        accounts: [
          {
            id: accountId,
            name: 'BCA',
          },
        ],
        totalAmount: '2500000',
        transactionCount: 8,
      });
    });

    it('should apply date range', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: null,
        },
      });
      prisma.transaction.count.mockResolvedValue(0);

      prisma.account.findMany.mockResolvedValue([]);

      const startDate = new Date('2026-09-01T00:00:00.000Z');

      const endDate = new Date('2026-09-30T23:59:59.999Z');

      await repository.getAccountAnalytics(userId, 'INCOME', {
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

      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
        }),
      );

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

    it('should not query accounts when there are no grouped accounts', async () => {
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: null,
        },
      });
      prisma.transaction.count.mockResolvedValue(0);

      const result = await repository.getAccountAnalytics(userId, 'EXPENSE');

      expect(prisma.account.findMany).not.toHaveBeenCalled();

      expect(result).toEqual({
        groupedAccounts: [],
        accounts: [],
        totalAmount: null,
        transactionCount: 0,
      });
    });
  });
});
