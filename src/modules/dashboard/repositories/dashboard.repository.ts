import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import type {
  DashboardCashFlowPeriod,
  DashboardQueryOptions,
} from '../types/dashboard.types';
import { Prisma } from '../../../../generated/prisma/client';

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getFinancialSummary(
    userId: string,
    options: DashboardQueryOptions = {},
  ) {
    const where = this.buildTransactionWhere(userId, options);

    const groupedTransactions = await this.prisma.transaction.groupBy({
      by: ['type'],
      where,
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });

    return {
      groupedTransactions,
      transactionCount: groupedTransactions.reduce(
        (total, transaction) => total + transaction._count._all,
        0,
      ),
    };
  }

  async getIncomeAnalytics(
    userId: string,
    options: DashboardQueryOptions = {},
  ) {
    const where = {
      ...this.buildTransactionWhere(userId, options),
      type: 'INCOME' as const,
    };

    const aggregate = await this.prisma.transaction.aggregate({
      where,
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });

    return {
      totalIncome: aggregate._sum.amount,
      transactionCount: aggregate._count._all,
    };
  }

  async getExpenseAnalytics(
    userId: string,
    options: DashboardQueryOptions = {},
  ) {
    const where = {
      ...this.buildTransactionWhere(userId, options),
      type: 'EXPENSE' as const,
    };

    const aggregate = await this.prisma.transaction.aggregate({
      where,
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });

    return {
      totalExpense: aggregate._sum.amount,
      transactionCount: aggregate._count._all,
    };
  }

  async getCategoryAnalytics(
    userId: string,
    type: 'INCOME' | 'EXPENSE',
    options: DashboardQueryOptions = {},
  ) {
    const where = {
      ...this.buildTransactionWhere(userId, options),
      type,
      categoryId: {
        not: null,
      },
    };

    const groupedCategories = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where,
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });

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

    const totalAmount = groupedCategories.reduce(
      (total, item) => total.plus(item._sum.amount ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );

    return {
      groupedCategories,
      categories,
      totalAmount: groupedCategories.length > 0 ? totalAmount.toString() : null,
      transactionCount: groupedCategories.reduce(
        (total, item) => total + item._count._all,
        0,
      ),
    };
  }

  async getAccountAnalytics(
    userId: string,
    type: 'INCOME' | 'EXPENSE',
    options: DashboardQueryOptions = {},
  ) {
    const where = {
      ...this.buildTransactionWhere(userId, options),
      type,
    };

    const groupedAccounts = await this.prisma.transaction.groupBy({
      by: ['accountId'],
      where,
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });

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

    const totalAmount = groupedAccounts.reduce(
      (total, item) => total.plus(item._sum.amount ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );

    return {
      groupedAccounts,
      accounts,
      totalAmount: groupedAccounts.length > 0 ? totalAmount.toString() : null,
      transactionCount: groupedAccounts.reduce(
        (total, item) => total + item._count._all,
        0,
      ),
    };
  }

  async getIncomeExpenseAnalyticsBase(
    userId: string,
    options: DashboardQueryOptions = {},
  ) {
    const where = {
      ...this.buildTransactionWhere(userId, options),
      type: options.type ?? {
        in: ['INCOME' as const, 'EXPENSE' as const],
      },
    };

    return this.prisma.transaction.groupBy({
      by: ['type'],
      where,
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });
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

  async getCashFlow(
    userId: string,
    options: DashboardQueryOptions & {
      period?: DashboardCashFlowPeriod;
    } = {},
  ) {
    const where = {
      userId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      currency: 'IDR',
      type: {
        in: ['INCOME' as const, 'EXPENSE' as const],
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

    return this.prisma.transaction.findMany({
      where,
      select: {
        id: true,
        type: true,
        amount: true,
        transactionDate: true,
      },
      orderBy: {
        transactionDate: 'asc',
      },
    });
  }

  async getMonthlyFinancialSummary(
    userId: string,
    options: DashboardQueryOptions = {},
  ) {
    const where = {
      userId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      currency: 'IDR',
      type: {
        in: ['INCOME' as const, 'EXPENSE' as const],
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

    return this.prisma.transaction.findMany({
      where,
      select: {
        id: true,
        type: true,
        amount: true,
        transactionDate: true,
      },
      orderBy: {
        transactionDate: 'asc',
      },
    });
  }

  private buildTransactionWhere(
    userId: string,
    options: DashboardQueryOptions = {},
  ) {
    return {
      userId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      currency: 'IDR',
      ...(options.type
        ? {
            type: options.type,
          }
        : {}),

      ...(options.accountId
        ? {
            accountId: options.accountId,
          }
        : {}),

      ...(options.categoryId
        ? {
            categoryId: options.categoryId,
          }
        : {}),
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
  }
}
