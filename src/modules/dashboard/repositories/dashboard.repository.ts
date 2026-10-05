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
}
