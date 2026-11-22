import { ConflictException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';

import { BudgetScopeEngine } from '../budgets/budget-scope.engine';

import { BudgetRecommendationLifecycleService } from './budget-recommendation-lifecycle.service';

describe('BudgetRecommendationLifecycleService — concurrent apply', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const budgetId = '22222222-2222-4222-8222-222222222222';
  const recommendationId = '33333333-3333-4333-8333-333333333333';

  let service: BudgetRecommendationLifecycleService;
  let prisma: any;

  let recommendationNotificationService: {
    notifyLifecycleChanged: jest.Mock;
  };

  const now = new Date();

  const targetMonth = new Date(
    Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), 1),
  );

  const currentAllocationPeriod = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const acceptedRecommendation = {
    id: recommendationId,
    userId,
    budgetId,
    targetMonth,
    budgetName: 'Monthly Food',
    action: 'INCREASE',
    status: 'ACCEPTED',
    currentAllocation: new Prisma.Decimal(500000),
    proposedAllocation: new Prisma.Decimal(600000),
  };

  const appliedRecommendation = {
    ...acceptedRecommendation,
    status: 'APPLIED',
    appliedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),

      budgetRecommendation: {
        findFirst: jest.fn().mockResolvedValue(acceptedRecommendation),
        updateMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(appliedRecommendation),
      },

      budget: {
        findFirst: jest.fn().mockResolvedValue({
          id: budgetId,
          status: 'ACTIVE',
          startDate: new Date('2025-01-01T00:00:00.000Z'),
          endDate: null,
          allocations: [
            {
              periodStart: currentAllocationPeriod,
              amount: new Prisma.Decimal(500000),
            },
          ],
        }),
      },

      budgetAllocation: {
        upsert: jest.fn().mockResolvedValue({}),
      },

      userPreference: {
        findUnique: jest.fn().mockResolvedValue({
          timezone: 'Asia/Jakarta',
        }),
      },
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );

    recommendationNotificationService = {
      notifyLifecycleChanged: jest.fn().mockResolvedValue(undefined),
    };

    service = new BudgetRecommendationLifecycleService(
      prisma as unknown as PrismaService,
      {
        buildTransactionWhere: jest.fn(),
      } as unknown as BudgetScopeEngine,
      recommendationNotificationService as any,
    );
  });

  it('allows only one concurrent request to apply the same recommendation', async () => {
    let claimCount = 0;

    prisma.budgetRecommendation.updateMany.mockImplementation(async () => {
      claimCount += 1;

      // Simulate the database conditional update:
      // only one request can change ACCEPTED -> APPLIED.
      return {
        count: claimCount === 1 ? 1 : 0,
      };
    });

    const results = await Promise.allSettled([
      service.apply(userId, recommendationId),
      service.apply(userId, recommendationId),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');

    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejection = rejected[0];

    expect(rejection.status).toBe('rejected');
    expect(rejection.reason).toBeInstanceOf(ConflictException);

    expect(prisma.budgetRecommendation.updateMany).toHaveBeenCalledTimes(2);

    // Only the request that successfully claimed the recommendation
    // may write the new budget allocation.
    expect(prisma.budgetAllocation.upsert).toHaveBeenCalledTimes(1);

    expect(prisma.budgetAllocation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          budgetId_periodStart: {
            budgetId,
            periodStart: targetMonth,
          },
        },
        create: expect.objectContaining({
          budgetId,
          amount: new Prisma.Decimal(600000),
          previousAmount: new Prisma.Decimal(500000),
          source: 'ACCEPTED_RECOMMENDATION',
          recommendationId,
        }),
      }),
    );

    expect(
      recommendationNotificationService.notifyLifecycleChanged,
    ).toHaveBeenCalledTimes(1);

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

  it('uses Serializable isolation for recommendation application', async () => {
    prisma.budgetRecommendation.updateMany.mockResolvedValue({
      count: 1,
    });

    await service.apply(userId, recommendationId);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
});
