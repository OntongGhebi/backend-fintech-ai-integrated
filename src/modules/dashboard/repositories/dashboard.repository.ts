import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { DashboardQueryOptions } from '../types/dashboard.types';

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getFinancialSummary(
    userId: string,
    options: DashboardQueryOptions = {},
  ) {
    const where = {
      userId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      currency: 'IDR',
      ...(options.startDate || options.endDate
        ? {
            transactionDate: {
              ...(options.startDate
                ? {
                    gte: options.startDate,
                  }
                : {}),
              ...(options.endDate
                ? {
                    lte: options.endDate,
                  }
                : {}),
            },
          }
        : {}),
    };

    const [groupedTransactions, transactionCount] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['type'],
        where,
        _sum: {
          amount: true,
        },
      }),
      this.prisma.transaction.count({
        where,
      }),
    ]);

    return {
      groupedTransactions,
      transactionCount,
    };
  }

  async getIncomeAnalytics(
    userId: string,
    options: DashboardQueryOptions = {},
  ) {
    const where = {
      userId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      currency: 'IDR',
      type: 'INCOME' as const,
      ...(options.startDate || options.endDate
        ? {
            transactionDate: {
              ...(options.startDate
                ? {
                    gte: options.startDate,
                  }
                : {}),
              ...(options.endDate
                ? {
                    lte: options.endDate,
                  }
                : {}),
            },
          }
        : {}),
    };

    const [aggregate, transactionCount] = await Promise.all([
      this.prisma.transaction.aggregate({
        where,
        _sum: {
          amount: true,
        },
      }),

      this.prisma.transaction.count({
        where,
      }),
    ]);

    return {
      totalIncome: aggregate._sum.amount,
      transactionCount,
    };
  }

  async getExpenseAnalytics(
    userId: string,
    options: DashboardQueryOptions = {},
  ) {
    const where = {
      userId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      currency: 'IDR',
      type: 'EXPENSE' as const,
      ...(options.startDate || options.endDate
        ? {
            transactionDate: {
              ...(options.startDate
                ? {
                    gte: options.startDate,
                  }
                : {}),
              ...(options.endDate
                ? {
                    lte: options.endDate,
                  }
                : {}),
            },
          }
        : {}),
    };

    const [aggregate, transactionCount] = await Promise.all([
      this.prisma.transaction.aggregate({
        where,
        _sum: {
          amount: true,
        },
      }),

      this.prisma.transaction.count({
        where,
      }),
    ]);

    return {
      totalExpense: aggregate._sum.amount,
      transactionCount,
    };
  }

  async getCategoryAnalytics(
    userId: string,
    type: 'INCOME' | 'EXPENSE',
    options: DashboardQueryOptions = {},
  ) {
    const where = {
      userId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      currency: 'IDR',
      type,
      categoryId: {
        not: null,
      },
      ...(options.startDate || options.endDate
        ? {
            transactionDate: {
              ...(options.startDate
                ? {
                    gte: options.startDate,
                  }
                : {}),
              ...(options.endDate
                ? {
                    lte: options.endDate,
                  }
                : {}),
            },
          }
        : {}),
    };

    const [groupedCategories, aggregate, transactionCount] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where,
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      }),

      this.prisma.transaction.aggregate({
        where,
        _sum: {
          amount: true,
        },
      }),

      this.prisma.transaction.count({
        where,
      }),
    ]);

    const categoryIds = groupedCategories
      .map((item) => item.categoryId)
      .filter((categoryId): categoryId is string => categoryId !== null);

    const categories =
      categoryIds.length > 0
        ? await this.prisma.category.findMany({
            where: {
              id: {
                in: categoryIds,
              },
              userId,
              deletedAt: null,
            },
            select: {
              id: true,
              name: true,
            },
          })
        : [];

    return {
      groupedCategories,
      categories,
      totalAmount: aggregate._sum.amount,
      transactionCount,
    };
  }

  async getAccountAnalytics(
    userId: string,
    type: 'INCOME' | 'EXPENSE',
    options: DashboardQueryOptions = {},
  ) {
    const where = {
      userId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      currency: 'IDR',
      type,
      ...(options.startDate || options.endDate
        ? {
            transactionDate: {
              ...(options.startDate
                ? {
                    gte: options.startDate,
                  }
                : {}),
              ...(options.endDate
                ? {
                    lte: options.endDate,
                  }
                : {}),
            },
          }
        : {}),
    };

    const [groupedAccounts, aggregate, transactionCount] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['accountId'],
        where,
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      }),

      this.prisma.transaction.aggregate({
        where,
        _sum: {
          amount: true,
        },
      }),

      this.prisma.transaction.count({
        where,
      }),
    ]);

    const accountIds = groupedAccounts
      .map((item) => item.accountId)
      .filter((accountId): accountId is string => accountId !== null);

    const accounts =
      accountIds.length > 0
        ? await this.prisma.account.findMany({
            where: {
              id: {
                in: accountIds,
              },
              userId,
              deletedAt: null,
            },
            select: {
              id: true,
              name: true,
            },
          })
        : [];

    return {
      groupedAccounts,
      accounts,
      totalAmount: aggregate._sum.amount,
      transactionCount,
    };
  }

  async getBudgetPerformance(
    userId: string,
    options: DashboardQueryOptions = {},
  ) {
    const budgetWhere = {
      userId,
      deletedAt: null,
      ...(options.startDate || options.endDate
        ? {
            OR: [
              ...(options.startDate
                ? [
                    {
                      startDate: {
                        gte: options.startDate,
                      },
                    },
                  ]
                : []),
              ...(options.endDate
                ? [
                    {
                      endDate: {
                        lte: options.endDate,
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };

    const budgets = await this.prisma.budget.findMany({
      where: budgetWhere,
      include: {
        category: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (budgets.length === 0) {
      return {
        budgets: [],
        transactions: [],
      };
    }

    const categoryIds = budgets
      .map((budget) => budget.categoryId)
      .filter((categoryId): categoryId is string => categoryId !== null);

    if (categoryIds.length === 0) {
      return {
        budgets,
        transactions: [],
      };
    }

    const transactionWhere = {
      userId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      currency: 'IDR',
      type: 'EXPENSE' as const,
      categoryId: {
        in: categoryIds,
      },
      ...(options.startDate || options.endDate
        ? {
            transactionDate: {
              ...(options.startDate
                ? {
                    gte: options.startDate,
                  }
                : {}),
              ...(options.endDate
                ? {
                    lte: options.endDate,
                  }
                : {}),
            },
          }
        : {}),
    };

    const transactions = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: transactionWhere,
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });

    return {
      budgets,
      transactions,
    };
  }

  async getRecurringPerformance(
    userId: string,
    options: DashboardQueryOptions = {},
  ) {
    const recurringWhere = {
      userId,
      isActive: true,
      ...(options.startDate || options.endDate
        ? {
            AND: [
              ...(options.endDate
                ? [
                    {
                      startDate: {
                        lte: options.endDate,
                      },
                    },
                  ]
                : []),
              ...(options.startDate
                ? [
                    {
                      OR: [
                        {
                          endDate: null,
                        },
                        {
                          endDate: {
                            gte: options.startDate,
                          },
                        },
                      ],
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };

    const recurringTransactions =
      await this.prisma.recurringTransaction.findMany({
        where: recurringWhere,
        orderBy: {
          createdAt: 'desc',
        },
      });

    if (recurringTransactions.length === 0) {
      return {
        recurringTransactions: [],
        transactions: [],
      };
    }

    const recurringTransactionIds = recurringTransactions.map(
      (item) => item.id,
    );

    const transactionWhere = {
      userId,
      recurringTransactionId: {
        in: recurringTransactionIds,
      },
      deletedAt: null,
      status: 'ACTIVE' as const,
      currency: 'IDR',
      ...(options.startDate || options.endDate
        ? {
            transactionDate: {
              ...(options.startDate
                ? {
                    gte: options.startDate,
                  }
                : {}),
              ...(options.endDate
                ? {
                    lte: options.endDate,
                  }
                : {}),
            },
          }
        : {}),
    };

    const transactions = await this.prisma.transaction.findMany({
      where: transactionWhere,
      select: {
        id: true,
        recurringTransactionId: true,
        amount: true,
        transactionDate: true,
      },
      orderBy: {
        transactionDate: 'asc',
      },
    });

    return {
      recurringTransactions,
      transactions,
    };
  }
}
