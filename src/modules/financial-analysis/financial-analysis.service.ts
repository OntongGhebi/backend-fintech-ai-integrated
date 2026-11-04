import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';

import { DashboardService } from '../dashboard/dashboard.service';
import {
  DashboardAggregation,
  DashboardMonthlyFinancialSummaryItem,
} from '../dashboard/types/dashboard.types';

export type FinancialAnalysisSignalSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface FinancialAnalysisSignal {
  code:
    | 'NO_INCOME_DATA'
    | 'NEGATIVE_CASH_FLOW'
    | 'BUDGET_OVER_BUDGET'
    | 'BUDGET_NEAR_LIMIT'
    | 'HIGH_SPENDING_CONCENTRATION';
  severity: FinancialAnalysisSignalSeverity;
  title: string;
  description: string;
  metadata?: Record<string, string | number>;
}

export interface FinancialAnalysisTrend {
  direction: 'INCREASED' | 'DECREASED' | 'UNCHANGED' | 'INSUFFICIENT_DATA';
  previousPeriod: string | null;
  currentPeriod: string | null;
  previousAmount: string | null;
  currentAmount: string | null;
  changeAmount: string | null;
  changePercentage: number | null;
}

export interface FinancialAnalysisOverview {
  generatedAt: string;
  currency: string;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalIncome: string;
    totalExpense: string;
    netCashFlow: string;
    transactionCount: number;
    savingsRate: number | null;
    expenseToIncomeRatio: number | null;
    cashFlowStatus: 'POSITIVE' | 'NEGATIVE' | 'BREAK_EVEN' | 'NO_INCOME_DATA';
  };
  spendingPatterns: {
    totalExpense: string;
    transactionCount: number;
    topCategories: Array<{
      categoryId: string;
      categoryName: string;
      totalAmount: string;
      transactionCount: number;
      percentage: number;
    }>;
    topCategoryConcentration: number;
  };
  budgetHealth: {
    totalAllocation: string;
    totalSpent: string;
    remaining: string;
    utilizationPercentage: number | null;
    budgetCount: number;
    onTrackCount: number;
    nearLimitCount: number;
    overBudgetCount: number;
  };
  trends: {
    monthly: DashboardMonthlyFinancialSummaryItem[];
    income: FinancialAnalysisTrend;
    expense: FinancialAnalysisTrend;
    netCashFlow: FinancialAnalysisTrend;
  };
  signals: FinancialAnalysisSignal[];
}

@Injectable()
export class FinancialAnalysisService {
  private static readonly HIGH_SPENDING_CONCENTRATION_PERCENTAGE = 40;

  constructor(private readonly dashboardService: DashboardService) {}

  async getOverview(
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<FinancialAnalysisOverview> {
    const aggregation = await this.dashboardService.getDashboardAggregation(
      userId,
      options,
    );

    return this.buildOverview(aggregation);
  }

  /**
   * All monetary calculations use Prisma.Decimal.
   * No JavaScript floating-point arithmetic is used for financial values.
   */
  buildOverview(aggregation: DashboardAggregation): FinancialAnalysisOverview {
    const income = new Prisma.Decimal(aggregation.summary.totalIncome);
    const expense = new Prisma.Decimal(aggregation.summary.totalExpense);
    const netCashFlow = new Prisma.Decimal(aggregation.summary.netCashFlow);

    const totalAllocation = new Prisma.Decimal(
      aggregation.budgetPerformance.totalBudgetAmount,
    );
    const totalBudgetSpent = new Prisma.Decimal(
      aggregation.budgetPerformance.totalActualAmount,
    );

    const savingsRate = this.calculatePercentage(netCashFlow, income);

    const expenseToIncomeRatio = this.calculatePercentage(expense, income);

    const budgetUtilization = this.calculatePercentage(
      totalBudgetSpent,
      totalAllocation,
    );

    const monthly = aggregation.monthlyFinancialSummary.months;
    const incomeTrend = this.buildTrend(monthly, 'income');
    const expenseTrend = this.buildTrend(monthly, 'expense');
    const netCashFlowTrend = this.buildTrend(monthly, 'netCashFlow');

    const topCategories = aggregation.categoryAnalytics.categories
      .slice()
      .sort((a, b) => {
        return new Prisma.Decimal(b.totalAmount).comparedTo(
          new Prisma.Decimal(a.totalAmount),
        );
      })
      .map((category) => ({
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        totalAmount: category.totalAmount,
        transactionCount: category.transactionCount,
        percentage: this.toNumber(category.percentage),
      }));

    const topCategoryConcentration =
      topCategories.length > 0 ? topCategories[0].percentage : 0;

    const budgetStatuses = aggregation.budgetPerformance.budgets;

    const onTrackCount = budgetStatuses.filter(
      (budget) => budget.status === 'ON_TRACK',
    ).length;

    const nearLimitCount = budgetStatuses.filter(
      (budget) => budget.status === 'NEAR_LIMIT',
    ).length;

    const overBudgetCount = budgetStatuses.filter(
      (budget) => budget.status === 'OVER_BUDGET',
    ).length;

    const cashFlowStatus =
      income.isZero() && expense.isZero()
        ? 'NO_INCOME_DATA'
        : income.isZero()
          ? 'NO_INCOME_DATA'
          : netCashFlow.greaterThan(0)
            ? 'POSITIVE'
            : netCashFlow.lessThan(0)
              ? 'NEGATIVE'
              : 'BREAK_EVEN';

    const signals = this.buildSignals({
      income,
      expense,
      netCashFlow,
      topCategoryConcentration,
      nearLimitCount,
      overBudgetCount,
    });

    return {
      generatedAt: new Date().toISOString(),
      currency: aggregation.currency,
      period: {
        startDate: aggregation.monthlyFinancialSummary.startDate,
        endDate: aggregation.monthlyFinancialSummary.endDate,
      },
      summary: {
        totalIncome: income.toString(),
        totalExpense: expense.toString(),
        netCashFlow: netCashFlow.toString(),
        transactionCount: aggregation.summary.transactionCount,
        savingsRate,
        expenseToIncomeRatio,
        cashFlowStatus,
      },
      spendingPatterns: {
        totalExpense: expense.toString(),
        transactionCount: aggregation.expense.transactionCount,
        topCategories,
        topCategoryConcentration,
      },
      budgetHealth: {
        totalAllocation: totalAllocation.toString(),
        totalSpent: totalBudgetSpent.toString(),
        remaining: aggregation.budgetPerformance.totalRemainingAmount,
        utilizationPercentage: budgetUtilization,
        budgetCount: budgetStatuses.length,
        onTrackCount,
        nearLimitCount,
        overBudgetCount,
      },
      trends: {
        monthly,
        income: incomeTrend,
        expense: expenseTrend,
        netCashFlow: netCashFlowTrend,
      },
      signals,
    };
  }

  private calculatePercentage(
    numerator: Prisma.Decimal,
    denominator: Prisma.Decimal,
  ): number | null {
    if (denominator.lessThanOrEqualTo(0)) {
      return null;
    }

    return numerator
      .dividedBy(denominator)
      .times(100)
      .toDecimalPlaces(2)
      .toNumber();
  }

  private buildTrend(
    monthly: DashboardMonthlyFinancialSummaryItem[],
    field: 'income' | 'expense' | 'netCashFlow',
  ): FinancialAnalysisTrend {
    if (monthly.length < 2) {
      return {
        direction: 'INSUFFICIENT_DATA',
        previousPeriod: null,
        currentPeriod: monthly[0]?.month ?? null,
        previousAmount: null,
        currentAmount: monthly[0]?.[field] ?? null,
        changeAmount: null,
        changePercentage: null,
      };
    }

    const previous = monthly[monthly.length - 2];
    const current = monthly[monthly.length - 1];

    const previousAmount = new Prisma.Decimal(previous[field]);
    const currentAmount = new Prisma.Decimal(current[field]);
    const changeAmount = currentAmount.minus(previousAmount);

    const direction = changeAmount.greaterThan(0)
      ? 'INCREASED'
      : changeAmount.lessThan(0)
        ? 'DECREASED'
        : 'UNCHANGED';

    const changePercentage = previousAmount.greaterThan(0)
      ? changeAmount
          .dividedBy(previousAmount)
          .times(100)
          .toDecimalPlaces(2)
          .toNumber()
      : null;

    return {
      direction,
      previousPeriod: previous.month,
      currentPeriod: current.month,
      previousAmount: previousAmount.toString(),
      currentAmount: currentAmount.toString(),
      changeAmount: changeAmount.toString(),
      changePercentage,
    };
  }

  private buildSignals(input: {
    income: Prisma.Decimal;
    expense: Prisma.Decimal;
    netCashFlow: Prisma.Decimal;
    topCategoryConcentration: number;
    nearLimitCount: number;
    overBudgetCount: number;
  }): FinancialAnalysisSignal[] {
    const signals: FinancialAnalysisSignal[] = [];

    if (input.income.isZero() && input.expense.greaterThan(0)) {
      signals.push({
        code: 'NO_INCOME_DATA',
        severity: 'WARNING',
        title: 'Belum ada data pemasukan',
        description:
          'Terdapat transaksi pengeluaran, tetapi tidak ditemukan pemasukan pada periode analisis. Rasio pengeluaran terhadap pemasukan dan savings rate tidak dapat dihitung.',
      });
    }

    if (input.netCashFlow.lessThan(0)) {
      signals.push({
        code: 'NEGATIVE_CASH_FLOW',
        severity: 'WARNING',
        title: 'Arus kas bersih negatif',
        description:
          'Total pengeluaran lebih besar daripada total pemasukan pada periode analisis.',
        metadata: {
          netCashFlow: input.netCashFlow.toString(),
        },
      });
    }

    if (input.overBudgetCount > 0) {
      signals.push({
        code: 'BUDGET_OVER_BUDGET',
        severity: 'WARNING',
        title: 'Ada budget yang terlampaui',
        description:
          'Satu atau lebih kategori memiliki pengeluaran yang melebihi alokasi budget pada periode yang dianalisis.',
        metadata: {
          count: input.overBudgetCount,
        },
      });
    }

    if (input.nearLimitCount > 0) {
      signals.push({
        code: 'BUDGET_NEAR_LIMIT',
        severity: 'INFO',
        title: 'Ada budget mendekati batas',
        description:
          'Satu atau lebih kategori telah mendekati batas alokasi budget.',
        metadata: {
          count: input.nearLimitCount,
        },
      });
    }

    if (
      input.topCategoryConcentration >=
      FinancialAnalysisService.HIGH_SPENDING_CONCENTRATION_PERCENTAGE
    ) {
      signals.push({
        code: 'HIGH_SPENDING_CONCENTRATION',
        severity: 'INFO',
        title: 'Pengeluaran terkonsentrasi pada satu kategori',
        description:
          'Satu kategori menyumbang setidaknya 40% dari total pengeluaran pada periode analisis.',
        metadata: {
          percentage: input.topCategoryConcentration,
        },
      });
    }

    return signals;
  }

  private toNumber(value: string): number {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }
}
