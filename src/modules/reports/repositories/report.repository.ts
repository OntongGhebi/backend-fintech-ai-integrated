import { Injectable } from '@nestjs/common';
import { DashboardService } from 'src/modules/dashboard/dashboard.service';

import type {
  DashboardAggregation,
  DashboardQueryOptions,
} from 'src/modules/dashboard/types/dashboard.types';
import {
  PaginatedReportTransactions,
  ReportQueryOptions,
  ReportTransactionItem,
} from '../types/report.types';
import { REPORT_DEFAULT_LIMIT, REPORT_DEFAULT_PAGE } from '../report.constants';
import { PrismaService } from 'src/database/prisma/prisma.service';

@Injectable()
export class ReportRepository {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly prisma: PrismaService,
  ) {}

  async getFinancialReportData(
    userId: string,
    options: DashboardQueryOptions,
  ): Promise<DashboardAggregation> {
    return this.dashboardService.getDashboardAggregation(userId, options);
  }

  async getPaginatedTransactions(
    userId: string,
    options: ReportQueryOptions = {},
  ): Promise<PaginatedReportTransactions> {
    const page = options.page ?? REPORT_DEFAULT_PAGE;
    const limit = options.limit ?? REPORT_DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      currency: 'IDR',

      type:
        options.type === 'INCOME' || options.type === 'EXPENSE'
          ? options.type
          : {
              in: ['INCOME', 'EXPENSE'] as ('INCOME' | 'EXPENSE')[],
            },

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

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
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
        skip,
        take: limit,
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
      }),

      this.prisma.transaction.count({
        where,
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data: transactions.map((transaction) => ({
        id: transaction.id,
        accountId: transaction.accountId,
        categoryId: transaction.categoryId,
        type: transaction.type as 'INCOME' | 'EXPENSE',
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        description: transaction.description,
        transactionDate: transaction.transactionDate,
        source: transaction.source,
      })),

      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: totalPages > 0 && page < totalPages,
        hasPreviousPage: page > 1 && totalPages > 0,
      },
    };
  }

  async getExportTransactions(
    userId: string,
    options: ReportQueryOptions = {},
  ): Promise<ReportTransactionItem[]> {
    const where = this.buildTransactionWhere(userId, options);

    const transactions = await this.prisma.transaction.findMany({
      where,
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

    return transactions.map((transaction) =>
      this.mapTransaction({
        ...transaction,
        type: transaction.type as 'INCOME' | 'EXPENSE',
      }),
    );
  }

  private buildTransactionWhere(
    userId: string,
    options: ReportQueryOptions = {},
  ) {
    return {
      userId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      currency: 'IDR',
      type: options.type
        ? options.type
        : {
            in: ['INCOME', 'EXPENSE'] as ('INCOME' | 'EXPENSE')[],
          },

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

  private mapTransaction(transaction: {
    id: string;
    accountId: string;
    categoryId: string | null;
    type: 'INCOME' | 'EXPENSE';
    amount: {
      toString(): string;
    };
    currency: string;
    description: string | null;
    transactionDate: Date;
    source: string;
  }): ReportTransactionItem {
    return {
      id: transaction.id,
      accountId: transaction.accountId,
      categoryId: transaction.categoryId,
      type: transaction.type,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      description: transaction.description,
      transactionDate: transaction.transactionDate,
      source: transaction.source,
    };
  }
}
