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

    const { start, end } = this.getCurrentMonthRange(now, timezone);

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
      { amount: number; transactionCount: number }
    >();

    for (const transaction of expenseTransactions) {
      const category = transaction.category?.name ?? 'Tanpa kategori';
      const existing = categoryTotals.get(category) ?? {
        amount: 0,
        transactionCount: 0,
      };

      existing.amount += Number(transaction.amount);
      existing.transactionCount += 1;
      categoryTotals.set(category, existing);
    }

    const totalIncome = Number(income._sum.amount ?? 0);
    const totalExpense = Number(expense._sum.amount ?? 0);

    const budgetResults = await Promise.all(
      budgets.map(async (budget) => {
        const budgetStart = new Date(
          Math.max(budget.startDate.getTime(), start.getTime()),
        );
        const budgetEnd = new Date(
          Math.min(budget.endDate?.getTime() ?? end.getTime(), end.getTime()),
        );

        const spentResult = await this.prisma.transaction.aggregate({
          where: {
            userId,
            deletedAt: null,
            status: 'ACTIVE',
            type: 'EXPENSE',
            currency,
            transactionDate: {
              gte: budgetStart,
              lt: budgetEnd,
            },
            ...(budget.categoryId ? { categoryId: budget.categoryId } : {}),
          },
          _sum: { amount: true },
        });

        const limit = Number(budget.amount);
        const spent = Number(spentResult._sum.amount ?? 0);

        return {
          name: budget.name,
          category: budget.category?.name ?? null,
          limit: this.money(limit),
          spent: this.money(spent),
          remaining: this.money(limit - spent),
          usagePercentage:
            limit > 0 ? Math.round((spent / limit) * 10000) / 100 : 0,
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
        totalIncome: this.money(totalIncome),
        totalExpense: this.money(totalExpense),
        netCashFlow: this.money(totalIncome - totalExpense),
        incomeTransactionCount: income._count._all,
        expenseTransactionCount: expense._count._all,
      },
      expensesByCategory: [...categoryTotals.entries()]
        .map(([category, value]) => ({
          category,
          amount: this.money(value.amount),
          transactionCount: value.transactionCount,
        }))
        .sort((a, b) => Number(b.amount) - Number(a.amount)),
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

  private money(value: number): string {
    return value.toFixed(2);
  }

  private getCurrentMonthRange(
    now: Date,
    timezone: string,
  ): { start: Date; end: Date } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(now);

    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);

    const start = this.localMidnightToUtc(year, month, timezone);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    return {
      start,
      end: this.localMidnightToUtc(nextYear, nextMonth, timezone),
    };
  }

  private localMidnightToUtc(
    year: number,
    month: number,
    timezone: string,
  ): Date {
    const targetUtc = Date.UTC(year, month - 1, 1, 0, 0, 0);
    let result = targetUtc;

    for (let i = 0; i < 3; i += 1) {
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

      const value = (type: string) =>
        Number(formatted.find((part) => part.type === type)?.value);

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
}
