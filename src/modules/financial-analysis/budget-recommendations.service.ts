import { Injectable, Logger, BadRequestException } from '@nestjs/common';

import { BudgetScopeType, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';

import { AIService } from '../ai/services/ai.service';
import { AI_USAGE_FEATURES } from '../ai/constants/ai-usage.constants';

import type { AICompletionUsage } from '../ai/types/ai.types';

import { getBudgetMonthRange } from '../budgets/utils/budget-month.util';
import { BudgetScopeEngine } from '../budgets/budget-scope.engine';

import {
  buildBudgetRecommendationsMessages,
  BudgetRecommendationPromptItem,
} from './utils/budget-recommendations-prompt.util';

export type BudgetRecommendationAction =
  'INCREASE' | 'DECREASE' | 'MAINTAIN' | 'REVIEW';

export type BudgetRecommendationTrend = 'INCREASED' | 'DECREASED' | 'UNCHANGED';

export type BudgetRecommendationsStatus = 'GENERATED' | 'NO_RECOMMENDATIONS';

export type BudgetRecommendationAIStatus =
  'GENERATED' | 'UNAVAILABLE' | 'SKIPPED';

export type BudgetRecommendationExclusionReason =
  | 'BUDGET_PERIOD_EXPIRED'
  | 'BUDGET_NOT_STARTED'
  | 'MISSING_CATEGORY'
  | 'MISSING_SCOPE'
  | 'EMPTY_CUSTOM_SCOPE'
  | 'INVALID_CATEGORY_TYPE'
  | 'INACTIVE_CATEGORY'
  | 'NO_ALLOCATION';

export interface BudgetRecommendationExcludedBudget {
  budgetId: string;
  budgetName: string;
  reason: BudgetRecommendationExclusionReason;
  message: string;
}

export interface BudgetRecommendationEligibility {
  totalActiveBudgets: number;
  eligibleBudgetCount: number;
  excludedBudgetCount: number;
  excludedBudgets: BudgetRecommendationExcludedBudget[];
}

export interface BudgetRecommendationMonthlySpending {
  month: string;
  amount: string;
  transactionCount: number;
}

export interface BudgetRecommendation {
  budgetId: string;
  budgetName: string;

  categoryId: string | null;
  categoryName: string;

  action: BudgetRecommendationAction;

  currentAllocation: string;
  proposedAllocation: string;
  changeAmount: string;
  changePercentage: number | null;

  averageMonthlySpend: string;

  transactionCount: number;
  monthsWithActivity: number;

  spendingTrend: BudgetRecommendationTrend;

  monthlySpending: BudgetRecommendationMonthlySpending[];

  reason: string;
  guardrails: string[];

  aiExplanation: string | null;
  aiWhyItMatters: string | null;
  aiSuggestedActions: string[];
}

export interface BudgetRecommendationsResult {
  generatedAt: string;

  currency: 'IDR';

  status: BudgetRecommendationsStatus;

  targetMonth: string;

  historyPeriod: {
    startDate: string;
    endDate: string;
  };

  eligibility: BudgetRecommendationEligibility;

  financialCapacity: {
    averageMonthlyIncome: string;
    averageMonthlyExpense: string;
    averageMonthlyNetCashFlow: string;

    currentTotalAllocation: string;
    proposedTotalAllocation: string;

    maximumAllocationLimit: string;
    availableIncreaseCapacity: string;
  };

  recommendations: BudgetRecommendation[];

  ai: {
    status: BudgetRecommendationAIStatus;
    provider: string | null;
    model: string | null;
    usage?: AICompletionUsage;
  };

  message?: string;
}

interface RawAIExplanation {
  budgetId?: unknown;
  explanation?: unknown;
  whyItMatters?: unknown;
  suggestedActions?: unknown;
}

interface RawAIExplanationResponse {
  explanations?: unknown;
}

interface BudgetSpendingAccumulator {
  totalAmount: Prisma.Decimal;
  transactionCount: number;
  monthlyAmounts: Map<string, Prisma.Decimal>;
  monthlyTransactionCounts: Map<string, number>;
}

interface RecommendationCandidate {
  budgetId: string;
  budgetName: string;
  categoryId: string | null;
  categoryName: string;
  scopeType: BudgetScopeType;
  resolvedCategoryIds: string[] | null;

  currentAllocation: Prisma.Decimal;

  averageMonthlySpend: Prisma.Decimal;

  transactionCount: number;
  monthsWithActivity: number;

  spendingTrend: BudgetRecommendationTrend;

  monthlySpending: BudgetRecommendationMonthlySpending[];

  duplicateScopeBudget: boolean;
}

const HISTORY_MONTHS = 3;

const MINIMUM_TRANSACTION_COUNT = 2;
const MINIMUM_ACTIVE_MONTHS = 2;

const INCREASE_THRESHOLD = new Prisma.Decimal('1.10');
const DECREASE_THRESHOLD = new Prisma.Decimal('0.65');

const INCREASE_BUFFER = new Prisma.Decimal('1.10');
const DECREASE_BUFFER = new Prisma.Decimal('1.15');

const MINIMUM_RETAINED_ALLOCATION = new Prisma.Decimal('0.70');

const MAXIMUM_ALLOCATION_PERCENTAGE = new Prisma.Decimal('0.90');
const MAXIMUM_SURPLUS_ALLOCATION_PERCENTAGE = new Prisma.Decimal('0.50');

const ALLOCATION_ROUNDING_UNIT = new Prisma.Decimal('1000');

const MAX_AI_ACTIONS = 3;

@Injectable()
export class BudgetRecommendationsService {
  private readonly logger = new Logger(BudgetRecommendationsService.name);

  private static readonly DEFAULT_TIMEZONE = 'Asia/Jakarta';

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AIService,
    private readonly budgetScopeEngine: BudgetScopeEngine,
  ) {}

  async generate(
    userId: string,
    options: {
      month?: string;
    } = {},
  ): Promise<BudgetRecommendationsResult> {
    const preference = await this.prisma.userPreference.findUnique({
      where: {
        userId,
      },
      select: {
        timezone: true,
      },
    });

    const timezone =
      preference?.timezone ?? BudgetRecommendationsService.DEFAULT_TIMEZONE;

    const targetRange = this.resolveTargetMonth(options.month, timezone);

    const targetMonth = this.getMonthKey(targetRange.periodStart);

    const historyStartReference = new Date(
      Date.UTC(
        targetRange.periodStart.getUTCFullYear(),
        targetRange.periodStart.getUTCMonth() - HISTORY_MONTHS,
        15,
        12,
      ),
    );

    const historyStartRange = getBudgetMonthRange(
      historyStartReference,
      timezone,
    );

    const historyMonths = this.buildHistoryMonths(
      targetRange.periodStart,
      timezone,
    );

    const historyPeriod = {
      startDate: historyStartRange.start.toISOString(),
      endDate: new Date(targetRange.start.getTime() - 1).toISOString(),
    };

    const baseResult = {
      generatedAt: new Date().toISOString(),
      currency: 'IDR' as const,
      targetMonth,
      historyPeriod,
    };

    /**
     * Fetch all active budgets instead of filtering by target period
     * in the database query.
     *
     * This allows the service to report why a budget is excluded,
     * including budgets whose validity period has already expired
     * or has not started yet.
     */
    const budgets = await this.prisma.budget.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            isActive: true,
            deletedAt: true,
          },
        },
        scopeCategory: {
          select: {
            id: true,
            name: true,
            type: true,
            isActive: true,
            deletedAt: true,
          },
        },
        categoryScopes: {
          select: {
            categoryId: true,
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                isActive: true,
                deletedAt: true,
              },
            },
          },
          orderBy: {
            categoryId: 'asc',
          },
        },
        allocations: {
          where: {
            periodStart: {
              lte: targetRange.periodStart,
            },
          },
          orderBy: {
            periodStart: 'desc',
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const eligibleBudgets: Array<{
      budget: (typeof budgets)[number];
      categoryId: string | null;
      categoryName: string;
      currentAllocation: Prisma.Decimal;
    }> = [];

    const excludedBudgets: BudgetRecommendationExcludedBudget[] = [];

    /**
     * Eligibility is based on the budget scope, not on the legacy categoryId.
     *
     * ALL_EXPENSES budgets are valid without a category relation.
     * CATEGORY, CATEGORY_GROUP and CUSTOM budgets are validated against
     * their own scope configuration.
     */
    for (const budget of budgets) {
      const allocation = budget.allocations[0];
      const primaryCategory = budget.scopeCategory ?? budget.category;

      let exclusion: BudgetRecommendationExcludedBudget | null = null;

      if (budget.startDate > targetRange.periodEndDate) {
        exclusion = {
          budgetId: budget.id,
          budgetName: budget.name,
          reason: 'BUDGET_NOT_STARTED',
          message: 'Budget belum mulai berlaku pada bulan target.',
        };
      } else if (
        budget.endDate !== null &&
        budget.endDate < targetRange.periodStart
      ) {
        exclusion = {
          budgetId: budget.id,
          budgetName: budget.name,
          reason: 'BUDGET_PERIOD_EXPIRED',
          message: 'Masa berlaku budget berakhir sebelum bulan target dimulai.',
        };
      } else if (!allocation) {
        exclusion = {
          budgetId: budget.id,
          budgetName: budget.name,
          reason: 'NO_ALLOCATION',
          message:
            'Belum tersedia alokasi bulanan untuk bulan target atau bulan sebelumnya.',
        };
      } else if (
        budget.scopeType === BudgetScopeType.CATEGORY &&
        !(budget.scopeCategoryId ?? budget.categoryId)
      ) {
        exclusion = {
          budgetId: budget.id,
          budgetName: budget.name,
          reason: 'MISSING_SCOPE',
          message: 'Budget kategori belum memiliki kategori cakupan.',
        };
      } else if (
        budget.scopeType === BudgetScopeType.CATEGORY_GROUP &&
        !budget.scopeCategoryId
      ) {
        exclusion = {
          budgetId: budget.id,
          budgetName: budget.name,
          reason: 'MISSING_SCOPE',
          message: 'Budget grup kategori belum memiliki kategori induk.',
        };
      } else if (
        budget.scopeType === BudgetScopeType.CUSTOM &&
        budget.categoryScopes.length === 0
      ) {
        exclusion = {
          budgetId: budget.id,
          budgetName: budget.name,
          reason: 'EMPTY_CUSTOM_SCOPE',
          message: 'Budget kustom belum memiliki kategori yang dipilih.',
        };
      } else if (
        budget.scopeType !== BudgetScopeType.ALL_EXPENSES &&
        ((primaryCategory && primaryCategory.type !== 'EXPENSE') ||
          (budget.scopeType === BudgetScopeType.CUSTOM &&
            budget.categoryScopes.some(
              (scope) => scope.category.type !== 'EXPENSE',
            )))
      ) {
        exclusion = {
          budgetId: budget.id,
          budgetName: budget.name,
          reason: 'INVALID_CATEGORY_TYPE',
          message:
            'Rekomendasi alokasi hanya berlaku untuk cakupan kategori pengeluaran.',
        };
      } else if (
        (budget.scopeType === BudgetScopeType.CATEGORY ||
          budget.scopeType === BudgetScopeType.CATEGORY_GROUP) &&
        primaryCategory &&
        (!primaryCategory.isActive || primaryCategory.deletedAt)
      ) {
        exclusion = {
          budgetId: budget.id,
          budgetName: budget.name,
          reason: 'INACTIVE_CATEGORY',
          message:
            'Kategori cakupan budget sedang tidak aktif atau sudah dihapus.',
        };
      }

      if (exclusion) {
        excludedBudgets.push(exclusion);
        continue;
      }

      if (!allocation) {
        continue;
      }

      let categoryName: string;

      switch (budget.scopeType) {
        case BudgetScopeType.ALL_EXPENSES:
          categoryName = 'Semua Pengeluaran';
          break;

        case BudgetScopeType.CATEGORY:
        case BudgetScopeType.CATEGORY_GROUP:
          categoryName = primaryCategory?.name ?? budget.name;
          break;

        case BudgetScopeType.CUSTOM:
          categoryName = `Kategori kustom (${budget.categoryScopes.length} kategori)`;
          break;

        default:
          categoryName = budget.name;
      }

      eligibleBudgets.push({
        budget,
        categoryId: budget.categoryId ?? budget.scopeCategoryId ?? null,
        categoryName,
        currentAllocation: new Prisma.Decimal(allocation.amount),
      });
    }

    /**
     * Resolve each eligible budget independently.
     *
     * null means ALL_EXPENSES, including uncategorized transactions.
     * An array means only transactions belonging to the resolved IDs.
     */
    const candidates: RecommendationCandidate[] = await Promise.all(
      eligibleBudgets.map(async (candidate) => ({
        budgetId: candidate.budget.id,
        budgetName: candidate.budget.name,
        categoryId: candidate.categoryId,
        categoryName: candidate.categoryName,
        scopeType: candidate.budget.scopeType,
        resolvedCategoryIds: await this.budgetScopeEngine.resolveCategoryIds({
          scopeType: candidate.budget.scopeType,
          scopeCategoryId: candidate.budget.scopeCategoryId,
          categoryId: candidate.budget.categoryId,
          categoryScopes: candidate.budget.categoryScopes,
        }),
        currentAllocation: candidate.currentAllocation,
        averageMonthlySpend: new Prisma.Decimal(0),
        transactionCount: 0,
        monthsWithActivity: 0,
        spendingTrend: 'UNCHANGED',
        monthlySpending: [],
        duplicateScopeBudget: false,
      })),
    );

    /**
     * Detect duplicate budgets using their resolved scope.
     *
     * This replaces the old categoryId-only duplicate detection.
     * Two budgets are considered duplicates when their effective category
     * sets are identical, or both represent ALL_EXPENSES.
     */
    const scopeCounts = new Map<string, number>();

    for (const candidate of candidates) {
      const scopeKey =
        candidate.resolvedCategoryIds === null
          ? 'ALL_EXPENSES'
          : `CATEGORIES:${candidate.resolvedCategoryIds.join(',')}`;

      scopeCounts.set(scopeKey, (scopeCounts.get(scopeKey) ?? 0) + 1);
    }

    for (const candidate of candidates) {
      const scopeKey =
        candidate.resolvedCategoryIds === null
          ? 'ALL_EXPENSES'
          : `CATEGORIES:${candidate.resolvedCategoryIds.join(',')}`;

      candidate.duplicateScopeBudget = (scopeCounts.get(scopeKey) ?? 0) > 1;
    }

    /**
     * Eligibility summary is returned for both:
     * - GENERATED
     * - NO_RECOMMENDATIONS
     */
    const eligibility: BudgetRecommendationEligibility = {
      totalActiveBudgets: budgets.length,
      eligibleBudgetCount: candidates.length,
      excludedBudgetCount: excludedBudgets.length,
      excludedBudgets,
    };

    if (candidates.length === 0) {
      return {
        ...baseResult,
        status: 'NO_RECOMMENDATIONS',
        eligibility,
        financialCapacity: {
          averageMonthlyIncome: '0',
          averageMonthlyExpense: '0',
          averageMonthlyNetCashFlow: '0',
          currentTotalAllocation: '0',
          proposedTotalAllocation: '0',
          maximumAllocationLimit: '0',
          availableIncreaseCapacity: '0',
        },
        recommendations: [],
        ai: {
          status: 'SKIPPED',
          provider: null,
          model: null,
        },
        message:
          'Belum tersedia budget dengan cakupan pengeluaran dan alokasi bulanan yang dapat dianalisis untuk bulan target.',
      };
    }

    /**
     * Preserve the single batch transaction query.
     *
     * If at least one budget uses ALL_EXPENSES, do not restrict categoryId.
     * This ensures uncategorized transactions are included.
     *
     * Otherwise, query the union of all resolved category IDs once.
     */
    const allExpenseScopeExists = candidates.some(
      (candidate) => candidate.resolvedCategoryIds === null,
    );

    const categoryIdsForQuery = allExpenseScopeExists
      ? null
      : [
          ...new Set(
            candidates.flatMap(
              (candidate) => candidate.resolvedCategoryIds ?? [],
            ),
          ),
        ];

    const transactionWhere: Prisma.TransactionWhereInput = {
      userId,
      deletedAt: null,
      status: 'ACTIVE',
      currency: 'IDR',
      transactionDate: {
        gte: historyStartRange.start,
        lt: targetRange.start,
      },
    };

    const transactionScopeWhere: Prisma.TransactionWhereInput = {
      ...transactionWhere,
      type: 'EXPENSE',
      ...(categoryIdsForQuery === null
        ? {}
        : { categoryId: { in: categoryIdsForQuery } }),
    };

    const [incomeAggregate, expenseAggregate, scopedTransactions] =
      await Promise.all([
        this.prisma.transaction.aggregate({
          where: {
            ...transactionWhere,
            type: 'INCOME',
          },
          _sum: {
            amount: true,
          },
        }),

        this.prisma.transaction.aggregate({
          where: {
            ...transactionWhere,
            type: 'EXPENSE',
          },
          _sum: {
            amount: true,
          },
        }),

        this.prisma.transaction.findMany({
          where: transactionScopeWhere,
          select: {
            categoryId: true,
            amount: true,
            transactionDate: true,
          },
          orderBy: {
            transactionDate: 'asc',
          },
        }),
      ]);

    const totalIncome = new Prisma.Decimal(incomeAggregate._sum.amount ?? 0);

    const totalExpense = new Prisma.Decimal(expenseAggregate._sum.amount ?? 0);

    const averageMonthlyIncome = totalIncome
      .dividedBy(HISTORY_MONTHS)
      .toDecimalPlaces(4);

    const averageMonthlyExpense = totalExpense
      .dividedBy(HISTORY_MONTHS)
      .toDecimalPlaces(4);

    const averageMonthlyNetCashFlow = averageMonthlyIncome
      .minus(averageMonthlyExpense)
      .toDecimalPlaces(4);

    /**
     * Calculate spending separately for every budget scope.
     *
     * A transaction may legitimately be included in multiple budgets when
     * their scopes overlap. Each budget is evaluated independently.
     */
    const recommendationCandidates: RecommendationCandidate[] = candidates.map(
      (candidate) => {
        const spending = this.buildScopedSpending(
          scopedTransactions,
          candidate.resolvedCategoryIds,
          historyMonths,
          timezone,
        );

        const monthlySpending = historyMonths.map((month) => {
          const amount =
            spending.monthlyAmounts.get(month.key) ?? new Prisma.Decimal(0);

          const transactionCount =
            spending.monthlyTransactionCounts.get(month.key) ?? 0;

          return {
            month: month.label,
            amount: amount.toString(),
            transactionCount,
          };
        });

        const averageMonthlySpend = spending.totalAmount
          .dividedBy(HISTORY_MONTHS)
          .toDecimalPlaces(4);

        const monthsWithActivity = monthlySpending.filter(
          (month) => month.transactionCount > 0,
        ).length;

        const firstMonthAmount = new Prisma.Decimal(
          monthlySpending[0]?.amount ?? 0,
        );

        const lastMonthAmount = new Prisma.Decimal(
          monthlySpending[monthlySpending.length - 1]?.amount ?? 0,
        );

        const spendingTrend = lastMonthAmount.greaterThan(firstMonthAmount)
          ? 'INCREASED'
          : lastMonthAmount.lessThan(firstMonthAmount)
            ? 'DECREASED'
            : 'UNCHANGED';

        return {
          ...candidate,
          averageMonthlySpend,
          transactionCount: spending.transactionCount,
          monthsWithActivity,
          spendingTrend,
          monthlySpending,
        };
      },
    );

    const currentTotalAllocation = recommendationCandidates.reduce(
      (total, candidate) => total.plus(candidate.currentAllocation),
      new Prisma.Decimal(0),
    );

    const maximumAllocationLimit = averageMonthlyIncome
      .times(MAXIMUM_ALLOCATION_PERCENTAGE)
      .toDecimalPlaces(4);

    const allocationHeadroom = maximumAllocationLimit
      .minus(currentTotalAllocation)
      .greaterThan(0)
      ? maximumAllocationLimit.minus(currentTotalAllocation)
      : new Prisma.Decimal(0);

    const positiveCashFlowCapacity = averageMonthlyNetCashFlow.greaterThan(0)
      ? averageMonthlyNetCashFlow
          .times(MAXIMUM_SURPLUS_ALLOCATION_PERCENTAGE)
          .toDecimalPlaces(4)
      : new Prisma.Decimal(0);

    let availableIncreaseCapacity = allocationHeadroom.lessThan(
      positiveCashFlowCapacity,
    )
      ? allocationHeadroom
      : positiveCashFlowCapacity;

    const initialAvailableIncreaseCapacity = availableIncreaseCapacity;

    recommendationCandidates.sort((a, b) => {
      const ratioA = a.averageMonthlySpend.dividedBy(a.currentAllocation);

      const ratioB = b.averageMonthlySpend.dividedBy(b.currentAllocation);

      return ratioB.comparedTo(ratioA);
    });

    const recommendations: BudgetRecommendation[] =
      recommendationCandidates.map((candidate) => {
        const recommendation = this.buildRecommendation(
          candidate,
          availableIncreaseCapacity,
        );

        if (recommendation.action === 'INCREASE') {
          const increaseAmount = new Prisma.Decimal(
            recommendation.changeAmount,
          );

          availableIncreaseCapacity = availableIncreaseCapacity
            .minus(increaseAmount)
            .greaterThan(0)
            ? availableIncreaseCapacity.minus(increaseAmount)
            : new Prisma.Decimal(0);
        }

        return recommendation;
      });

    const proposedTotalAllocation = recommendations.reduce(
      (total, recommendation) => total.plus(recommendation.proposedAllocation),
      new Prisma.Decimal(0),
    );

    const aiResult = await this.generateAIExplanations(userId, recommendations);

    const enrichedRecommendations = recommendations.map((recommendation) => {
      const explanation = aiResult.explanations.get(recommendation.budgetId);

      return {
        ...recommendation,
        aiExplanation: explanation?.explanation ?? null,
        aiWhyItMatters: explanation?.whyItMatters ?? null,
        aiSuggestedActions: explanation?.suggestedActions ?? [],
      };
    });

    return {
      ...baseResult,
      status: 'GENERATED',
      eligibility,
      financialCapacity: {
        averageMonthlyIncome: averageMonthlyIncome.toString(),
        averageMonthlyExpense: averageMonthlyExpense.toString(),
        averageMonthlyNetCashFlow: averageMonthlyNetCashFlow.toString(),

        currentTotalAllocation: currentTotalAllocation.toString(),
        proposedTotalAllocation: proposedTotalAllocation.toString(),

        maximumAllocationLimit: maximumAllocationLimit.toString(),

        availableIncreaseCapacity: initialAvailableIncreaseCapacity.toString(),
      },
      recommendations: enrichedRecommendations,
      ai: {
        status: aiResult.status,
        provider: aiResult.provider,
        model: aiResult.model,
        ...(aiResult.usage ? { usage: aiResult.usage } : {}),
      },
    };
  }

  private resolveTargetMonth(
    requestedMonth: string | undefined,
    timezone: string,
  ) {
    let referenceDate: Date;

    if (requestedMonth) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)) {
        throw new BadRequestException('month must use YYYY-MM format');
      }

      const [year, month] = requestedMonth.split('-').map(Number);

      referenceDate = new Date(Date.UTC(year, month - 1, 15, 12));
    } else {
      const currentMonth = getBudgetMonthRange(new Date(), timezone);

      referenceDate = new Date(
        Date.UTC(
          currentMonth.periodStart.getUTCFullYear(),
          currentMonth.periodStart.getUTCMonth() + 1,
          15,
          12,
        ),
      );
    }

    const targetRange = getBudgetMonthRange(referenceDate, timezone);

    const currentRange = getBudgetMonthRange(new Date(), timezone);

    if (targetRange.periodStart < currentRange.periodStart) {
      throw new BadRequestException(
        'Historical months cannot be used for budget recommendations',
      );
    }

    return targetRange;
  }

  private buildHistoryMonths(
    targetPeriodStart: Date,
    timezone: string,
  ): Array<{
    key: string;
    label: string;
  }> {
    return Array.from({ length: HISTORY_MONTHS }, (_, index) => {
      const referenceDate = new Date(
        Date.UTC(
          targetPeriodStart.getUTCFullYear(),
          targetPeriodStart.getUTCMonth() - HISTORY_MONTHS + index,
          15,
          12,
        ),
      );

      const range = getBudgetMonthRange(referenceDate, timezone);

      return {
        key: range.periodStart.toISOString().slice(0, 10),
        label: this.getMonthKey(range.periodStart),
      };
    });
  }

  private getMonthKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
  }

  /**
   * Calculate transaction totals for one resolved budget scope.
   *
   * null categoryIds means ALL_EXPENSES and deliberately includes
   * transactions where categoryId is null.
   */
  private buildScopedSpending(
    transactions: Array<{
      categoryId: string | null;
      amount: Prisma.Decimal;
      transactionDate: Date;
    }>,
    categoryIds: string[] | null,
    historyMonths: Array<{
      key: string;
      label: string;
    }>,
    timezone: string,
  ): BudgetSpendingAccumulator {
    const result: BudgetSpendingAccumulator = {
      totalAmount: new Prisma.Decimal(0),
      transactionCount: 0,
      monthlyAmounts: new Map(),
      monthlyTransactionCounts: new Map(),
    };

    const allowedCategoryIds =
      categoryIds === null ? null : new Set(categoryIds);

    for (const transaction of transactions) {
      if (
        allowedCategoryIds !== null &&
        (transaction.categoryId === null ||
          !allowedCategoryIds.has(transaction.categoryId))
      ) {
        continue;
      }

      const monthRange = getBudgetMonthRange(
        transaction.transactionDate,
        timezone,
      );

      const monthKey = monthRange.periodStart.toISOString().slice(0, 10);

      if (!historyMonths.some((month) => month.key === monthKey)) {
        continue;
      }

      result.totalAmount = result.totalAmount.plus(transaction.amount);
      result.transactionCount += 1;

      result.monthlyAmounts.set(
        monthKey,
        (result.monthlyAmounts.get(monthKey) ?? new Prisma.Decimal(0)).plus(
          transaction.amount,
        ),
      );

      result.monthlyTransactionCounts.set(
        monthKey,
        (result.monthlyTransactionCounts.get(monthKey) ?? 0) + 1,
      );
    }

    return result;
  }

  private buildRecommendation(
    candidate: RecommendationCandidate,
    availableIncreaseCapacity: Prisma.Decimal,
  ): BudgetRecommendation {
    const current = candidate.currentAllocation;
    const averageSpend = candidate.averageMonthlySpend;

    let action: BudgetRecommendationAction = 'MAINTAIN';

    let proposed = current;

    let reason = '';

    const guardrails = [
      'Rekomendasi belum mengubah alokasi anggaran secara otomatis.',
      'Nominal usulan dihitung dari alokasi bulanan dan transaksi aktual.',
    ];

    if (candidate.duplicateScopeBudget) {
      action = 'REVIEW';
      reason =
        'Terdapat lebih dari satu budget aktif dengan cakupan pengeluaran yang sama. Struktur budget perlu ditinjau agar realisasi tidak dihitung ganda.';
    } else if (
      candidate.transactionCount < MINIMUM_TRANSACTION_COUNT ||
      candidate.monthsWithActivity < MINIMUM_ACTIVE_MONTHS
    ) {
      action = 'REVIEW';
      reason =
        'Riwayat transaksi dalam cakupan budget belum cukup konsisten untuk menjadi dasar perubahan alokasi.';
    } else if (averageSpend.isZero()) {
      action = 'REVIEW';
      reason =
        'Belum terdapat pengeluaran yang cukup dalam cakupan budget untuk menentukan kebutuhan alokasi secara andal.';
    } else if (averageSpend.greaterThan(current.times(INCREASE_THRESHOLD))) {
      const desiredAllocation = this.roundUpToThousand(
        averageSpend.times(INCREASE_BUFFER),
      );

      const desiredIncrease = desiredAllocation.minus(current);

      if (
        availableIncreaseCapacity.isZero() ||
        desiredIncrease.lessThanOrEqualTo(0)
      ) {
        action = 'REVIEW';
        reason =
          'Pengeluaran rata-rata melebihi alokasi saat ini, tetapi kapasitas arus kas belum mendukung kenaikan anggaran yang aman.';
      } else {
        const allowedIncrease = availableIncreaseCapacity.lessThan(
          desiredIncrease,
        )
          ? availableIncreaseCapacity
          : desiredIncrease;

        if (allowedIncrease.lessThan(ALLOCATION_ROUNDING_UNIT)) {
          action = 'REVIEW';
          reason =
            'Kapasitas tambahan yang tersedia terlalu kecil untuk menghasilkan perubahan alokasi yang bermakna.';
        } else {
          action = 'INCREASE';
          proposed = current.plus(allowedIncrease);

          reason = allowedIncrease.lessThan(desiredIncrease)
            ? 'Pengeluaran rata-rata secara konsisten melampaui alokasi. Kenaikan dibatasi oleh kapasitas arus kas yang tersedia.'
            : 'Pengeluaran rata-rata secara konsisten melampaui alokasi. Penyesuaian disarankan agar anggaran lebih sesuai dengan pola aktual.';
        }
      }
    } else if (averageSpend.lessThan(current.times(DECREASE_THRESHOLD))) {
      const bufferedSpend = averageSpend.times(DECREASE_BUFFER);

      const minimumRetained = current.times(MINIMUM_RETAINED_ALLOCATION);

      const desiredAllocation = this.roundUpToThousand(
        bufferedSpend.greaterThan(minimumRetained)
          ? bufferedSpend
          : minimumRetained,
      );

      if (desiredAllocation.lessThan(current)) {
        action = 'DECREASE';
        proposed = desiredAllocation;

        reason =
          'Pengeluaran rata-rata berada cukup jauh di bawah alokasi saat ini. Penurunan terbatas disarankan dengan tetap mempertahankan ruang cadangan.';
      } else {
        action = 'MAINTAIN';
        reason =
          'Alokasi saat ini masih sesuai dengan kebutuhan pengeluaran setelah mempertimbangkan ruang cadangan.';
      }
    } else {
      action = 'MAINTAIN';
      reason =
        'Pengeluaran rata-rata masih berada dalam rentang yang wajar terhadap alokasi saat ini.';
    }

    const changeAmount = proposed.minus(current);

    const changePercentage = current.greaterThan(0)
      ? changeAmount.dividedBy(current).times(100).toDecimalPlaces(2).toNumber()
      : null;

    if (action === 'INCREASE') {
      guardrails.push(
        'Kenaikan dibatasi oleh kapasitas arus kas dan batas total alokasi.',
      );
    }

    if (action === 'DECREASE') {
      guardrails.push(
        'Penurunan dibatasi maksimal tiga puluh persen dari alokasi saat ini.',
      );
    }

    return {
      budgetId: candidate.budgetId,
      budgetName: candidate.budgetName,

      categoryId: candidate.categoryId,
      categoryName: candidate.categoryName,

      action,

      currentAllocation: current.toString(),
      proposedAllocation: proposed.toString(),
      changeAmount: changeAmount.toString(),
      changePercentage,

      averageMonthlySpend: averageSpend.toString(),

      transactionCount: candidate.transactionCount,
      monthsWithActivity: candidate.monthsWithActivity,

      spendingTrend: candidate.spendingTrend,

      monthlySpending: candidate.monthlySpending,

      reason,
      guardrails,

      aiExplanation: null,
      aiWhyItMatters: null,
      aiSuggestedActions: [],
    };
  }

  private roundUpToThousand(amount: Prisma.Decimal): Prisma.Decimal {
    return amount
      .dividedBy(ALLOCATION_ROUNDING_UNIT)
      .ceil()
      .times(ALLOCATION_ROUNDING_UNIT);
  }

  private async generateAIExplanations(
    userId: string,
    recommendations: BudgetRecommendation[],
  ): Promise<{
    status: BudgetRecommendationAIStatus;
    provider: string | null;
    model: string | null;
    usage?: AICompletionUsage;
    explanations: Map<
      string,
      {
        explanation: string;
        whyItMatters: string;
        suggestedActions: string[];
      }
    >;
  }> {
    const emptyResult = {
      provider: null,
      model: null,
      explanations: new Map<
        string,
        {
          explanation: string;
          whyItMatters: string;
          suggestedActions: string[];
        }
      >(),
    };

    if (recommendations.length === 0) {
      return {
        ...emptyResult,
        status: 'SKIPPED',
      };
    }

    const promptItems: BudgetRecommendationPromptItem[] = recommendations.map(
      (recommendation) => ({
        budgetId: recommendation.budgetId,
        categoryName: recommendation.categoryName,
        action: recommendation.action,
        reason: recommendation.reason,
        spendingTrend: recommendation.spendingTrend,
      }),
    );

    try {
      const completion = await this.aiService.complete(
        {
          messages: buildBudgetRecommendationsMessages(promptItems),
          temperature: 0.2,
          maxTokens: 1800,
          responseFormat: 'text',
        },
        {
          userId,
          feature: AI_USAGE_FEATURES.BUDGET_RECOMMENDATIONS,
        },
      );

      const parsed = this.parseAIResponse(completion.content);

      const explanations = this.normalizeAIExplanations(
        parsed,
        recommendations,
      );

      if (explanations.size === 0) {
        return {
          ...emptyResult,
          status: 'UNAVAILABLE',
        };
      }

      return {
        status: 'GENERATED',
        provider: completion.provider,
        model: completion.model,
        usage: completion.usage,
        explanations,
      };
    } catch (error) {
      this.logger.warn(
        `AI budget recommendation explanation unavailable for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );

      return {
        ...emptyResult,
        status: 'UNAVAILABLE',
      };
    }
  }

  private parseAIResponse(content: string): RawAIExplanationResponse {
    const normalized = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    let parsed: unknown;

    try {
      parsed = JSON.parse(normalized);
    } catch {
      throw new Error(
        'AI returned an invalid budget recommendation JSON response',
      );
    }

    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error('AI returned an invalid response structure');
    }

    const response = parsed as RawAIExplanationResponse;

    if (!Array.isArray(response.explanations)) {
      throw new Error('AI response does not contain an explanations array');
    }

    return response;
  }

  private normalizeAIExplanations(
    response: RawAIExplanationResponse,
    recommendations: BudgetRecommendation[],
  ): Map<
    string,
    {
      explanation: string;
      whyItMatters: string;
      suggestedActions: string[];
    }
  > {
    const allowedBudgetIds = new Set(
      recommendations.map((item) => item.budgetId),
    );

    const result = new Map<
      string,
      {
        explanation: string;
        whyItMatters: string;
        suggestedActions: string[];
      }
    >();

    if (!Array.isArray(response.explanations)) {
      return result;
    }

    for (const value of response.explanations) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }

      const raw = value as RawAIExplanation;

      if (
        typeof raw.budgetId !== 'string' ||
        !allowedBudgetIds.has(raw.budgetId) ||
        result.has(raw.budgetId)
      ) {
        continue;
      }

      const explanation = this.normalizeAIText(raw.explanation, 500);

      const whyItMatters = this.normalizeAIText(raw.whyItMatters, 400);

      if (!explanation || !whyItMatters) {
        continue;
      }

      result.set(raw.budgetId, {
        explanation,
        whyItMatters,
        suggestedActions: this.normalizeAIActions(raw.suggestedActions),
      });
    }

    return result;
  }

  private normalizeAIText(value: unknown, maxLength: number): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();

    if (
      !normalized ||
      normalized.length > maxLength ||
      /[\d%]/.test(normalized) ||
      /\b(?:rp|idr)\b/i.test(normalized)
    ) {
      return null;
    }

    return normalized;
  }

  private normalizeAIActions(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(
        (item) =>
          item.length > 0 &&
          item.length <= 240 &&
          !/[\d%]/.test(item) &&
          !/\b(?:rp|idr)\b/i.test(item),
      )
      .slice(0, MAX_AI_ACTIONS);
  }
}
