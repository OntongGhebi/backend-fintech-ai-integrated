import { NotFoundException } from '@nestjs/common';

import { SubscriptionsRepository } from './repositories/subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let repository: jest.Mocked<SubscriptionsRepository>;

  const now = new Date('2026-10-12T00:00:00.000Z');
  const trialEndsAt = new Date('2026-10-19T00:00:00.000Z');

  const subscription = {
    id: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    planId: '33333333-3333-4333-8333-333333333333',
    status: 'TRIALING',
    billingInterval: 'MONTHLY',
    trialStartedAt: now,
    trialEndsAt,
    currentPeriodStart: now,
    currentPeriodEnd: trialEndsAt,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    createdAt: now,
    updatedAt: now,
    plan: {
      id: '33333333-3333-4333-8333-333333333333',
      code: 'PREMIUM_MONTHLY',
      name: 'Premium Monthly',
      price: { toString: () => '99000.0000' },
      currency: 'IDR',
      billingInterval: 'MONTHLY',
    },
  };

  beforeEach(() => {
    repository = {
      findCurrentByUserId: jest.fn(),
      startTrial: jest.fn(),
      cancelCurrent: jest.fn(),
      resumeCurrent: jest.fn(),
    } as unknown as jest.Mocked<SubscriptionsRepository>;

    service = new SubscriptionsService(repository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrent', () => {
    it('should return the current subscription and plan', async () => {
      repository.findCurrentByUserId.mockResolvedValue(subscription as never);

      const result = await service.getCurrent(subscription.userId);

      expect(repository.findCurrentByUserId).toHaveBeenCalledWith(
        subscription.userId,
      );
      expect(result.status).toBe('TRIALING');
      expect(result.plan.code).toBe('PREMIUM_MONTHLY');
      expect(result.plan.price).toBe('99000.0000');
    });

    it('should throw when the user has no current subscription', async () => {
      repository.findCurrentByUserId.mockResolvedValue(null as never);

      await expect(service.getCurrent(subscription.userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('startTrial', () => {
    it('should start a seven-day trial for the requested plan', async () => {
      repository.startTrial.mockResolvedValue(subscription as never);

      const result = await service.startTrial(
        subscription.userId,
        '  PREMIUM_MONTHLY  ',
      );

      expect(repository.startTrial).toHaveBeenCalledWith(
        subscription.userId,
        'PREMIUM_MONTHLY',
        7,
      );
      expect(result.status).toBe('TRIALING');
      expect(result.trialEndsAt).toEqual(trialEndsAt);
    });
  });

  describe('cancelCurrent', () => {
    it('should return the updated subscription', async () => {
      const canceled = {
        ...subscription,
        status: 'CANCELED',
        canceledAt: now,
      };

      repository.cancelCurrent.mockResolvedValue(canceled as never);

      const result = await service.cancelCurrent(subscription.userId);

      expect(repository.cancelCurrent).toHaveBeenCalledWith(
        subscription.userId,
      );
      expect(result.status).toBe('CANCELED');
    });
  });

  describe('resumeCurrent', () => {
    it('should return the subscription after resuming', async () => {
      const resumed = {
        ...subscription,
        status: 'ACTIVE',
        trialStartedAt: null,
        trialEndsAt: null,
        cancelAtPeriodEnd: false,
      };

      repository.resumeCurrent.mockResolvedValue(resumed as never);

      const result = await service.resumeCurrent(subscription.userId);

      expect(repository.resumeCurrent).toHaveBeenCalledWith(
        subscription.userId,
      );
      expect(result.status).toBe('ACTIVE');
      expect(result.cancelAtPeriodEnd).toBe(false);
    });
  });
});
