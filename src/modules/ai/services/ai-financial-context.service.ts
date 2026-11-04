/* eslint-disable @typescript-eslint/no-base-to-string */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  getBudgetMonthRange,
  getZonedDateBoundary,
  getZonedNextDateBoundary,
} from '../../budgets/utils/budget-month.util';

interface BudgetRange {
  start: Date;
  end: Date;
}

interface BudgetWithRange {
  budget: {
    id: string;
    name: string;
    amount: Prisma.Decimal | number | string;
    period: 'MONTHLY';
    periodStart: Date;
    startDate: Date;
    endDate: Date | null;
    categoryId: string | null;
  };
  range: BudgetRange;
}

interface FinancialContextOptions {
  currency: string;
  timezone: string;
}

@Injectable()
export class AIFinancialContextService {
  private readonly logger = new Logger(AIFinancialContextService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getContext(userId: string) {
    const preference = await this.prisma.userPreference.findUnique({
      where: { userId },
      select: {
        currency: true,
        timezone: true,
      },
    });

    const options: FinancialContextOptions = {
      currency: preference?.currency ?? 'IDR',
      timezone: preference?.timezone ?? 'Asia/Jakarta',
    };

    const now = new Date();
    const monthRange = getBudgetMonthRange(now, options.timezone);

    const transactionFilter = {
      userId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      currency: options.currency,
      transactionDate: {
        gte: monthRange.start,
        lt: monthRange.end,
      },
    };

    const [
      incomeAggregate,
      expenseAggregate,
      expenses,
      recentTransactions,
      budgets,
    ] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          ...transactionFilter,
          type: 'INCOME',
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),

      this.prisma.transaction.aggregate({
        where: {
          ...transactionFilter,
          type: 'EXPENSE',
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),

      this.prisma.transaction.findMany({
        where: {
          ...transactionFilter,
          type: 'EXPENSE',
        },
        select: {
          amount: true,
          category: {
            select: {
              name: true,
            },
          },
        },
      }),

      this.prisma.transaction.findMany({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          currency: options.currency,
        },
        orderBy: {
          transactionDate: 'desc',
        },
        take: 10,
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          description: true,
          transactionDate: true,
          category: {
            select: {
              name: true,
            },
          },
          account: {
            select: {
              name: true,
            },
          },
        },
      }),

      this.prisma.budget.findMany({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          startDate: { lte: monthRange.periodEndDate },
          OR: [{ endDate: null }, { endDate: { gte: monthRange.periodStart } }],
        },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          categoryId: true,
          allocations: {
            where: { periodStart: monthRange.periodStart },
            take: 1,
            select: { amount: true, periodStart: true },
          },
        },
      }),
    ]);

    const budgetsWithRanges: BudgetWithRange[] = budgets
      .flatMap((budget) => {
        const allocation = budget.allocations[0];
        if (!allocation) return [];

        const budgetForContext = {
          ...budget,
          amount: allocation.amount,
          period: 'MONTHLY' as const,
          periodStart: allocation.periodStart,
        };

        return [
          {
            budget: budgetForContext,
            range: this.getBudgetRange(
              budget,
              monthRange,
              now,
              options.timezone,
            ),
          },
        ];
      })
      .filter(({ range }) => range.start < range.end);

    /*
     * Optimization:
     * Previously, each budget caused an additional aggregate query.
     * Fetch transactions once for the union of all valid budget ranges.
     */
    let budgetTransactions: Array<{
      transactionDate: Date;
      amount: Prisma.Decimal | number | string;
      categoryId: string | null;
    }> = [];

    if (budgetsWithRanges.length > 0) {
      const earliestStart = new Date(
        Math.min(
          ...budgetsWithRanges.map(({ range }) => range.start.getTime()),
        ),
      );

      const latestEnd = new Date(
        Math.max(...budgetsWithRanges.map(({ range }) => range.end.getTime())),
      );

      budgetTransactions = await this.prisma.transaction.findMany({
        where: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          type: 'EXPENSE',
          currency: options.currency,
          transactionDate: {
            gte: earliestStart,
            lt: latestEnd,
          },
        },
        select: {
          transactionDate: true,
          amount: true,
          categoryId: true,
        },
      });
    }

    const budgetContext = budgetsWithRanges.map(({ budget, range }) => {
      let spentMinorUnits = 0n;

      for (const transaction of budgetTransactions) {
        const transactionTime = transaction.transactionDate.getTime();

        if (
          transactionTime < range.start.getTime() ||
          transactionTime >= range.end.getTime()
        ) {
          continue;
        }

        if (
          budget.categoryId !== null &&
          transaction.categoryId !== budget.categoryId
        ) {
          continue;
        }

        spentMinorUnits += this.toMinorUnits(transaction.amount);
      }

      const limitMinorUnits = this.toMinorUnits(budget.amount);
      const remainingMinorUnits = limitMinorUnits - spentMinorUnits;

      const usagePercentage =
        limitMinorUnits > 0n
          ? Number((spentMinorUnits * 10000n) / limitMinorUnits) / 100
          : 0;

      return {
        id: budget.id,
        name: budget.name,
        currency: options.currency,
        limit: this.formatMinorUnits(limitMinorUnits),
        spent: this.formatMinorUnits(spentMinorUnits),
        remaining: this.formatMinorUnits(remainingMinorUnits),
        usagePercentage,
        period: budget.period,
        periodStart: budget.periodStart,
        startDate: range.start,
        endDate: range.end,
      };
    });

    const incomeMinorUnits = this.toMinorUnits(
      incomeAggregate._sum.amount ?? 0,
    );
    const expenseMinorUnits = this.toMinorUnits(
      expenseAggregate._sum.amount ?? 0,
    );

    const categoryTotals = new Map<string, bigint>();

    for (const expense of expenses) {
      const categoryName = expense.category?.name ?? 'Uncategorized';
      const current = categoryTotals.get(categoryName) ?? 0n;

      categoryTotals.set(
        categoryName,
        current + this.toMinorUnits(expense.amount),
      );
    }

    const expensesByCategory = Array.from(categoryTotals.entries())
      .map(([category, amount]) => ({
        category,
        amount: this.formatMinorUnits(amount),
      }))
      .sort((a, b) => {
        const amountA = BigInt(a.amount.replace('.', ''));
        const amountB = BigInt(b.amount.replace('.', ''));
        return amountB > amountA ? 1 : amountB < amountA ? -1 : 0;
      });

    return {
      currency: options.currency,
      timezone: options.timezone,
      period: {
        start: monthRange.start,
        end: monthRange.end,
      },
      summary: {
        income: this.formatMinorUnits(incomeMinorUnits),
        expense: this.formatMinorUnits(expenseMinorUnits),
        balance: this.formatMinorUnits(incomeMinorUnits - expenseMinorUnits),
        incomeCount: incomeAggregate._count._all,
        expenseCount: expenseAggregate._count._all,
      },
      expensesByCategory,
      recentTransactions: recentTransactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        amount: this.formatMinorUnits(this.toMinorUnits(transaction.amount)),
        currency: transaction.currency,
        description: transaction.description,
        transactionDate: transaction.transactionDate,
        category: transaction.category?.name ?? null,
        account: transaction.account?.name ?? null,
      })),
      budgets: budgetContext,
    };
  }

  private getBudgetRange(
    budget: { startDate: Date; endDate: Date | null },
    monthRange: BudgetRange,
    now: Date,
    timezone: string,
  ): BudgetRange {
    const budgetStart = getZonedDateBoundary(budget.startDate, timezone);
    const budgetEndExclusive = budget.endDate
      ? getZonedNextDateBoundary(budget.endDate, timezone)
      : monthRange.end;

    const start =
      budgetStart > monthRange.start ? budgetStart : monthRange.start;
    const configuredEnd =
      budgetEndExclusive < monthRange.end ? budgetEndExclusive : monthRange.end;
    const maximumEnd = new Date(now.getTime() + 1);
    const end = maximumEnd < configuredEnd ? maximumEnd : configuredEnd;

    return { start, end };
  }

  private toMinorUnits(value: unknown): bigint {
    if (value === null || value === undefined) {
      return 0n;
    }

    const objectString =
      typeof value === 'object' &&
      value !== null &&
      'toString' in value &&
      typeof value.toString === 'function'
        ? value.toString()
        : undefined;
    const normalized =
      typeof value === 'object' && value !== null
        ? objectString !== undefined && objectString !== '[object Object]'
          ? objectString
          : (JSON.stringify(value) ?? '')
        : typeof value === 'string'
          ? value
          : String(value);

    const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);

    if (!match) {
      throw new Error(`Invalid monetary amount: ${normalized}`);
    }

    const sign = match[1] === '-' ? -1n : 1n;
    const whole = BigInt(match[2]);
    const fraction = (match[3] ?? '').padEnd(2, '0').slice(0, 2);

    return sign * (whole * 100n + BigInt(fraction || '0'));
  }

  private formatMinorUnits(value: bigint): string {
    const sign = value < 0n ? '-' : '';
    const absolute = value < 0n ? -value : value;
    const whole = absolute / 100n;
    const fraction = (absolute % 100n).toString().padStart(2, '0');

    return `${sign}${whole}.${fraction}`;
  }
}
