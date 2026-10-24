import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';

export interface AIFinancialContext {
  generatedAt: string;
  currency: string;
  timezone: string;
  period: {
    startDate: string;
    endDateExclusive: string;
  };
  summary: {
    totalIncome: string;
    totalExpense: string;
    netCashFlow: string;
    incomeTransactionCount: number;
    expenseTransactionCount: number;
  };
  expensesByCategory: Array<{
    category: string;
    amount: string;
    transactionCount: number;
  }>;
  recentTransactions: Array<{
    date: string;
    type: string;
    amount: string;
    currency: string;
    category: string | null;
    description: string | null;
  }>;
  budgets: Array<{
    name: string;
    category: string | null;
    limit: string;
    spent: string;
    remaining: string;
    usagePercentage: number;
    currency: string;
  }>;
}

interface DateRange {
  start: Date;
  end: Date;
}

interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

@Injectable()
export class AIFinancialContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getContext(userId: string): Promise<AIFinancialContext> {
    const now = new Date();

    const preference = await this.prisma.userPreference.findUnique({
      where: { userId },
      select: { currency: true, timezone: true },
    });

    const currency = preference?.currency ?? 'IDR';
    const timezone = preference?.timezone ?? 'Asia/Jakarta';

    // Validate the timezone early rather than silently producing incorrect
    // financial reporting periods.
    this.getCalendarParts(now, timezone);

    const period = this.getCalendarRange('MONTHLY', now, timezone);
    const { start, end } = period;

    const transactionWhere = {
      userId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      transactionDate: {
        gte: start,
        lt: end,
      },
      currency,
    };

    const [income, expense, expenseTransactions, recentTransactions, budgets] =
      await Promise.all([
        this.prisma.transaction.aggregate({
          where: { ...transactionWhere, type: 'INCOME' },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.transaction.aggregate({
          where: { ...transactionWhere, type: 'EXPENSE' },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.transaction.findMany({
          where: { ...transactionWhere, type: 'EXPENSE' },
          select: {
            amount: true,
            category: { select: { name: true } },
          },
          orderBy: { transactionDate: 'desc' },
        }),
        this.prisma.transaction.findMany({
          where: transactionWhere,
          select: {
            transactionDate: true,
            type: true,
            amount: true,
            currency: true,
            description: true,
            category: { select: { name: true } },
          },
          orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
          take: 10,
        }),
        this.prisma.budget.findMany({
          where: {
            userId,
            deletedAt: null,
            status: 'ACTIVE',
            startDate: { lt: end },
            OR: [{ endDate: null }, { endDate: { gte: start } }],
          },
          select: {
            name: true,
            amount: true,
            startDate: true,
            endDate: true,
            period: true,
            categoryId: true,
            category: { select: { name: true } },
          },
          orderBy: { startDate: 'desc' },
        }),
      ]);

    const categoryTotals = new Map<
      string,
      { amountMinor: bigint; transactionCount: number }
    >();

    for (const transaction of expenseTransactions) {
      const category = transaction.category?.name ?? 'Tanpa kategori';
      const existing = categoryTotals.get(category) ?? {
        amountMinor: 0n,
        transactionCount: 0,
      };

      existing.amountMinor += this.toMinorUnits(transaction.amount);
      existing.transactionCount += 1;
      categoryTotals.set(category, existing);
    }

    const totalIncomeMinor = this.toMinorUnits(income._sum.amount ?? 0);
    const totalExpenseMinor = this.toMinorUnits(expense._sum.amount ?? 0);

    const budgetResults = await Promise.all(
      budgets.map(async (budget) => {
        const budgetRange = this.getBudgetRange(
          budget.period,
          budget.startDate,
          budget.endDate,
          now,
          timezone,
        );

        const spentResult =
          budgetRange.start < budgetRange.end
            ? await this.prisma.transaction.aggregate({
                where: {
                  userId,
                  deletedAt: null,
                  status: 'ACTIVE',
                  type: 'EXPENSE',
                  currency,
                  transactionDate: {
                    gte: budgetRange.start,
                    lt: budgetRange.end,
                  },
                  ...(budget.categoryId
                    ? { categoryId: budget.categoryId }
                    : {}),
                },
                _sum: { amount: true },
              })
            : { _sum: { amount: null } };

        const limitMinor = this.toMinorUnits(budget.amount);
        const spentMinor = this.toMinorUnits(spentResult._sum.amount ?? 0);
        const remainingMinor = limitMinor - spentMinor;

        const usagePercentage =
          limitMinor > 0n
            ? Number((spentMinor * 10000n) / limitMinor) / 100
            : 0;

        return {
          name: budget.name,
          category: budget.category?.name ?? null,
          limit: this.fromMinorUnits(limitMinor),
          spent: this.fromMinorUnits(spentMinor),
          remaining: this.fromMinorUnits(remainingMinor),
          usagePercentage,
          currency,
        };
      }),
    );

    return {
      generatedAt: now.toISOString(),
      currency,
      timezone,
      period: {
        startDate: start.toISOString(),
        endDateExclusive: end.toISOString(),
      },
      summary: {
        totalIncome: this.fromMinorUnits(totalIncomeMinor),
        totalExpense: this.fromMinorUnits(totalExpenseMinor),
        netCashFlow: this.fromMinorUnits(totalIncomeMinor - totalExpenseMinor),
        incomeTransactionCount: income._count._all,
        expenseTransactionCount: expense._count._all,
      },
      expensesByCategory: [...categoryTotals.entries()]
        .map(([category, value]) => ({
          category,
          amount: this.fromMinorUnits(value.amountMinor),
          transactionCount: value.transactionCount,
        }))
        .sort((a, b) => {
          const left = this.toMinorUnits(a.amount);
          const right = this.toMinorUnits(b.amount);
          return left > right ? -1 : left < right ? 1 : 0;
        }),
      recentTransactions: recentTransactions.map((transaction) => ({
        date: transaction.transactionDate.toISOString(),
        type: transaction.type,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        category: transaction.category?.name ?? null,
        description: transaction.description,
      })),
      budgets: budgetResults,
    };
  }

  /**
   * Returns the current calendar period in the user's timezone.
   * The end boundary is exclusive.
   */
  private getCalendarRange(
    period: string,
    now: Date,
    timezone: string,
  ): DateRange {
    const current = this.getCalendarParts(now, timezone);
    let startParts: CalendarParts;
    let endParts: CalendarParts;

    switch (period) {
      case 'DAILY': {
        startParts = current;
        endParts = this.addCalendarDays(current, 1);
        break;
      }

      case 'WEEKLY': {
        const weekday = new Date(
          Date.UTC(current.year, current.month - 1, current.day),
        ).getUTCDay();

        // Monday is the first day of the week.
        const daysSinceMonday = (weekday + 6) % 7;
        startParts = this.addCalendarDays(current, -daysSinceMonday);
        endParts = this.addCalendarDays(startParts, 7);
        break;
      }

      case 'YEARLY': {
        startParts = { year: current.year, month: 1, day: 1 };
        endParts = { year: current.year + 1, month: 1, day: 1 };
        break;
      }

      case 'MONTHLY':
      default: {
        startParts = { year: current.year, month: current.month, day: 1 };
        endParts =
          current.month === 12
            ? { year: current.year + 1, month: 1, day: 1 }
            : { year: current.year, month: current.month + 1, day: 1 };
        break;
      }
    }

    return {
      start: this.localMidnightToUtc(startParts, timezone),
      end: this.localMidnightToUtc(endParts, timezone),
    };
  }

  /**
   * Calculates the relevant spending window for a budget.
   * CUSTOM budgets use their configured date range; recurring budgets use
   * the current calendar cycle, clipped to the configured budget dates.
   */
  private getBudgetRange(
    period: string,
    budgetStart: Date,
    budgetEnd: Date | null,
    now: Date,
    timezone: string,
  ): DateRange {
    let range: DateRange;

    if (period === 'CUSTOM') {
      range = {
        start: budgetStart,
        end: budgetEnd ?? now,
      };
    } else {
      range = this.getCalendarRange(period, now, timezone);
    }

    const start = new Date(
      Math.max(range.start.getTime(), budgetStart.getTime()),
    );

    // Do not include future transactions in the current budget calculation.
    const end = new Date(
      Math.min(
        range.end.getTime(),
        budgetEnd?.getTime() ?? Number.POSITIVE_INFINITY,
        now.getTime() + 1,
      ),
    );

    return { start, end };
  }

  private getCalendarParts(date: Date, timezone: string): CalendarParts {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(date);

    const read = (type: string): number => {
      const value = parts.find((part) => part.type === type)?.value;
      if (!value) {
        throw new Error(`Unable to determine ${type} in timezone ${timezone}`);
      }
      return Number(value);
    };

    return {
      year: read('year'),
      month: read('month'),
      day: read('day'),
    };
  }

  private addCalendarDays(parts: CalendarParts, days: number): CalendarParts {
    const date = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day + days),
    );

    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  }

  private localMidnightToUtc(parts: CalendarParts, timezone: string): Date {
    const targetUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);

    let result = targetUtc;

    // Iteratively solve for the UTC instant that represents local midnight.
    for (let i = 0; i < 4; i += 1) {
      const formatted = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(result));

      const value = (type: string): number => {
        const part = formatted.find((item) => item.type === type)?.value;
        if (!part) {
          throw new Error(`Unable to resolve ${type} for timezone ${timezone}`);
        }
        return Number(part);
      };

      const representedUtc = Date.UTC(
        value('year'),
        value('month') - 1,
        value('day'),
        value('hour'),
        value('minute'),
        value('second'),
      );

      result += targetUtc - representedUtc;
    }

    return new Date(result);
  }

  /**
   * Converts a decimal monetary amount to two-decimal minor units.
   * Prisma Decimal values are stringified before conversion to avoid
   * accumulating binary floating-point errors.
   */
  private toMinorUnits(value: unknown): bigint {
    const raw = String(value);

    if (!/^-?\d+(?:\.\d+)?$/.test(raw)) {
      throw new Error(`Invalid monetary amount: ${raw}`);
    }

    const negative = raw.startsWith('-');
    const unsigned = negative ? raw.slice(1) : raw;
    const [whole, fraction = ''] = unsigned.split('.');
    const paddedFraction = fraction.padEnd(3, '0');

    // Round half up to the currency precision used by this context.
    const cents =
      BigInt(whole) * 100n +
      BigInt(paddedFraction.slice(0, 2) || '0') +
      (Number(paddedFraction[2]) >= 5 ? 1n : 0n);

    return negative ? -cents : cents;
  }

  private fromMinorUnits(value: bigint): string {
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const whole = absolute / 100n;
    const fraction = (absolute % 100n).toString().padStart(2, '0');

    return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
  }
}
