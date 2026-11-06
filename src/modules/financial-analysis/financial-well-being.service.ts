import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma/prisma.service';

import {
  FinancialAnalysisOverview,
  FinancialAnalysisService,
} from './financial-analysis.service';

type RecommendationStatus =
  'PENDING' | 'ACCEPTED' | 'REJECTED' | 'DEFERRED' | 'APPLIED' | 'EVALUATED';

type RecommendationAction = 'INCREASE' | 'DECREASE' | 'MAINTAIN' | 'REVIEW';

interface RecommendationStatusCount {
  status: RecommendationStatus;
  count: number;
}

interface ActionCenterItem {
  id: string;
  budgetId: string;
  targetMonth: Date;
  currentAllocation: unknown;
  proposedAllocation: unknown;
  changeAmount: unknown;
  changePercentage: unknown;
  action: RecommendationAction;
  status: RecommendationStatus;
  reason: string;
  deferredUntil: Date | null;
  createdAt: Date;
}

export interface FinancialWellBeingDashboard {
  generatedAt: string;
  currency: string;
  period: {
    month: string;
    startDate: string;
    endDate: string;
  };
  analysis: FinancialAnalysisOverview;
  recommendations: {
    targetMonth: string;
    total: number;
    statusCounts: RecommendationStatusCount[];
    actionCenter: Array<{
      id: string;
      budgetId: string;
      targetMonth: string;
      currentAllocation: string;
      proposedAllocation: string;
      changeAmount: string;
      changePercentage: string | null;
      action: RecommendationAction;
      status: RecommendationStatus;
      reason: string;
      deferredUntil: string | null;
      createdAt: string;
    }>;
  };
  dataSufficiency: {
    level: 'SUFFICIENT' | 'LIMITED' | 'INSUFFICIENT';
    transactionCount: number;
    budgetCount: number;
    messages: string[];
  };
}

const TIME_ZONE = 'Asia/Jakarta';

const ACTION_CENTER_STATUSES: RecommendationStatus[] = [
  'PENDING',
  'ACCEPTED',
  'DEFERRED',
];

@Injectable()
export class FinancialWellBeingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financialAnalysisService: FinancialAnalysisService,
  ) {}

  async getDashboard(
    userId: string,
    requestedMonth?: string,
  ): Promise<FinancialWellBeingDashboard> {
    const month = requestedMonth ?? this.getCurrentMonth();
    const { startDate, endDate, targetMonth } = this.getMonthRange(month);

    const [analysis, groupedStatuses, actionCenter] = await Promise.all([
      this.financialAnalysisService.getOverview(userId, {
        startDate,
        endDate,
      }),
      this.prisma.budgetRecommendation.groupBy({
        by: ['status'],
        where: {
          userId,
          targetMonth,
        },
        _count: {
          _all: true,
        },
      }),
      this.prisma.budgetRecommendation.findMany({
        where: {
          userId,
          targetMonth,
          status: {
            in: ACTION_CENTER_STATUSES,
          },
        },
        select: {
          id: true,
          budgetId: true,
          targetMonth: true,
          currentAllocation: true,
          proposedAllocation: true,
          changeAmount: true,
          changePercentage: true,
          action: true,
          status: true,
          reason: true,
          deferredUntil: true,
          createdAt: true,
        },
        orderBy: [
          {
            status: 'asc',
          },
          {
            createdAt: 'desc',
          },
        ],
        take: 20,
      }),
    ]);

    const statusCounts = this.buildStatusCounts(groupedStatuses);
    const totalRecommendations = statusCounts.reduce(
      (total, item) => total + item.count,
      0,
    );

    return {
      generatedAt: new Date().toISOString(),
      currency: analysis.currency,
      period: {
        month,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      analysis,
      recommendations: {
        targetMonth: month,
        total: totalRecommendations,
        statusCounts,
        actionCenter: actionCenter.map((item) =>
          this.mapActionCenterItem(item as ActionCenterItem),
        ),
      },
      dataSufficiency: this.assessDataSufficiency(analysis),
    };
  }

  private buildStatusCounts(
    rows: Array<{
      status: RecommendationStatus;
      _count: {
        _all: number;
      };
    }>,
  ): RecommendationStatusCount[] {
    const statusOrder: RecommendationStatus[] = [
      'PENDING',
      'ACCEPTED',
      'REJECTED',
      'DEFERRED',
      'APPLIED',
      'EVALUATED',
    ];

    const counts = new Map<RecommendationStatus, number>(
      rows.map((row) => [row.status, row._count._all]),
    );

    return statusOrder.map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    }));
  }

  private mapActionCenterItem(
    item: ActionCenterItem,
  ): FinancialWellBeingDashboard['recommendations']['actionCenter'][number] {
    return {
      id: item.id,
      budgetId: item.budgetId,
      targetMonth: item.targetMonth.toISOString(),
      currentAllocation: this.toDecimalString(item.currentAllocation),
      proposedAllocation: this.toDecimalString(item.proposedAllocation),
      changeAmount: this.toDecimalString(item.changeAmount),
      changePercentage:
        item.changePercentage === null
          ? null
          : this.toDecimalString(item.changePercentage),
      action: item.action,
      status: item.status,
      reason: item.reason,
      deferredUntil: item.deferredUntil?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private assessDataSufficiency(
    analysis: FinancialAnalysisOverview,
  ): FinancialWellBeingDashboard['dataSufficiency'] {
    const transactionCount = analysis.summary.transactionCount;
    const budgetCount = analysis.budgetHealth.budgetCount;
    const messages: string[] = [];

    if (transactionCount === 0) {
      messages.push(
        'Belum terdapat transaksi pada periode ini. Analisis pola pengeluaran dan arus kas masih terbatas.',
      );
    } else if (transactionCount < 5) {
      messages.push(
        'Jumlah transaksi masih sedikit. Gunakan hasil analisis sebagai indikasi awal, bukan pola keuangan yang sudah stabil.',
      );
    }

    if (budgetCount === 0) {
      messages.push(
        'Belum ada budget aktif pada periode ini. Analisis kesehatan anggaran belum dapat memberikan gambaran menyeluruh.',
      );
    }

    let level: 'SUFFICIENT' | 'LIMITED' | 'INSUFFICIENT';

    if (transactionCount === 0 && budgetCount === 0) {
      level = 'INSUFFICIENT';
    } else if (transactionCount < 5 || budgetCount === 0) {
      level = 'LIMITED';
    } else {
      level = 'SUFFICIENT';
    }

    if (messages.length === 0) {
      messages.push(
        'Data transaksi dan budget tersedia untuk mendukung analisis periode ini.',
      );
    }

    return {
      level,
      transactionCount,
      budgetCount,
      messages,
    };
  }

  private toDecimalString(value: unknown): string {
    if (
      value &&
      typeof value === 'object' &&
      'toString' in value &&
      typeof value.toString === 'function'
    ) {
      return value.toString();
    }

    return String(value);
  }

  private getCurrentMonth(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;

    if (!year || !month) {
      throw new Error('Unable to determine the current Jakarta month');
    }

    return `${year}-${month}`;
  }

  private getMonthRange(month: string): {
    startDate: Date;
    endDate: Date;
    targetMonth: Date;
  } {
    const match = /^(\d{4})-(\d{2})$/.exec(month);

    if (!match) {
      throw new Error('month must use YYYY-MM format');
    }

    const year = Number(match[1]);
    const monthNumber = Number(match[2]);

    if (!Number.isInteger(year) || monthNumber < 1 || monthNumber > 12) {
      throw new Error('Invalid month');
    }

    const startDate = new Date(`${year}-${match[2]}-01T00:00:00.000+07:00`);

    const nextMonthDate = new Date(Date.UTC(year, monthNumber, 1));

    const nextMonthYear = nextMonthDate.getUTCFullYear();
    const nextMonthNumber = String(nextMonthDate.getUTCMonth() + 1).padStart(
      2,
      '0',
    );

    const nextMonthStart = new Date(
      `${nextMonthYear}-${nextMonthNumber}-01T00:00:00.000+07:00`,
    );

    const endDate = new Date(nextMonthStart.getTime() - 1);

    // BudgetRecommendation.targetMonth uses PostgreSQL DATE.
    const targetMonth = new Date(Date.UTC(year, monthNumber - 1, 1));

    return {
      startDate,
      endDate,
      targetMonth,
    };
  }
}
