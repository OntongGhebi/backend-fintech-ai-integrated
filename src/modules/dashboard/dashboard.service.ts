import { BadRequestException, Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';

import {
  DASHBOARD_BUDGET_NEAR_LIMIT_PERCENTAGE,
  DASHBOARD_CASH_FLOW_DEFAULT_PERIOD,
  DASHBOARD_CASH_FLOW_MAX_PERIODS,
  DASHBOARD_DEFAULT_CURRENCY,
  DASHBOARD_MONTHLY_SUMMARY_DEFAULT_MONTHS,
  DASHBOARD_MONTHLY_SUMMARY_MAX_MONTHS,
  DASHBOARD_RECURRING_NEAR_COMPLETE_PERCENTAGE,
} from './dashboard.constants';

import {
  DashboardAccountAnalytics,
  DashboardAccountAnalyticsItem,
  DashboardArchitecture,
  DashboardBudgetPerformance,
  DashboardBudgetPerformanceItem,
  DashboardBudgetPerformanceStatus,
  DashboardCashFlow,
  DashboardCashFlowItem,
  DashboardCashFlowPeriod,
  DashboardCategoryAnalytics,
  DashboardCategoryAnalyticsItem,
  DashboardExpenseAnalytics,
  DashboardIncomeAnalytics,
  DashboardMonthlyFinancialSummary,
  DashboardMonthlyFinancialSummaryItem,
  DashboardQueryOptions,
  DashboardRecurringPerformance,
  DashboardRecurringPerformanceItem,
  DashboardRecurringPerformanceStatus,
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

  async getAccountAnalytics(
    userId: string,
    type: 'INCOME' | 'EXPENSE' = 'EXPENSE',
    options: DashboardQueryOptions = {},
  ): Promise<DashboardAccountAnalytics> {
    if (type !== 'INCOME' && type !== 'EXPENSE') {
      throw new BadRequestException(
        'Account analytics only supports income and expense transactions',
      );
    }

    const normalizedOptions = this.normalizeQuery(options);

    const result = await this.dashboardRepository.getAccountAnalytics(
      userId,
      type,
      normalizedOptions,
    );

    const totalAmountValue = result.totalAmount ?? new Prisma.Decimal(0);
    const totalAmount = new Prisma.Decimal(totalAmountValue.toString());

    const accountMap = new Map(
      result.accounts.map((account) => [account.id, account.name]),
    );

    const accounts: DashboardAccountAnalyticsItem[] = result.groupedAccounts
      .map((item) => {
        const accountId = item.accountId;

        const amountValue = item._sum.amount ?? new Prisma.Decimal(0);
        const amount = new Prisma.Decimal(amountValue.toString());

        const transactionCount = item._count._all;

        const percentage = totalAmount.greaterThan(0)
          ? amount.div(totalAmount).times(100)
          : new Prisma.Decimal(0);

        return {
          accountId,
          accountName: accountMap.get(accountId) ?? 'Unknown',
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
      accounts,
      totalAmount: totalAmountValue.toString(),
      transactionCount: result.transactionCount,
    };
  }

  async getBudgetPerformance(
    userId: string,
    options: DashboardQueryOptions = {},
  ): Promise<DashboardBudgetPerformance> {
    const normalizedOptions = this.normalizeQuery(options);

    const result = await this.dashboardRepository.getBudgetPerformance(
      userId,
      normalizedOptions,
    );

    let totalBudgetAmount = new Prisma.Decimal(0);

    let totalActualAmount = new Prisma.Decimal(0);

    const transactionMap = new Map<
      string,
      {
        amount: Prisma.Decimal;
        count: number;
      }
    >();

    for (const transaction of result.transactions) {
      if (!transaction.categoryId) {
        continue;
      }

      transactionMap.set(transaction.categoryId, {
        amount: new Prisma.Decimal(
          (transaction._sum.amount ?? new Prisma.Decimal(0)).toString(),
        ),
        count: transaction._count._all,
      });
    }

    const budgets: DashboardBudgetPerformanceItem[] = result.budgets.flatMap(
      (budget) => {
        if (!budget.categoryId) {
          return [];
        }

        const budgetAmount = new Prisma.Decimal(budget.amount);

        const transaction = transactionMap.get(budget.categoryId);

        const actualAmount = transaction?.amount ?? new Prisma.Decimal(0);

        const transactionCount = transaction?.count ?? 0;

        const remainingAmount = budgetAmount.minus(actualAmount);

        const usagePercentage = budgetAmount.greaterThan(0)
          ? actualAmount.div(budgetAmount).times(100)
          : new Prisma.Decimal(0);

        let status: DashboardBudgetPerformanceStatus;

        if (usagePercentage.greaterThan(100)) {
          status = 'OVER_BUDGET';
        } else if (
          usagePercentage.greaterThanOrEqualTo(
            DASHBOARD_BUDGET_NEAR_LIMIT_PERCENTAGE,
          )
        ) {
          status = 'NEAR_LIMIT';
        } else {
          status = 'ON_TRACK';
        }

        totalBudgetAmount = totalBudgetAmount.plus(budgetAmount);

        totalActualAmount = totalActualAmount.plus(actualAmount);

        return [
          {
            budgetId: budget.id,
            budgetName: budget.name,
            categoryId: budget.categoryId,
            categoryName: budget.category?.name ?? budget.categoryId,
            budgetAmount: budgetAmount.toString(),
            actualAmount: actualAmount.toString(),
            remainingAmount: remainingAmount.toString(),
            usagePercentage: usagePercentage.toString(),
            transactionCount,
            status,
          },
        ];
      },
    );

    const totalRemainingAmount = totalBudgetAmount.minus(totalActualAmount);

    return {
      currency: DASHBOARD_DEFAULT_CURRENCY,
      budgets,
      totalBudgetAmount: totalBudgetAmount.toString(),
      totalActualAmount: totalActualAmount.toString(),
      totalRemainingAmount: totalRemainingAmount.toString(),
    };
  }

  async getRecurringPerformance(
    userId: string,
    options: DashboardQueryOptions = {},
  ): Promise<DashboardRecurringPerformance> {
    const normalizedOptions = this.normalizeQuery(options);

    const result = await this.dashboardRepository.getRecurringPerformance(
      userId,
      normalizedOptions,
    );

    let totalExpectedAmount = new Prisma.Decimal(0);

    let totalExecutedAmount = new Prisma.Decimal(0);

    let totalExpectedOccurrences = 0;
    let totalExecutedOccurrences = 0;
    let totalMissedOccurrences = 0;

    const transactionsByRecurringId = new Map<
      string,
      Array<{
        amount: Prisma.Decimal;
        transactionDate: Date;
      }>
    >();

    for (const transaction of result.transactions) {
      if (!transaction.recurringTransactionId) {
        continue;
      }

      const current =
        transactionsByRecurringId.get(transaction.recurringTransactionId) ?? [];

      current.push({
        amount: transaction.amount,
        transactionDate: transaction.transactionDate,
      });

      transactionsByRecurringId.set(
        transaction.recurringTransactionId,
        current,
      );
    }

    const recurringTransactions = result.recurringTransactions.map(
      (recurringTransaction): DashboardRecurringPerformanceItem => {
        const periodStart = this.getRecurringPerformanceStartDate(
          recurringTransaction.startDate,
          normalizedOptions.startDate,
        );

        const periodEnd = this.getRecurringPerformanceEndDate(
          recurringTransaction.endDate,
          normalizedOptions.endDate,
        );

        const expectedOccurrences = this.calculateExpectedOccurrences(
          recurringTransaction.frequency,
          periodStart,
          periodEnd,
        );

        const actualTransactions =
          transactionsByRecurringId.get(recurringTransaction.id) ?? [];

        const executedOccurrences = actualTransactions.filter(
          (transaction) =>
            transaction.transactionDate >= periodStart &&
            transaction.transactionDate <= periodEnd,
        ).length;

        const missedOccurrences = Math.max(
          expectedOccurrences - executedOccurrences,
          0,
        );

        const amount = new Prisma.Decimal(recurringTransaction.amount);

        const expectedAmount = amount.times(expectedOccurrences);

        const executedAmount = actualTransactions
          .filter(
            (transaction) =>
              transaction.transactionDate >= periodStart &&
              transaction.transactionDate <= periodEnd,
          )
          .reduce(
            (total, transaction) => total.plus(transaction.amount),
            new Prisma.Decimal(0),
          );

        const completionPercentage = expectedAmount.greaterThan(0)
          ? executedAmount.div(expectedAmount).times(100)
          : new Prisma.Decimal(0);

        const status =
          this.resolveRecurringPerformanceStatus(completionPercentage);

        totalExpectedAmount = totalExpectedAmount.plus(expectedAmount);

        totalExecutedAmount = totalExecutedAmount.plus(executedAmount);

        totalExpectedOccurrences += expectedOccurrences;

        totalExecutedOccurrences += executedOccurrences;

        totalMissedOccurrences += missedOccurrences;

        return {
          recurringTransactionId: recurringTransaction.id,
          description: recurringTransaction.description,
          type: recurringTransaction.type,
          frequency: recurringTransaction.frequency,
          amount: amount.toString(),
          expectedOccurrences,
          executedOccurrences,
          missedOccurrences,
          expectedAmount: expectedAmount.toString(),
          executedAmount: executedAmount.toString(),
          completionPercentage: completionPercentage.toString(),
          status,
        };
      },
    );

    return {
      currency: DASHBOARD_DEFAULT_CURRENCY,
      recurringTransactions,
      totalExpectedAmount: totalExpectedAmount.toString(),
      totalExecutedAmount: totalExecutedAmount.toString(),
      totalExpectedOccurrences,
      totalExecutedOccurrences,
      totalMissedOccurrences,
    };
  }

  async getCashFlow(
    userId: string,
    options: DashboardQueryOptions & {
      period?: DashboardCashFlowPeriod;
    } = {},
  ): Promise<DashboardCashFlow> {
    const normalizedOptions = this.normalizeQuery(options);

    const startDate =
      normalizedOptions.startDate ?? this.getDefaultCashFlowStartDate();

    const endDate = normalizedOptions.endDate ?? new Date();

    const period = options.period ?? DASHBOARD_CASH_FLOW_DEFAULT_PERIOD;

    const transactions = await this.dashboardRepository.getCashFlow(userId, {
      ...normalizedOptions,
      startDate,
      endDate,
      period,
    });

    const cashFlowTransactions = transactions.filter(
      (
        transaction,
      ): transaction is {
        id: string;
        type: 'INCOME' | 'EXPENSE';
        amount: Prisma.Decimal;
        transactionDate: Date;
      } => transaction.type === 'INCOME' || transaction.type === 'EXPENSE',
    );

    const buckets = this.buildCashFlowBuckets(
      cashFlowTransactions,
      startDate,
      endDate,
      period,
    );

    let totalIncome = new Prisma.Decimal(0);

    let totalExpense = new Prisma.Decimal(0);

    let totalTransactionCount = 0;

    const cashFlows: DashboardCashFlowItem[] = Array.from(buckets.values()).map(
      (bucket) => {
        totalIncome = totalIncome.plus(bucket.income);

        totalExpense = totalExpense.plus(bucket.expense);

        totalTransactionCount += bucket.transactionCount;

        return {
          period: bucket.period,
          income: bucket.income.toString(),
          expense: bucket.expense.toString(),
          netCashFlow: bucket.income.minus(bucket.expense).toString(),
          transactionCount: bucket.transactionCount,
        };
      },
    );

    const totalNetCashFlow = totalIncome.minus(totalExpense);

    return {
      currency: DASHBOARD_DEFAULT_CURRENCY,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      period,
      cashFlows,
      totalIncome: totalIncome.toString(),
      totalExpense: totalExpense.toString(),
      totalNetCashFlow: totalNetCashFlow.toString(),
      totalTransactionCount,
    };
  }

  async getMonthlyFinancialSummary(
    userId: string,
    options: DashboardQueryOptions = {},
  ): Promise<DashboardMonthlyFinancialSummary> {
    const normalizedOptions = this.normalizeQuery(options);

    const { startDate, endDate } =
      this.resolveMonthlySummaryDateRange(normalizedOptions);

    const transactions =
      await this.dashboardRepository.getMonthlyFinancialSummary(userId, {
        startDate,
        endDate,
      });

    const buckets = this.buildMonthlyFinancialSummaryBuckets(
      transactions.filter(
        (
          transaction,
        ): transaction is {
          id: string;
          type: 'INCOME' | 'EXPENSE';
          amount: Prisma.Decimal;
          transactionDate: Date;
        } => transaction.type === 'INCOME' || transaction.type === 'EXPENSE',
      ),
      startDate,
      endDate,
    );

    let totalIncome = new Prisma.Decimal(0);
    let totalExpense = new Prisma.Decimal(0);
    let totalTransactionCount = 0;

    const months: DashboardMonthlyFinancialSummaryItem[] = Array.from(
      buckets.values(),
    ).map((bucket) => {
      totalIncome = totalIncome.plus(bucket.income);
      totalExpense = totalExpense.plus(bucket.expense);
      totalTransactionCount += bucket.transactionCount;

      const netCashFlow = bucket.income.minus(bucket.expense);

      const savingsRate = bucket.income.greaterThan(0)
        ? netCashFlow.div(bucket.income).times(100)
        : new Prisma.Decimal(0);

      return {
        month: bucket.month,
        income: bucket.income.toString(),
        expense: bucket.expense.toString(),
        netCashFlow: netCashFlow.toString(),
        transactionCount: bucket.transactionCount,
        savingsRate: savingsRate.toString(),
      };
    });

    const monthCount = months.length;

    const averageMonthlyIncome =
      monthCount > 0 ? totalIncome.div(monthCount) : new Prisma.Decimal(0);

    const averageMonthlyExpense =
      monthCount > 0 ? totalExpense.div(monthCount) : new Prisma.Decimal(0);

    return {
      currency: DASHBOARD_DEFAULT_CURRENCY,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      months,
      totalIncome: totalIncome.toString(),
      totalExpense: totalExpense.toString(),
      totalNetCashFlow: totalIncome.minus(totalExpense).toString(),
      totalTransactionCount,
      averageMonthlyIncome: averageMonthlyIncome.toString(),
      averageMonthlyExpense: averageMonthlyExpense.toString(),
    };
  }

  private getRecurringPerformanceStartDate(
    recurringStartDate: Date,
    requestedStartDate?: Date,
  ): Date {
    if (!requestedStartDate) {
      return new Date(recurringStartDate);
    }

    return new Date(
      Math.max(recurringStartDate.getTime(), requestedStartDate.getTime()),
    );
  }

  private getRecurringPerformanceEndDate(
    recurringEndDate: Date | null,
    requestedEndDate?: Date,
  ): Date {
    const defaultEndDate = requestedEndDate ?? new Date();

    if (!recurringEndDate) {
      return new Date(defaultEndDate);
    }

    return new Date(
      Math.min(recurringEndDate.getTime(), defaultEndDate.getTime()),
    );
  }

  private calculateExpectedOccurrences(
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
    startDate: Date,
    endDate: Date,
  ): number {
    if (endDate.getTime() < startDate.getTime()) {
      return 0;
    }

    let count = 0;
    let current = new Date(startDate);

    while (current.getTime() <= endDate.getTime()) {
      count += 1;

      const next = new Date(current);

      switch (frequency) {
        case 'DAILY':
          next.setUTCDate(next.getUTCDate() + 1);
          break;
        case 'WEEKLY':
          next.setUTCDate(next.getUTCDate() + 7);
          break;
        case 'MONTHLY':
          next.setUTCMonth(next.getUTCMonth() + 1);
          break;
        case 'YEARLY':
          next.setUTCFullYear(next.getUTCFullYear() + 1);
          break;
      }

      if (next.getTime() === current.getTime()) {
        break;
      }

      current = next;
    }

    return count;
  }

  private resolveRecurringPerformanceStatus(
    completionPercentage: Prisma.Decimal,
  ): DashboardRecurringPerformanceStatus {
    if (completionPercentage.greaterThanOrEqualTo(100)) {
      return 'ON_TRACK';
    }
    if (
      completionPercentage.greaterThanOrEqualTo(
        DASHBOARD_RECURRING_NEAR_COMPLETE_PERCENTAGE,
      )
    ) {
      return 'NEAR_COMPLETE';
    }
    return 'UNDERPERFORMING';
  }

  private getDefaultCashFlowStartDate(): Date {
    const date = new Date();

    date.setUTCDate(1);
    date.setUTCHours(0, 0, 0, 0);

    return date;
  }

  private buildCashFlowBuckets(
    transactions: Array<{
      id: string;
      type: 'INCOME' | 'EXPENSE';
      amount: Prisma.Decimal;
      transactionDate: Date;
    }>,
    startDate: Date,
    endDate: Date,
    period: DashboardCashFlowPeriod,
  ): Map<
    string,
    {
      period: string;
      income: Prisma.Decimal;
      expense: Prisma.Decimal;
      transactionCount: number;
    }
  > {
    const buckets = new Map<
      string,
      {
        period: string;
        income: Prisma.Decimal;
        expense: Prisma.Decimal;
        transactionCount: number;
      }
    >();

    let cursor = this.getCashFlowBucketStart(startDate, period);

    let iteration = 0;

    while (
      cursor.getTime() <= endDate.getTime() &&
      iteration < DASHBOARD_CASH_FLOW_MAX_PERIODS
    ) {
      const key = this.getCashFlowBucketKey(cursor, period);

      buckets.set(key, {
        period: key,
        income: new Prisma.Decimal(0),
        expense: new Prisma.Decimal(0),
        transactionCount: 0,
      });

      cursor = this.getNextCashFlowBucket(cursor, period);

      iteration += 1;
    }

    for (const transaction of transactions) {
      const bucketStart = this.getCashFlowBucketStart(
        transaction.transactionDate,
        period,
      );

      const key = this.getCashFlowBucketKey(bucketStart, period);

      const bucket = buckets.get(key);

      if (!bucket) {
        continue;
      }

      if (transaction.type === 'INCOME') {
        bucket.income = bucket.income.plus(transaction.amount);
      } else {
        bucket.expense = bucket.expense.plus(transaction.amount);
      }

      bucket.transactionCount += 1;
    }

    return buckets;
  }

  private getCashFlowBucketStart(
    date: Date,
    period: DashboardCashFlowPeriod,
  ): Date {
    const result = new Date(date);

    switch (period) {
      case 'DAY':
        result.setUTCHours(0, 0, 0, 0);
        break;

      case 'WEEK': {
        result.setUTCHours(0, 0, 0, 0);

        const day = result.getUTCDay();

        const difference = day === 0 ? 6 : day - 1;

        result.setUTCDate(result.getUTCDate() - difference);

        break;
      }

      case 'MONTH':
        result.setUTCDate(1);
        result.setUTCHours(0, 0, 0, 0);
        break;

      case 'YEAR':
        result.setUTCMonth(0, 1);
        result.setUTCHours(0, 0, 0, 0);
        break;
    }

    return result;
  }

  private getCashFlowBucketKey(
    date: Date,
    period: DashboardCashFlowPeriod,
  ): string {
    const year = date.getUTCFullYear();

    const month = String(date.getUTCMonth() + 1).padStart(2, '0');

    const day = String(date.getUTCDate()).padStart(2, '0');

    switch (period) {
      case 'DAY':
        return `${year}-${month}-${day}`;

      case 'WEEK':
        return date.toISOString().slice(0, 10);

      case 'MONTH':
        return `${year}-${month}`;

      case 'YEAR':
        return String(year);
    }
  }

  private getNextCashFlowBucket(
    date: Date,
    period: DashboardCashFlowPeriod,
  ): Date {
    const result = new Date(date);

    switch (period) {
      case 'DAY':
        result.setUTCDate(result.getUTCDate() + 1);
        break;

      case 'WEEK':
        result.setUTCDate(result.getUTCDate() + 7);
        break;

      case 'MONTH':
        result.setUTCMonth(result.getUTCMonth() + 1);
        break;

      case 'YEAR':
        result.setUTCFullYear(result.getUTCFullYear() + 1);
        break;
    }

    return result;
  }

  private resolveMonthlySummaryDateRange(options: DashboardQueryOptions): {
    startDate: Date;
    endDate: Date;
  } {
    const now = new Date();

    if (options.startDate || options.endDate) {
      return {
        startDate:
          options.startDate ?? this.getDefaultMonthlySummaryStartDate(),
        endDate: options.endDate ?? now,
      };
    }

    return {
      startDate: this.getDefaultMonthlySummaryStartDate(),
      endDate: now,
    };
  }

  private getDefaultMonthlySummaryStartDate(): Date {
    const date = new Date();

    date.setUTCMonth(
      date.getUTCMonth() - (DASHBOARD_MONTHLY_SUMMARY_DEFAULT_MONTHS - 1),
    );

    date.setUTCDate(1);
    date.setUTCHours(0, 0, 0, 0);

    return date;
  }

  private buildMonthlyFinancialSummaryBuckets(
    transactions: Array<{
      id: string;
      type: 'INCOME' | 'EXPENSE';
      amount: Prisma.Decimal;
      transactionDate: Date;
    }>,
    startDate: Date,
    endDate: Date,
  ) {
    const buckets = new Map<
      string,
      {
        month: string;
        income: Prisma.Decimal;
        expense: Prisma.Decimal;
        transactionCount: number;
      }
    >();

    const cursor = new Date(startDate);

    cursor.setUTCDate(1);
    cursor.setUTCHours(0, 0, 0, 0);

    let iteration = 0;

    while (
      cursor.getTime() <= endDate.getTime() &&
      iteration < DASHBOARD_MONTHLY_SUMMARY_MAX_MONTHS
    ) {
      const month = this.getMonthlySummaryMonthKey(cursor);

      buckets.set(month, {
        month,
        income: new Prisma.Decimal(0),
        expense: new Prisma.Decimal(0),
        transactionCount: 0,
      });

      cursor.setUTCMonth(cursor.getUTCMonth() + 1);

      iteration += 1;
    }

    for (const transaction of transactions) {
      const month = this.getMonthlySummaryMonthKey(transaction.transactionDate);

      const bucket = buckets.get(month);

      if (!bucket) {
        continue;
      }

      if (transaction.type === 'INCOME') {
        bucket.income = bucket.income.plus(transaction.amount);
      } else {
        bucket.expense = bucket.expense.plus(transaction.amount);
      }

      bucket.transactionCount += 1;
    }

    return buckets;
  }

  private getMonthlySummaryMonthKey(date: Date): string {
    const year = date.getUTCFullYear();

    const month = String(date.getUTCMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
  }
}
