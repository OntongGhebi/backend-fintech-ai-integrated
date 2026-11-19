import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';

import { BudgetScopeEngine } from '../budgets/budget-scope.engine';

import { BudgetRecommendationLifecycleService } from './budget-recommendation-lifecycle.service';

import type { BudgetRecommendationsResult } from './budget-recommendations.service';

describe('BudgetRecommendationLifecycleService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const budgetId = '22222222-2222-4222-8222-222222222222';
  const categoryId = '33333333-3333-4333-8333-333333333333';
  const childCategoryId = '55555555-5555-4555-8555-555555555555';
  const grandchildCategoryId = '77777777-7777-4777-8777-777777777777';
  const secondCategoryId = '66666666-6666-4666-8666-666666666666';
  const recommendationId = '44444444-4444-4444-8444-444444444444';

  let service: BudgetRecommendationLifecycleService;
  let prisma: any;
  let budgetScopeEngine: {
    buildTransactionWhere: jest.Mock;
  };
  let recommendationNotificationService: {
    notifyLifecycleChanged: jest.Mock;
  };

  const recommendationRecord = (overrides: Record<string, unknown> = {}) => ({
    id: recommendationId,
    userId,
    budgetId,
    targetMonth: new Date('2026-12-01T00:00:00.000Z'),
    budgetName: 'Monthly Food',
    categoryId,
    categoryName: 'Food',
    action: 'INCREASE',
    status: 'PENDING',
    currentAllocation: new Prisma.Decimal(500000),
    proposedAllocation: new Prisma.Decimal(600000),
    changeAmount: new Prisma.Decimal(100000),
    changePercentage: new Prisma.Decimal(20),
    averageMonthlySpend: new Prisma.Decimal(550000),
    transactionCount: 8,
    monthsWithActivity: 3,
    spendingTrend: 'INCREASED',
    monthlySpending: [],
    reason: 'Spending exceeds allocation.',
    guardrails: [],
    aiExplanation: null,
    aiWhyItMatters: null,
    aiSuggestedActions: [],
    financialContext: {},
    reviewedAt: null,
    deferredUntil: null,
    rejectionReason: null,
    appliedAt: null,
    evaluatedAt: null,
    evaluationStatus: null,
    evaluation: null,
    generatedAt: new Date('2026-11-06T00:00:00.000Z'),
    createdAt: new Date('2026-11-06T00:00:00.000Z'),
    updatedAt: new Date('2026-11-06T00:00:00.000Z'),
    ...overrides,
  });

  const sourceBudget = (overrides: Record<string, unknown> = {}) => ({
    id: budgetId,
    scopeType: 'CATEGORY',
    scopeCategoryId: categoryId,
    categoryId,
    categoryScopes: [],
    ...overrides,
  });

  const appliedRecommendation = (overrides: Record<string, unknown> = {}) =>
    recommendationRecord({
      targetMonth: new Date('2026-10-01T00:00:00.000Z'),
      status: 'APPLIED',
      ...overrides,
    });

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      budgetRecommendation: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue({
          timezone: 'Asia/Jakarta',
        }),
      },
      budget: {
        findFirst: jest.fn(),
      },
      budgetAllocation: {
        upsert: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma),
    );

    budgetScopeEngine = {
      buildTransactionWhere: jest.fn(
        async (_budget: unknown, baseWhere: Record<string, unknown>) =>
          baseWhere,
      ),
    };

    recommendationNotificationService = {
      notifyLifecycleChanged: jest.fn().mockResolvedValue(undefined),
    };

    prisma.budget.findFirst.mockResolvedValue(sourceBudget());

    service = new BudgetRecommendationLifecycleService(
      prisma as unknown as PrismaService,
      budgetScopeEngine as unknown as BudgetScopeEngine,
      recommendationNotificationService as any,
    );
  });

  describe('persistGenerated', () => {
    it('persists a snapshot once and returns its lifecycle identity', async () => {
      const result: BudgetRecommendationsResult = {
        generatedAt: '2026-11-06T00:00:00.000Z',
        currency: 'IDR',
        status: 'GENERATED',
        targetMonth: '2026-12',
        historyPeriod: {
          startDate: '2026-08-31T17:00:00.000Z',
          endDate: '2026-11-30T16:59:59.999Z',
        },
        financialCapacity: {
          averageMonthlyIncome: '5000000',
          averageMonthlyExpense: '3000000',
          averageMonthlyNetCashFlow: '2000000',
          currentTotalAllocation: '500000',
          proposedTotalAllocation: '600000',
          maximumAllocationLimit: '4500000',
          availableIncreaseCapacity: '1000000',
        },
        recommendations: [
          {
            budgetId,
            budgetName: 'Monthly Food',
            categoryId,
            categoryName: 'Food',
            action: 'INCREASE',
            currentAllocation: '500000',
            proposedAllocation: '600000',
            changeAmount: '100000',
            changePercentage: 20,
            averageMonthlySpend: '550000',
            transactionCount: 8,
            monthsWithActivity: 3,
            spendingTrend: 'INCREASED',
            monthlySpending: [],
            reason: 'Spending exceeds allocation.',
            guardrails: [],
            aiExplanation: null,
            aiWhyItMatters: null,
            aiSuggestedActions: [],
          },
        ],
        ai: {
          status: 'SKIPPED',
          provider: null,
          model: null,
        },
      };

      prisma.budgetRecommendation.upsert.mockResolvedValue({});
      prisma.budgetRecommendation.findMany.mockResolvedValue([
        recommendationRecord(),
      ]);

      const response = await service.persistGenerated(userId, result);

      expect(prisma.budgetRecommendation.upsert).toHaveBeenCalledTimes(1);
      expect(response.recommendations[0]).toMatchObject({
        recommendationId,
        lifecycle: {
          status: 'PENDING',
        },
        proposedAllocation: '600000',
      });
    });

    it('does not create records when no recommendations are available', async () => {
      const result = {
        recommendations: [],
      } as unknown as BudgetRecommendationsResult;

      await service.persistGenerated(userId, result);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('accept and reject', () => {
    it('accepts a pending recommendation and triggers its notification', async () => {
      prisma.budgetRecommendation.findFirst
        .mockResolvedValueOnce(recommendationRecord())
        .mockResolvedValueOnce(recommendationRecord({ status: 'ACCEPTED' }));

      prisma.budgetRecommendation.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.accept(userId, recommendationId);

      expect(prisma.budgetRecommendation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: recommendationId,
            userId,
          }),
          data: expect.objectContaining({
            status: 'ACCEPTED',
          }),
        }),
      );

      expect(result.status).toBe('ACCEPTED');
      expect(
        recommendationNotificationService.notifyLifecycleChanged,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          recommendationId,
          status: 'ACCEPTED',
        }),
      );
    });

    it('rejects a recommendation, stores the reason, and triggers its notification', async () => {
      prisma.budgetRecommendation.findFirst
        .mockResolvedValueOnce(recommendationRecord())
        .mockResolvedValueOnce(
          recommendationRecord({
            status: 'REJECTED',
            rejectionReason: 'This budget is no longer relevant.',
          }),
        );

      prisma.budgetRecommendation.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.reject(
        userId,
        recommendationId,
        'This budget is no longer relevant.',
      );

      expect(result.status).toBe('REJECTED');
      expect(result.rejectionReason).toBe('This budget is no longer relevant.');
      expect(
        recommendationNotificationService.notifyLifecycleChanged,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          recommendationId,
          status: 'REJECTED',
        }),
      );
    });

    it('prevents accepting a recommendation owned by another user', async () => {
      prisma.budgetRecommendation.findFirst.mockResolvedValue(null);

      await expect(
        service.accept('another-user', recommendationId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.budgetRecommendation.updateMany).not.toHaveBeenCalled();
      expect(
        recommendationNotificationService.notifyLifecycleChanged,
      ).not.toHaveBeenCalled();
    });
  });

  describe('defer', () => {
    it('defers a pending recommendation before its target month', async () => {
      prisma.budgetRecommendation.findFirst
        .mockResolvedValueOnce(recommendationRecord())
        .mockResolvedValueOnce(
          recommendationRecord({
            status: 'DEFERRED',
            deferredUntil: new Date('2026-11-20T00:00:00.000Z'),
          }),
        );

      prisma.budgetRecommendation.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.defer(
        userId,
        recommendationId,
        '2026-11-20T00:00:00.000Z',
      );

      expect(result.status).toBe('DEFERRED');
      expect(prisma.budgetRecommendation.updateMany).toHaveBeenCalled();
      expect(
        recommendationNotificationService.notifyLifecycleChanged,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          recommendationId,
          status: 'DEFERRED',
          deferredUntil: new Date('2026-11-20T00:00:00.000Z'),
        }),
      );
    });

    it('rejects a defer date on or after the target month begins', async () => {
      prisma.budgetRecommendation.findFirst.mockResolvedValue(
        recommendationRecord(),
      );

      await expect(
        service.defer(userId, recommendationId, '2026-12-01T00:00:00.000Z'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(
        recommendationNotificationService.notifyLifecycleChanged,
      ).not.toHaveBeenCalled();
    });
  });

  describe('apply', () => {
    it('applies an accepted recommendation using a monthly allocation transaction', async () => {
      prisma.budgetRecommendation.findFirst.mockResolvedValue(
        recommendationRecord({ status: 'ACCEPTED' }),
      );

      prisma.budget.findFirst.mockResolvedValue({
        id: budgetId,
        status: 'ACTIVE',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        allocations: [
          {
            periodStart: new Date('2026-11-01T00:00:00.000Z'),
            amount: new Prisma.Decimal(500000),
          },
        ],
      });

      prisma.budgetRecommendation.updateMany.mockResolvedValue({ count: 1 });
      prisma.budgetAllocation.upsert.mockResolvedValue({});
      prisma.budgetRecommendation.update.mockResolvedValue(
        recommendationRecord({ status: 'APPLIED' }),
      );
      prisma.budgetRecommendation.findUnique.mockResolvedValue(
        recommendationRecord({ status: 'APPLIED' }),
      );

      const result = await service.apply(userId, recommendationId);

      expect(prisma.budgetAllocation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            budgetId,
            amount: new Prisma.Decimal(600000),
            source: 'ACCEPTED_RECOMMENDATION',
            recommendationId,
          }),
        }),
      );

      expect(result?.status).toBe('APPLIED');
      expect(prisma.budgetRecommendation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: recommendationId,
            userId,
            status: 'ACCEPTED',
          },
          data: expect.objectContaining({
            status: 'APPLIED',
          }),
        }),
      );
      expect(
        recommendationNotificationService.notifyLifecycleChanged,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          recommendationId,
          status: 'APPLIED',
        }),
      );
    });

    it('rejects applying a recommendation after its source allocation changed', async () => {
      prisma.budgetRecommendation.findFirst.mockResolvedValue(
        recommendationRecord({ status: 'ACCEPTED' }),
      );

      prisma.budget.findFirst.mockResolvedValue({
        id: budgetId,
        status: 'ACTIVE',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        allocations: [
          {
            periodStart: new Date('2026-11-01T00:00:00.000Z'),
            amount: new Prisma.Decimal(700000),
          },
        ],
      });

      await expect(
        service.apply(userId, recommendationId),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.budgetAllocation.upsert).not.toHaveBeenCalled();
      expect(
        recommendationNotificationService.notifyLifecycleChanged,
      ).not.toHaveBeenCalled();
    });
  });

  describe('evaluate', () => {
    const setupEvaluation = (
      budget = sourceBudget(),
      transactions = [
        { amount: new Prisma.Decimal(300000) },
        { amount: new Prisma.Decimal(200000) },
      ],
    ) => {
      const applied = appliedRecommendation();
      let evaluatedRecord: ReturnType<typeof recommendationRecord> | undefined;

      prisma.budgetRecommendation.findFirst
        .mockReset()
        .mockResolvedValueOnce(applied)
        .mockImplementationOnce(async () => evaluatedRecord);

      prisma.budget.findFirst.mockResolvedValue(budget);
      prisma.transaction.findMany.mockResolvedValue(transactions);

      prisma.budgetRecommendation.updateMany.mockImplementation(
        async ({ where, data }: any) => {
          if (
            where.id !== recommendationId ||
            where.userId !== userId ||
            where.status !== 'APPLIED'
          ) {
            return { count: 0 };
          }

          evaluatedRecord = recommendationRecord({
            ...applied,
            ...data,
          });

          return { count: 1 };
        },
      );

      return applied;
    };

    it('evaluates an applied recommendation after the target month ends', async () => {
      setupEvaluation();

      const result = await service.evaluate(userId, recommendationId);

      expect(result.status).toBe('EVALUATED');
      expect(result.evaluationStatus).toBe('WITHIN_ALLOCATION');
      expect(result.evaluation).toMatchObject({
        actualSpend: '500000',
        proposedAllocation: '600000',
        transactionCount: 2,
      });

      expect(budgetScopeEngine.buildTransactionWhere).toHaveBeenCalledTimes(1);
      expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1);

      expect(prisma.budgetRecommendation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: recommendationId,
            userId,
            status: 'APPLIED',
          },
          data: expect.objectContaining({
            status: 'EVALUATED',
            evaluationStatus: 'WITHIN_ALLOCATION',
          }),
        }),
      );

      expect(
        recommendationNotificationService.notifyLifecycleChanged,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          recommendationId,
          status: 'EVALUATED',
        }),
      );
    });

    it('uses the CATEGORY budget scope when evaluating transactions', async () => {
      const budget = sourceBudget({
        scopeType: 'CATEGORY',
        scopeCategoryId: categoryId,
        categoryId,
        categoryScopes: [],
      });

      setupEvaluation(budget);

      await service.evaluate(userId, recommendationId);

      expect(budgetScopeEngine.buildTransactionWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          id: budgetId,
          scopeType: 'CATEGORY',
          scopeCategoryId: categoryId,
          categoryId,
        }),
        expect.objectContaining({
          userId,
          type: 'EXPENSE',
          status: 'ACTIVE',
          currency: 'IDR',
          deletedAt: null,
          transactionDate: expect.objectContaining({
            gte: expect.any(Date),
            lt: expect.any(Date),
          }),
        }),
      );
    });

    it('evaluates root, child, and grandchild transactions for CATEGORY_GROUP budgets', async () => {
      const budget = sourceBudget({
        scopeType: 'CATEGORY_GROUP',
        scopeCategoryId: categoryId,
        categoryId: null,
        categoryScopes: [],
      });

      const scopedCategoryIds = [
        categoryId,
        childCategoryId,
        grandchildCategoryId,
      ];

      const transactions = [
        { categoryId, amount: new Prisma.Decimal(100000) },
        { categoryId: childCategoryId, amount: new Prisma.Decimal(200000) },
        {
          categoryId: grandchildCategoryId,
          amount: new Prisma.Decimal(300000),
        },
        { categoryId: secondCategoryId, amount: new Prisma.Decimal(900000) },
      ];

      setupEvaluation(budget, transactions);

      budgetScopeEngine.buildTransactionWhere.mockImplementationOnce(
        async (_budget: unknown, baseWhere: Record<string, unknown>) => ({
          ...baseWhere,
          categoryId: {
            in: scopedCategoryIds,
          },
        }),
      );

      prisma.transaction.findMany.mockImplementation(async ({ where }: any) => {
        const allowedCategoryIds = where.categoryId?.in ?? [];

        return transactions.filter((transaction) =>
          allowedCategoryIds.includes(transaction.categoryId),
        );
      });

      const result = await service.evaluate(userId, recommendationId);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: {
              in: scopedCategoryIds,
            },
          }),
          select: {
            amount: true,
          },
        }),
      );

      expect(result.status).toBe('EVALUATED');
      expect(result.evaluationStatus).toBe('WITHIN_ALLOCATION');
      expect(result.evaluation).toMatchObject({
        actualSpend: '600000',
        proposedAllocation: '600000',
        previousAllocation: '500000',
        variance: '0',
        utilizationPercentage: 100,
        transactionCount: 3,
      });

      expect(prisma.budgetRecommendation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: recommendationId,
            userId,
            status: 'APPLIED',
          },
          data: expect.objectContaining({
            status: 'EVALUATED',
            evaluationStatus: 'WITHIN_ALLOCATION',
            evaluation: expect.objectContaining({
              actualSpend: '600000',
              transactionCount: 3,
            }),
          }),
        }),
      );
    });

    it('uses the CUSTOM budget scope when evaluating transactions', async () => {
      const budget = sourceBudget({
        scopeType: 'CUSTOM',
        scopeCategoryId: null,
        categoryId: null,
        categoryScopes: [{ categoryId }, { categoryId: secondCategoryId }],
      });

      setupEvaluation(budget);

      await service.evaluate(userId, recommendationId);

      expect(budgetScopeEngine.buildTransactionWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'CUSTOM',
          categoryScopes: [{ categoryId }, { categoryId: secondCategoryId }],
        }),
        expect.any(Object),
      );

      expect(prisma.transaction.findMany).toHaveBeenCalled();
    });

    it('uses the ALL_EXPENSES budget scope without requiring a category', async () => {
      const budget = sourceBudget({
        scopeType: 'ALL_EXPENSES',
        scopeCategoryId: null,
        categoryId: null,
        categoryScopes: [],
      });

      setupEvaluation(budget);

      await service.evaluate(userId, recommendationId);

      expect(budgetScopeEngine.buildTransactionWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'ALL_EXPENSES',
          scopeCategoryId: null,
          categoryId: null,
        }),
        expect.any(Object),
      );

      const baseWhere =
        budgetScopeEngine.buildTransactionWhere.mock.calls[0][1];

      expect(baseWhere).toEqual(
        expect.objectContaining({
          userId,
          type: 'EXPENSE',
          status: 'ACTIVE',
          currency: 'IDR',
        }),
      );

      expect(prisma.transaction.findMany).toHaveBeenCalled();
    });

    it('includes uncategorized expenses in the ALL_EXPENSES evaluation scope', async () => {
      const budget = sourceBudget({
        scopeType: 'ALL_EXPENSES',
        scopeCategoryId: null,
        categoryId: null,
        categoryScopes: [],
      });

      setupEvaluation(budget);

      await service.evaluate(userId, recommendationId);

      const baseWhere =
        budgetScopeEngine.buildTransactionWhere.mock.calls[0][1];

      expect(baseWhere).not.toHaveProperty('categoryId');
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: baseWhere,
        }),
      );
    });

    it('passes the evaluation period and financial filters to the scope engine', async () => {
      setupEvaluation();

      await service.evaluate(userId, recommendationId);

      const [, baseWhere] =
        budgetScopeEngine.buildTransactionWhere.mock.calls[0];

      expect(baseWhere).toEqual(
        expect.objectContaining({
          userId,
          type: 'EXPENSE',
          status: 'ACTIVE',
          currency: 'IDR',
          deletedAt: null,
          transactionDate: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
        }),
      );
    });

    it('calculates OVER_ALLOCATION when actual spending exceeds the proposed allocation', async () => {
      setupEvaluation(sourceBudget(), [
        { amount: new Prisma.Decimal(400000) },
        { amount: new Prisma.Decimal(300000) },
      ]);

      const result = await service.evaluate(userId, recommendationId);

      expect(result.evaluationStatus).toBe('OVER_ALLOCATION');
      expect(result.evaluation).toMatchObject({
        actualSpend: '700000',
        proposedAllocation: '600000',
        variance: '100000',
        transactionCount: 2,
      });
    });

    it('sets NO_ACTIVITY when the budget scope has no transactions', async () => {
      setupEvaluation(sourceBudget(), []);

      const result = await service.evaluate(userId, recommendationId);

      expect(result.evaluationStatus).toBe('NO_ACTIVITY');
      expect(result.evaluation).toMatchObject({
        actualSpend: '0',
        transactionCount: 0,
      });
    });

    it('does not evaluate before the target month has ended', async () => {
      prisma.budgetRecommendation.findFirst.mockResolvedValue(
        recommendationRecord({ status: 'APPLIED' }),
      );

      await expect(
        service.evaluate(userId, recommendationId),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.budget.findFirst).not.toHaveBeenCalled();
      expect(budgetScopeEngine.buildTransactionWhere).not.toHaveBeenCalled();
      expect(
        recommendationNotificationService.notifyLifecycleChanged,
      ).not.toHaveBeenCalled();
    });

    it('rejects evaluating a recommendation that has not been applied', async () => {
      prisma.budgetRecommendation.findFirst.mockResolvedValue(
        recommendationRecord({ status: 'ACCEPTED' }),
      );

      await expect(
        service.evaluate(userId, recommendationId),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.budget.findFirst).not.toHaveBeenCalled();
    });

    it('returns an already evaluated recommendation without recalculating it', async () => {
      const evaluated = recommendationRecord({
        status: 'EVALUATED',
        evaluatedAt: new Date('2026-11-01T00:00:00.000Z'),
        evaluationStatus: 'WITHIN_ALLOCATION',
      });

      prisma.budgetRecommendation.findFirst.mockResolvedValue(evaluated);

      const result = await service.evaluate(userId, recommendationId);

      expect(result).toBe(evaluated);
      expect(prisma.budget.findFirst).not.toHaveBeenCalled();
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
      expect(budgetScopeEngine.buildTransactionWhere).not.toHaveBeenCalled();
      expect(prisma.budgetRecommendation.updateMany).not.toHaveBeenCalled();
      expect(
        recommendationNotificationService.notifyLifecycleChanged,
      ).not.toHaveBeenCalled();
    });

    it('returns the persisted evaluation when another request wins the conditional update', async () => {
      const applied = appliedRecommendation();
      const evaluated = recommendationRecord({
        ...applied,
        status: 'EVALUATED',
        evaluationStatus: 'WITHIN_ALLOCATION',
        evaluation: {
          actualSpend: '500000',
          proposedAllocation: '600000',
          transactionCount: 2,
        },
        evaluatedAt: new Date('2026-11-19T00:00:00.000Z'),
      });

      prisma.budgetRecommendation.findFirst
        .mockResolvedValueOnce(applied)
        .mockResolvedValueOnce(evaluated);

      prisma.budget.findFirst.mockResolvedValue(sourceBudget());
      prisma.transaction.findMany.mockResolvedValue([
        { amount: new Prisma.Decimal(300000) },
        { amount: new Prisma.Decimal(200000) },
      ]);

      prisma.budgetRecommendation.updateMany.mockResolvedValue({
        count: 0,
      });

      const result = await service.evaluate(userId, recommendationId);

      expect(result).toBe(evaluated);
      expect(prisma.budgetRecommendation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: recommendationId,
            userId,
            status: 'APPLIED',
          },
        }),
      );

      expect(
        recommendationNotificationService.notifyLifecycleChanged,
      ).not.toHaveBeenCalled();
    });

    it('rejects evaluation when the source budget cannot be found', async () => {
      prisma.budgetRecommendation.findFirst.mockResolvedValue(
        appliedRecommendation(),
      );

      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(
        service.evaluate(userId, recommendationId),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
      expect(budgetScopeEngine.buildTransactionWhere).not.toHaveBeenCalled();
    });

    it('does not evaluate a recommendation owned by another user', async () => {
      prisma.budgetRecommendation.findFirst.mockResolvedValue(null);

      await expect(
        service.evaluate('another-user', recommendationId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.budget.findFirst).not.toHaveBeenCalled();
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });
  });
});
