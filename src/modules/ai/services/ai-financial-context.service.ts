/* eslint-disable @typescript-eslint/no-base-to-string */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

type BudgetPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';

interface BudgetRange {
  start: Date;
  end: Date;
}

interface BudgetWithRange {
  budget: {
    id: string;
    name: string;
    amount: Prisma.Decimal | number | string;
    currency: string;
    period: BudgetPeriod;
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
    const monthRange = this.getMonthRange(now, options.timezone);

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
          startDate: {
            lt: monthRange.end,
          },
          OR: [{ endDate: null }, { endDate: { gte: monthRange.start } }],
        },
        select: {
          id: true,
          name: true,
          amount: true,
          currency: true,
          period: true,
          startDate: true,
          endDate: true,
          categoryId: true,
        },
      }),
    ]);

    const budgetsWithRanges: BudgetWithRange[] = budgets
      .filter((budget) => budget.currency === options.currency)
      .map((budget) => ({
        budget,
        range: this.getBudgetRange(budget, now, options.timezone),
      }))
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
        currency: budget.currency,
        limit: this.formatMinorUnits(limitMinorUnits),
        spent: this.formatMinorUnits(spentMinorUnits),
        remaining: this.formatMinorUnits(remainingMinorUnits),
        usagePercentage,
        period: budget.period,
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

  private getMonthRange(now: Date, timezone: string): BudgetRange {
    const parts = this.getZonedDateParts(now, timezone);

    const start = this.zonedDateToUtc(
      parts.year,
      parts.month,
      1,
      0,
      0,
      0,
      timezone,
    );

    const nextMonth =
      parts.month === 12
        ? { year: parts.year + 1, month: 1 }
        : { year: parts.year, month: parts.month + 1 };

    const end = this.zonedDateToUtc(
      nextMonth.year,
      nextMonth.month,
      1,
      0,
      0,
      0,
      timezone,
    );

    return { start, end };
  }

  private getBudgetRange(
    budget: {
      period: BudgetPeriod;
      startDate: Date;
      endDate: Date | null;
    },
    now: Date,
    timezone: string,
  ): BudgetRange {
    const local = this.getZonedDateParts(now, timezone);

    let start: Date;
    let end: Date;

    switch (budget.period) {
      case 'DAILY': {
        start = this.zonedDateToUtc(
          local.year,
          local.month,
          local.day,
          0,
          0,
          0,
          timezone,
        );
        end = new Date(now.getTime() + 1);
        break;
      }

      case 'WEEKLY': {
        const localDate = new Date(
          Date.UTC(local.year, local.month - 1, local.day),
        );
        const dayOfWeek = localDate.getUTCDay();
        const daysSinceMonday = (dayOfWeek + 6) % 7;
        localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);

        start = this.zonedDateToUtc(
          localDate.getUTCFullYear(),
          localDate.getUTCMonth() + 1,
          localDate.getUTCDate(),
          0,
          0,
          0,
          timezone,
        );
        end = new Date(now.getTime() + 1);
        break;
      }

      case 'MONTHLY': {
        start = this.zonedDateToUtc(
          local.year,
          local.month,
          1,
          0,
          0,
          0,
          timezone,
        );
        end = new Date(now.getTime() + 1);
        break;
      }

      case 'YEARLY': {
        start = this.zonedDateToUtc(local.year, 1, 1, 0, 0, 0, timezone);
        end = new Date(now.getTime() + 1);
        break;
      }

      case 'CUSTOM': {
        start = new Date(budget.startDate);
        end = budget.endDate ? new Date(budget.endDate) : new Date(now);
        break;
      }

      default: {
        start = new Date(budget.startDate);
        end = budget.endDate ? new Date(budget.endDate) : new Date(now);
      }
    }

    // Respect the budget's configured boundaries.
    if (budget.startDate > start) {
      start = new Date(budget.startDate);
    }

    if (budget.endDate && budget.endDate < end) {
      end = new Date(budget.endDate);
    }

    // Never calculate spending beyond the current instant.
    const maximumEnd = new Date(now.getTime() + 1);

    if (maximumEnd < end) {
      end = maximumEnd;
    }

    return { start, end };
  }

  private getZonedDateParts(
    date: Date,
    timezone: string,
  ): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );

    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
    };
  }

  private zonedDateToUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    timezone: string,
  ): Date {
    const targetUtc = Date.UTC(year, month - 1, day, hour, minute, second);

    let result = targetUtc;

    for (let iteration = 0; iteration < 3; iteration++) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(result));

      const values = Object.fromEntries(
        parts.map((part) => [part.type, Number(part.value)]),
      );

      const representedUtc = Date.UTC(
        values.year,
        values.month - 1,
        values.day,
        values.hour,
        values.minute,
        values.second,
      );

      result += targetUtc - representedUtc;
    }

    return new Date(result);
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
