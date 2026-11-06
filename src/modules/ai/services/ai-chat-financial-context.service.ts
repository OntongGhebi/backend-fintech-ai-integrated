import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma/prisma.service';

import { AIFinancialContextService } from './ai-financial-context.service';

type RecommendationStatus =
  'PENDING' | 'ACCEPTED' | 'REJECTED' | 'DEFERRED' | 'APPLIED' | 'EVALUATED';

type RecommendationAction = 'INCREASE' | 'DECREASE' | 'MAINTAIN' | 'REVIEW';

interface RecommendationRecord {
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
  guardrails: unknown;
  aiExplanation: string | null;
  deferredUntil: Date | null;
  rejectionReason: string | null;
  appliedAt: Date | null;
  evaluatedAt: Date | null;
  evaluationStatus: string | null;
  evaluation: unknown;
  createdAt: Date;
  budget: {
    name: string;
    category: {
      name: string;
    } | null;
  };
}

interface RecommendationStatusGroup {
  status: RecommendationStatus;
  _count: {
    _all: number;
  };
}

interface RecommendationDelegate {
  findMany(args: {
    where: { userId: string };
    orderBy: [{ targetMonth: 'desc' }, { createdAt: 'desc' }];
    take: number;
    select: Record<string, unknown>;
  }): Promise<RecommendationRecord[]>;

  groupBy(args: {
    by: ['status'];
    where: { userId: string };
    _count: { _all: true };
  }): Promise<RecommendationStatusGroup[]>;
}

const RECOMMENDATION_STATUSES: RecommendationStatus[] = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'DEFERRED',
  'APPLIED',
  'EVALUATED',
];

const ACTION_CENTER_STATUSES = new Set<RecommendationStatus>([
  'PENDING',
  'ACCEPTED',
  'DEFERRED',
]);

@Injectable()
export class AIChatFinancialContextService extends AIFinancialContextService {
  private readonly recommendationLimit = 20;

  constructor(private readonly recommendationPrisma: PrismaService) {
    super(recommendationPrisma);
  }

  async getContext(userId: string) {
    const [financialContext, statusGroups, recommendations] = await Promise.all(
      [
        super.getContext(userId),
        this.recommendationDelegate.groupBy({
          by: ['status'],
          where: { userId },
          _count: { _all: true },
        }),
        this.recommendationDelegate.findMany({
          where: { userId },
          orderBy: [{ targetMonth: 'desc' }, { createdAt: 'desc' }],
          take: this.recommendationLimit,
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
            guardrails: true,
            aiExplanation: true,
            deferredUntil: true,
            rejectionReason: true,
            appliedAt: true,
            evaluatedAt: true,
            evaluationStatus: true,
            evaluation: true,
            createdAt: true,
            budget: {
              select: {
                name: true,
                category: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        }),
      ],
    );

    const statusCounts = this.buildStatusCounts(statusGroups);
    const mappedRecommendations = recommendations.map((item) =>
      this.mapRecommendation(item),
    );

    const actionCenter = mappedRecommendations
      .filter((item) => ACTION_CENTER_STATUSES.has(item.status))
      .slice(0, 10);

    const totalRecommendations = Object.values(statusCounts).reduce(
      (total, count) => total + count,
      0,
    );

    return {
      ...financialContext,
      financialWellBeing: {
        generatedAt: new Date().toISOString(),
        recommendationSummary: {
          total: totalRecommendations,
          byStatus: statusCounts,
          returnedRecommendationCount: mappedRecommendations.length,
          isTruncated: totalRecommendations > mappedRecommendations.length,
        },
        actionCenter,
        recentRecommendations: mappedRecommendations,
      },
    };
  }

  private get recommendationDelegate(): RecommendationDelegate {
    return (
      this.recommendationPrisma as unknown as {
        budgetRecommendation: RecommendationDelegate;
      }
    ).budgetRecommendation;
  }

  private buildStatusCounts(
    groups: RecommendationStatusGroup[],
  ): Record<RecommendationStatus, number> {
    const counts = Object.fromEntries(
      RECOMMENDATION_STATUSES.map((status) => [status, 0]),
    ) as Record<RecommendationStatus, number>;

    for (const group of groups) {
      counts[group.status] = group._count._all;
    }

    return counts;
  }

  private mapRecommendation(item: RecommendationRecord) {
    return {
      id: item.id,
      budgetId: item.budgetId,
      budgetName: item.budget?.name ?? null,
      category: item.budget?.category?.name ?? null,
      targetMonth: this.formatMonth(item.targetMonth),
      currentAllocation: this.toNullableDecimalString(item.currentAllocation),
      proposedAllocation: this.toNullableDecimalString(item.proposedAllocation),
      changeAmount: this.toNullableDecimalString(item.changeAmount),
      changePercentage: this.toNullableDecimalString(item.changePercentage),
      action: item.action,
      status: item.status,
      reason: item.reason,
      guardrails: this.toStringArray(item.guardrails),
      aiExplanation: item.aiExplanation,
      deferredUntil: item.deferredUntil?.toISOString() ?? null,
      rejectionReason: item.rejectionReason,
      appliedAt: item.appliedAt?.toISOString() ?? null,
      evaluatedAt: item.evaluatedAt?.toISOString() ?? null,
      evaluationStatus: item.evaluationStatus,
      evaluation: item.evaluation ?? null,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private formatMonth(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
  }

  private toNullableDecimalString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      'toString' in value &&
      typeof value.toString === 'function'
    ) {
      return value.toString();
    }

    return String(value);
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }
}
