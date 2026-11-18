import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  BudgetScopeDescriptor,
  BudgetScopeEngine,
} from '../../budgets/budget-scope.engine';

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
    scopeType: BudgetScopeDescriptor['scopeType'];
    scopeCategoryId: string | null;
    categoryId: string | null;
    categoryScopes: Array<{
      categoryId: string;
    }>;
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

interface ResolvedRecommendationScope {
  item: RecommendationRecord;
  categoryIds: string[] | null;
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

  constructor(
    private readonly recommendationPrisma: PrismaService,
    private readonly budgetScopeEngine: BudgetScopeEngine,
  ) {
    super(recommendationPrisma, budgetScopeEngine);
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
                scopeType: true,
                scopeCategoryId: true,
                categoryId: true,
                categoryScopes: {
                  select: {
                    categoryId: true,
                  },
                },
              },
            },
          },
        }),
      ],
    );

    const resolvedScopes: ResolvedRecommendationScope[] = await Promise.all(
      recommendations.map(async (item) => ({
        item,
        categoryIds: await this.budgetScopeEngine.resolveCategoryIds({
          scopeType: item.budget.scopeType,
          scopeCategoryId: item.budget.scopeCategoryId,
          categoryId: item.budget.categoryId,
          categoryScopes: item.budget.categoryScopes,
        }),
      })),
    );

    const uniqueCategoryIds = [
      ...new Set(
        resolvedScopes.flatMap(({ categoryIds }) => categoryIds ?? []),
      ),
    ];

    const categories =
      uniqueCategoryIds.length > 0
        ? await this.recommendationPrisma.category.findMany({
            where: {
              id: {
                in: uniqueCategoryIds,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : [];

    const categoryNamesById = new Map(
      categories.map((category) => [category.id, category.name]),
    );

    const mappedRecommendations = resolvedScopes.map(({ item, categoryIds }) =>
      this.mapRecommendation(item, {
        type: item.budget.scopeType,
        categoryNames:
          categoryIds === null
            ? []
            : categoryIds
                .map((categoryId) => categoryNamesById.get(categoryId))
                .filter((name): name is string => Boolean(name)),
        includesUncategorized: categoryIds === null,
      }),
    );

    const statusCounts = this.buildStatusCounts(statusGroups);

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

  private mapRecommendation(
    item: RecommendationRecord,
    budgetScope: {
      type: BudgetScopeDescriptor['scopeType'];
      categoryNames: string[];
      includesUncategorized: boolean;
    },
  ) {
    return {
      id: item.id,
      budgetId: item.budgetId,
      budgetName: item.budget?.name ?? null,
      category: item.budget?.category?.name ?? null,
      budgetScope,
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
