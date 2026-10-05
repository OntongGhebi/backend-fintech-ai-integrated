import { BadRequestException, Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';

import { DASHBOARD_DEFAULT_CURRENCY } from './dashboard.constants';

import {
  DashboardArchitecture,
  DashboardCategoryAnalytics,
  DashboardCategoryAnalyticsItem,
  DashboardExpenseAnalytics,
  DashboardIncomeAnalytics,
  DashboardQueryOptions,
  DashboardSummary,
} from './types/dashboard.types';

import { DashboardRepository } from './repositories/dashboard.repository';

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  getArchitecture(): DashboardArchitecture {
    return {
      module: 'dashboard',
      sourceOfTruth: 'transactions',
      currency: DASHBOARD_DEFAULT_CURRENCY,
      supportsDateRange: true,
    };
  }

  normalizeQuery(options: DashboardQueryOptions = {}): DashboardQueryOptions {
    if (
      options.startDate &&
      options.endDate &&
      options.startDate > options.endDate
    ) {
      throw new BadRequestException(
        'startDate must be earlier than or equal to endDate',
      );
    }

    return {
      startDate: options.startDate,
      endDate: options.endDate,
    };
  }

  async getFinancialSummary(
    userId: string,
    options: DashboardQueryOptions = {},
  ): Promise<DashboardSummary> {
    const normalizedOptions = this.normalizeQuery(options);

    const result = await this.dashboardRepository.getFinancialSummary(
      userId,
      normalizedOptions,
    );

    let totalIncome = new Prisma.Decimal(0);
    let totalExpense = new Prisma.Decimal(0);

    for (const transaction of result.groupedTransactions) {
      const amount = transaction._sum.amount ?? new Prisma.Decimal(0);

      if (transaction.type === 'INCOME') {
        totalIncome = totalIncome.plus(amount);
      }

      if (transaction.type === 'EXPENSE') {
        totalExpense = totalExpense.plus(amount);
      }
    }

    const netCashFlow = totalIncome.minus(totalExpense);

    return {
      currency: DASHBOARD_DEFAULT_CURRENCY,
      totalIncome: totalIncome.toString(),
      totalExpense: totalExpense.toString(),
      netCashFlow: netCashFlow.toString(),
      transactionCount: result.transactionCount,
    };
  }

  async getIncomeAnalytics(
    userId: string,
    options: DashboardQueryOptions = {},
  ): Promise<DashboardIncomeAnalytics> {
    const normalizedOptions = this.normalizeQuery(options);

    const result = await this.dashboardRepository.getIncomeAnalytics(
      userId,
      normalizedOptions,
    );

    const totalIncomeValue = result.totalIncome ?? new Prisma.Decimal(0);
    const totalIncome = new Prisma.Decimal(totalIncomeValue.toString());

    const transactionCount = result.transactionCount;

    const averageIncome =
      transactionCount > 0
        ? totalIncome.div(transactionCount)
        : new Prisma.Decimal(0);

    return {
      currency: DASHBOARD_DEFAULT_CURRENCY,
      totalIncome: totalIncomeValue.toString(),
      transactionCount,
      averageIncome: averageIncome.toString(),
    };
  }

  async getExpenseAnalytics(
    userId: string,
    options: DashboardQueryOptions = {},
  ): Promise<DashboardExpenseAnalytics> {
    const normalizedOptions = this.normalizeQuery(options);

    const result = await this.dashboardRepository.getExpenseAnalytics(
      userId,
      normalizedOptions,
    );

    const totalExpenseValue = result.totalExpense ?? new Prisma.Decimal(0);
    const totalExpense = new Prisma.Decimal(totalExpenseValue.toString());

    const transactionCount = result.transactionCount;

    const averageExpense =
      transactionCount > 0
        ? totalExpense.div(transactionCount)
        : new Prisma.Decimal(0);

    return {
      currency: DASHBOARD_DEFAULT_CURRENCY,
      totalExpense: totalExpenseValue.toString(),
      transactionCount,
      averageExpense: averageExpense.toString(),
    };
  }

  async getCategoryAnalytics(
    userId: string,
    type: 'INCOME' | 'EXPENSE' = 'EXPENSE',
    options: DashboardQueryOptions = {},
  ): Promise<DashboardCategoryAnalytics> {
    if (type !== 'INCOME' && type !== 'EXPENSE') {
      throw new BadRequestException(
        'Category analytics only supports income and expense transactions',
      );
    }

    const normalizedOptions = this.normalizeQuery(options);

    const result = await this.dashboardRepository.getCategoryAnalytics(
      userId,
      type,
      normalizedOptions,
    );

    const totalAmountValue = result.totalAmount ?? new Prisma.Decimal(0);
    const totalAmount = new Prisma.Decimal(totalAmountValue.toString());

    const categoryMap = new Map(
      result.categories.map((category) => [category.id, category.name]),
    );

    const categories: DashboardCategoryAnalyticsItem[] =
      result.groupedCategories
        .filter((item) => item.categoryId !== null)
        .map((item) => {
          const categoryId = item.categoryId as string;

          const amountValue = item._sum.amount ?? new Prisma.Decimal(0);
          const amount = new Prisma.Decimal(amountValue.toString());

          const transactionCount = item._count._all;

          const percentage = totalAmount.greaterThan(0)
            ? amount.div(totalAmount).times(100)
            : new Prisma.Decimal(0);

          return {
            categoryId,
            categoryName: categoryMap.get(categoryId) ?? 'Unknown',
            totalAmount: amount.toString(),
            transactionCount,
            percentage: percentage.toString(),
          };
        })
        .sort((a, b) => {
          const amountA = new Prisma.Decimal(a.totalAmount);

          const amountB = new Prisma.Decimal(b.totalAmount);

          return amountB.comparedTo(amountA);
        });

    return {
      currency: DASHBOARD_DEFAULT_CURRENCY,
      type,
      categories,
      totalAmount: totalAmountValue.toString(),
      transactionCount: result.transactionCount,
    };
  }
}
