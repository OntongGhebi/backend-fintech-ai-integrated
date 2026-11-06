import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';

import { BudgetRecommendationLifecycleService } from './budget-recommendation-lifecycle.service';

import type { BudgetRecommendationsResult } from './budget-recommendations.service';

describe('BudgetRecommendationLifecycleService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const budgetId = '22222222-2222-4222-8222-222222222222';
  const categoryId = '33333333-3333-4333-8333-333333333333';
  const recommendationId = '44444444-4444-4444-8444-444444444444';

  let service: BudgetRecommendationLifecycleService;
  let prisma: any;

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

    service = new BudgetRecommendationLifecycleService(
      prisma as unknown as PrismaService,
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
    it('accepts a pending recommendation', async () => {
      prisma.budgetRecommendation.findFirst
        .mockResolvedValueOnce(recommendationRecord())
        .mockResolvedValueOnce(
          recommendationRecord({
            status: 'ACCEPTED',
          }),
        );

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
    });

    it('rejects a recommendation and stores the reason', async () => {
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
    });

    it('prevents accepting a recommendation owned by another user', async () => {
      prisma.budgetRecommendation.findFirst.mockResolvedValue(null);

      await expect(
        service.accept('another-user', recommendationId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.budgetRecommendation.updateMany).not.toHaveBeenCalled();
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
    });

    it('rejects a defer date on or after the target month begins', async () => {
      prisma.budgetRecommendation.findFirst.mockResolvedValue(
        recommendationRecord(),
      );

      await expect(
        service.defer(userId, recommendationId, '2026-12-01T00:00:00.000Z'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('apply', () => {
    it('applies an accepted recommendation using a monthly allocation transaction', async () => {
      prisma.budgetRecommendation.findFirst.mockResolvedValue(
        recommendationRecord({
          status: 'ACCEPTED',
        }),
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

      prisma.budgetAllocation.upsert.mockResolvedValue({});

      prisma.budgetRecommendation.update.mockResolvedValue(
        recommendationRecord({
          status: 'APPLIED',
        }),
      );

      prisma.budgetRecommendation.findUnique.mockResolvedValue(
        recommendationRecord({
          status: 'APPLIED',
        }),
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
    });

    it('rejects applying a recommendation after its source allocation changed', async () => {
      prisma.budgetRecommendation.findFirst.mockResolvedValue(
        recommendationRecord({
          status: 'ACCEPTED',
        }),
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
    });
  });

  describe('evaluate', () => {
    it('evaluates an applied recommendation after the target month ends', async () => {
      const applied = recommendationRecord({
        targetMonth: new Date('2026-10-01T00:00:00.000Z'),
        status: 'APPLIED',
      });

      prisma.budgetRecommendation.findFirst.mockResolvedValue(applied);

      prisma.transaction.findMany.mockResolvedValue([
        {
          amount: new Prisma.Decimal(300000),
        },
        {
          amount: new Prisma.Decimal(200000),
        },
      ]);

      prisma.budgetRecommendation.update.mockImplementation(
        async ({ data }: any) =>
          recommendationRecord({
            ...applied,
            status: 'EVALUATED',
            evaluationStatus: data.evaluationStatus,
            evaluation: data.evaluation,
          }),
      );

      const result = await service.evaluate(userId, recommendationId);

      expect(result.status).toBe('EVALUATED');

      expect(result.evaluationStatus).toBe('WITHIN_ALLOCATION');
    });

    it('does not evaluate before the target month has ended', async () => {
      prisma.budgetRecommendation.findFirst.mockResolvedValue(
        recommendationRecord({
          status: 'APPLIED',
        }),
      );

      await expect(
        service.evaluate(userId, recommendationId),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
