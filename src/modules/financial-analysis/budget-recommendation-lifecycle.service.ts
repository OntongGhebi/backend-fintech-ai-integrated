import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';

import { getBudgetMonthRange } from '../budgets/utils/budget-month.util';

import type {
  BudgetRecommendation,
  BudgetRecommendationsResult,
} from './budget-recommendations.service';

type LifecycleStatus =
  'PENDING' | 'ACCEPTED' | 'REJECTED' | 'DEFERRED' | 'APPLIED' | 'EVALUATED';

interface LifecycleOptions {
  month?: string;
  status?: LifecycleStatus;
}

@Injectable()
export class BudgetRecommendationLifecycleService {
  private static readonly DEFAULT_TIMEZONE = 'Asia/Jakarta';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist D.3 output as an immutable financial snapshot.
   * Existing lifecycle records are intentionally not overwritten.
   */
  async persistGenerated(userId: string, result: BudgetRecommendationsResult) {
    if (result.recommendations.length === 0) {
      return result;
    }

    const targetMonth = this.parseMonth(result.targetMonth);

    const financialContext = {
      historyPeriod: result.historyPeriod,
      financialCapacity: result.financialCapacity,
      currency: result.currency,
    } as Prisma.InputJsonValue;

    await this.prisma.$transaction(async (tx) => {
      for (const item of result.recommendations) {
        await tx.budgetRecommendation.upsert({
          where: {
            userId_budgetId_targetMonth: {
              userId,
              budgetId: item.budgetId,
              targetMonth,
            },
          },
          create: this.toCreateInput(
            userId,
            targetMonth,
            item,
            financialContext,
            result.generatedAt,
          ),
          update: {},
        });
      }
    });

    const records = await this.prisma.budgetRecommendation.findMany({
      where: {
        userId,
        targetMonth,
        budgetId: {
          in: result.recommendations.map((item) => item.budgetId),
        },
      },
    });

    const byBudgetId = new Map(
      records.map((record) => [record.budgetId, record]),
    );

    return {
      ...result,
      recommendations: result.recommendations.map((item) => {
        const record = byBudgetId.get(item.budgetId);

        if (!record) {
          return item;
        }

        return {
          ...this.toRecommendationSnapshot(record),
          recommendationId: record.id,
          lifecycle: {
            status: record.status,
            reviewedAt: record.reviewedAt?.toISOString() ?? null,
            deferredUntil: record.deferredUntil?.toISOString() ?? null,
            appliedAt: record.appliedAt?.toISOString() ?? null,
            evaluatedAt: record.evaluatedAt?.toISOString() ?? null,
          },
        };
      }),
    };
  }

  async findAll(userId: string, options: LifecycleOptions = {}) {
    const where: Prisma.BudgetRecommendationWhereInput = {
      userId,
    };

    if (options.status) {
      where.status = options.status;
    }

    if (options.month) {
      where.targetMonth = this.parseMonth(options.month);
    }

    const records = await this.prisma.budgetRecommendation.findMany({
      where,
      orderBy: [{ targetMonth: 'desc' }, { generatedAt: 'desc' }],
    });

    return {
      count: records.length,
      recommendations: records,
    };
  }

  async findOne(userId: string, recommendationId: string) {
    return this.findOwnedOrThrow(userId, recommendationId);
  }

  async accept(userId: string, recommendationId: string) {
    return this.transition(userId, recommendationId, ['PENDING', 'DEFERRED'], {
      status: 'ACCEPTED',
      reviewedAt: new Date(),
      deferredUntil: null,
      rejectionReason: null,
    });
  }

  async reject(userId: string, recommendationId: string, reason?: string) {
    return this.transition(userId, recommendationId, ['PENDING', 'DEFERRED'], {
      status: 'REJECTED',
      reviewedAt: new Date(),
      deferredUntil: null,
      rejectionReason: reason?.trim() || null,
    });
  }

  async defer(
    userId: string,
    recommendationId: string,
    deferredUntilValue: string,
  ) {
    const record = await this.findOwnedOrThrow(userId, recommendationId);

    if (!['PENDING', 'DEFERRED'].includes(record.status)) {
      throw new ConflictException(
        `Recommendation cannot be deferred from ${record.status} status`,
      );
    }

    const deferredUntil = new Date(deferredUntilValue);

    if (Number.isNaN(deferredUntil.getTime()) || deferredUntil <= new Date()) {
      throw new BadRequestException('deferredUntil must be a future date');
    }

    const timezone = await this.getTimezone(userId);

    const targetRange = getBudgetMonthRange(record.targetMonth, timezone);

    if (deferredUntil >= targetRange.start) {
      throw new BadRequestException(
        'deferredUntil must be earlier than the target month',
      );
    }

    const updated = await this.prisma.budgetRecommendation.updateMany({
      where: {
        id: recommendationId,
        userId,
        status: {
          in: ['PENDING', 'DEFERRED'],
        },
      },
      data: {
        status: 'DEFERRED',
        deferredUntil,
        reviewedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      throw new ConflictException(
        'Recommendation was changed by another request. Refresh and try again.',
      );
    }

    return this.findOwnedOrThrow(userId, recommendationId);
  }

  /**
   * Apply an accepted recommendation to the target month's allocation.
   *
   * This operation is transactional:
   * 1. Validate ownership and lifecycle status.
   * 2. Validate budget and target month.
   * 3. Detect allocation changes since recommendation generation.
   * 4. Upsert BudgetAllocation.
   * 5. Mark recommendation as APPLIED.
   */
  async apply(userId: string, recommendationId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const recommendation = await tx.budgetRecommendation.findFirst({
          where: {
            id: recommendationId,
            userId,
          },
        });

        if (!recommendation) {
          throw new NotFoundException('Budget recommendation not found');
        }

        if (recommendation.status !== 'ACCEPTED') {
          throw new ConflictException(
            'Only accepted recommendations can be applied',
          );
        }

        if (!['INCREASE', 'DECREASE'].includes(recommendation.action)) {
          throw new ConflictException(
            'Only increase or decrease recommendations can change a budget allocation',
          );
        }

        const targetMonth = recommendation.targetMonth;

        const budget = await tx.budget.findFirst({
          where: {
            id: recommendation.budgetId,
            userId,
            deletedAt: null,
          },
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            allocations: {
              where: {
                periodStart: {
                  lte: targetMonth,
                },
              },
              orderBy: {
                periodStart: 'desc',
              },
              take: 1,
            },
          },
        });

        if (!budget || budget.status !== 'ACTIVE') {
          throw new ConflictException('The related budget is no longer active');
        }

        const timezone = await this.getTimezone(userId, tx);

        const targetRange = getBudgetMonthRange(targetMonth, timezone);

        const currentRange = getBudgetMonthRange(new Date(), timezone);

        if (targetRange.periodStart < currentRange.periodStart) {
          throw new ConflictException(
            'Historical budget allocations cannot be modified',
          );
        }

        const budgetStartMonth = new Date(
          Date.UTC(
            budget.startDate.getUTCFullYear(),
            budget.startDate.getUTCMonth(),
            1,
          ),
        );

        if (targetRange.periodStart < budgetStartMonth) {
          throw new ConflictException(
            'Target month is earlier than the budget start month',
          );
        }

        if (budget.endDate) {
          const budgetEndMonth = new Date(
            Date.UTC(
              budget.endDate.getUTCFullYear(),
              budget.endDate.getUTCMonth(),
              1,
            ),
          );

          if (targetRange.periodStart > budgetEndMonth) {
            throw new ConflictException(
              'Target month is later than the budget end month',
            );
          }
        }

        const latestAllocation = budget.allocations[0];

        if (!latestAllocation) {
          throw new ConflictException(
            'No monthly allocation exists to validate this recommendation',
          );
        }

        const expectedCurrent = new Prisma.Decimal(
          recommendation.currentAllocation,
        );

        const actualCurrent = new Prisma.Decimal(latestAllocation.amount);

        if (!actualCurrent.equals(expectedCurrent)) {
          throw new ConflictException(
            'Budget allocation changed after this recommendation was generated. Generate a new recommendation before applying it.',
          );
        }

        const proposed = new Prisma.Decimal(recommendation.proposedAllocation);

        await tx.budgetAllocation.upsert({
          where: {
            budgetId_periodStart: {
              budgetId: recommendation.budgetId,
              periodStart: targetRange.periodStart,
            },
          },
          create: {
            budgetId: recommendation.budgetId,
            periodStart: targetRange.periodStart,
            amount: proposed,
            previousAmount: actualCurrent,
            source: 'ACCEPTED_RECOMMENDATION',
            recommendationId,
          },
          update: {
            amount: proposed,
            previousAmount: actualCurrent,
            source: 'ACCEPTED_RECOMMENDATION',
            recommendationId,
          },
        });

        await tx.budgetRecommendation.update({
          where: {
            id: recommendationId,
          },
          data: {
            status: 'APPLIED',
            appliedAt: new Date(),
          },
        });

        return tx.budgetRecommendation.findUnique({
          where: {
            id: recommendationId,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  /**
   * Evaluate an applied recommendation after its target month ends.
   */
  async evaluate(userId: string, recommendationId: string) {
    const recommendation = await this.findOwnedOrThrow(
      userId,
      recommendationId,
    );

    if (recommendation.status === 'EVALUATED') {
      return recommendation;
    }

    if (recommendation.status !== 'APPLIED') {
      throw new ConflictException(
        'Only applied recommendations can be evaluated',
      );
    }

    const timezone = await this.getTimezone(userId);

    const targetRange = getBudgetMonthRange(
      recommendation.targetMonth,
      timezone,
    );

    if (new Date() < targetRange.end) {
      throw new ConflictException(
        'Recommendation can only be evaluated after the target month has ended',
      );
    }

    const transactions = recommendation.categoryId
      ? await this.prisma.transaction.findMany({
          where: {
            userId,
            categoryId: recommendation.categoryId,
            type: 'EXPENSE',
            status: 'ACTIVE',
            currency: 'IDR',
            deletedAt: null,
            transactionDate: {
              gte: targetRange.start,
              lt: targetRange.end,
            },
          },
          select: {
            amount: true,
          },
        })
      : [];

    const actualSpend = transactions.reduce(
      (sum, transaction) => sum.plus(new Prisma.Decimal(transaction.amount)),
      new Prisma.Decimal(0),
    );

    const proposedAllocation = new Prisma.Decimal(
      recommendation.proposedAllocation,
    );

    const evaluationStatus =
      transactions.length === 0
        ? 'NO_ACTIVITY'
        : actualSpend.lessThanOrEqualTo(proposedAllocation)
          ? 'WITHIN_ALLOCATION'
          : 'OVER_ALLOCATION';

    const evaluation = {
      targetMonth: this.monthKey(recommendation.targetMonth),
      actualSpend: actualSpend.toString(),
      proposedAllocation: proposedAllocation.toString(),
      previousAllocation: recommendation.currentAllocation.toString(),
      variance: actualSpend.minus(proposedAllocation).toString(),
      utilizationPercentage: proposedAllocation.isZero()
        ? null
        : actualSpend
            .dividedBy(proposedAllocation)
            .times(100)
            .toDecimalPlaces(2)
            .toNumber(),
      transactionCount: transactions.length,
      evaluatedAt: new Date().toISOString(),
    } as Prisma.InputJsonValue;

    return this.prisma.budgetRecommendation.update({
      where: {
        id: recommendationId,
      },
      data: {
        status: 'EVALUATED',
        evaluationStatus,
        evaluation,
        evaluatedAt: new Date(),
      },
    });
  }

  private async transition(
    userId: string,
    recommendationId: string,
    allowedStatuses: LifecycleStatus[],
    data: Prisma.BudgetRecommendationUpdateManyMutationInput,
  ) {
    const existing = await this.findOwnedOrThrow(userId, recommendationId);

    if (!allowedStatuses.includes(existing.status)) {
      throw new ConflictException(
        `Recommendation cannot be changed from ${existing.status} status`,
      );
    }

    const result = await this.prisma.budgetRecommendation.updateMany({
      where: {
        id: recommendationId,
        userId,
        status: {
          in: allowedStatuses,
        },
      },
      data,
    });

    if (result.count !== 1) {
      throw new ConflictException(
        'Recommendation was changed by another request. Refresh and try again.',
      );
    }

    return this.findOwnedOrThrow(userId, recommendationId);
  }

  private async findOwnedOrThrow(userId: string, recommendationId: string) {
    const record = await this.prisma.budgetRecommendation.findFirst({
      where: {
        id: recommendationId,
        userId,
      },
    });

    if (!record) {
      throw new NotFoundException('Budget recommendation not found');
    }

    return record;
  }

  private async getTimezone(
    userId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const preference = await client.userPreference.findUnique({
      where: {
        userId,
      },
      select: {
        timezone: true,
      },
    });

    return (
      preference?.timezone ??
      BudgetRecommendationLifecycleService.DEFAULT_TIMEZONE
    );
  }

  private parseMonth(value: string): Date {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
      throw new BadRequestException('month must use YYYY-MM format');
    }

    const [year, month] = value.split('-').map(Number);

    return new Date(Date.UTC(year, month - 1, 1));
  }

  private monthKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
      2,
      '0',
    )}`;
  }

  private toCreateInput(
    userId: string,
    targetMonth: Date,
    item: BudgetRecommendation,
    financialContext: Prisma.InputJsonValue,
    generatedAt: string,
  ): Prisma.BudgetRecommendationCreateInput {
    return {
      user: {
        connect: { id: userId },
      },
      budget: {
        connect: { id: item.budgetId },
      },
      targetMonth,
      budgetName: item.budgetName,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      action: item.action,
      currentAllocation: new Prisma.Decimal(item.currentAllocation),
      proposedAllocation: new Prisma.Decimal(item.proposedAllocation),
      changeAmount: new Prisma.Decimal(item.changeAmount),
      changePercentage: item.changePercentage,
      averageMonthlySpend: new Prisma.Decimal(item.averageMonthlySpend),
      transactionCount: item.transactionCount,
      monthsWithActivity: item.monthsWithActivity,
      spendingTrend: item.spendingTrend,
      monthlySpending: item.monthlySpending.map(
        ({ month, amount, transactionCount }) => ({
          month,
          amount,
          transactionCount,
        }),
      ),
      reason: item.reason,
      guardrails: item.guardrails,
      aiExplanation: item.aiExplanation,
      aiWhyItMatters: item.aiWhyItMatters,
      aiSuggestedActions: item.aiSuggestedActions,
      financialContext,
      generatedAt: new Date(generatedAt),
    };
  }

  private toRecommendationSnapshot(record: Prisma.BudgetRecommendationModel) {
    return {
      budgetId: record.budgetId,
      budgetName: record.budgetName,
      categoryId: record.categoryId,
      categoryName: record.categoryName,
      action: record.action,
      currentAllocation: record.currentAllocation.toString(),
      proposedAllocation: record.proposedAllocation.toString(),
      changeAmount: record.changeAmount.toString(),
      changePercentage: record.changePercentage?.toNumber() ?? null,
      averageMonthlySpend: record.averageMonthlySpend.toString(),
      transactionCount: record.transactionCount,
      monthsWithActivity: record.monthsWithActivity,
      spendingTrend: record.spendingTrend,
      monthlySpending: record.monthlySpending,
      reason: record.reason,
      guardrails: record.guardrails,
      aiExplanation: record.aiExplanation,
      aiWhyItMatters: record.aiWhyItMatters,
      aiSuggestedActions: record.aiSuggestedActions,
    };
  }
}
