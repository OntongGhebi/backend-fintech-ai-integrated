import { NotFoundException } from '@nestjs/common';

import { PlansRepository } from './repositories/plans.repository';
import { PlansService } from './plans.service';

describe('PlansService', () => {
  let service: PlansService;
  let repository: jest.Mocked<PlansRepository>;

  const plan = {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'PREMIUM_MONTHLY',
    name: 'Premium Monthly',
    description: 'Advanced financial insights',
    price: {
      toString: () => '99000.0000',
    },
    currency: 'IDR',
    billingInterval: 'MONTHLY',
    isActive: true,
    features: [
      {
        featureCode: 'AI_INSIGHTS',
        enabled: true,
        limitValue: 100,
        limitPeriod: 'MONTHLY',
      },
    ],
  };

  beforeEach(() => {
    repository = {
      findActivePlans: jest.fn(),
      findActiveByCode: jest.fn(),
    } as unknown as jest.Mocked<PlansRepository>;

    service = new PlansService(repository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAllActive', () => {
    it('should return active plans with features', async () => {
      repository.findActivePlans.mockResolvedValue([plan] as never);

      const result = await service.findAllActive();

      expect(repository.findActivePlans).toHaveBeenCalledTimes(1);
      expect(result).toEqual([
        {
          id: plan.id,
          code: plan.code,
          name: plan.name,
          description: plan.description,
          price: '99000.0000',
          currency: 'IDR',
          billingInterval: 'MONTHLY',
          isActive: true,
          features: [
            {
              featureCode: 'AI_INSIGHTS',
              enabled: true,
              limitValue: 100,
              limitPeriod: 'MONTHLY',
            },
          ],
        },
      ]);
    });

    it('should return an empty array when no active plans exist', async () => {
      repository.findActivePlans.mockResolvedValue([] as never);

      await expect(service.findAllActive()).resolves.toEqual([]);
    });

    it('should preserve price precision as a string', async () => {
      repository.findActivePlans.mockResolvedValue([
        {
          ...plan,
          price: { toString: () => '123456789.1234' },
        },
      ] as never);

      const result = await service.findAllActive();

      expect(result[0].price).toBe('123456789.1234');
    });
  });

  describe('findActiveByCode', () => {
    it('should normalize the code before querying the repository', async () => {
      repository.findActiveByCode.mockResolvedValue(plan as never);

      const result = await service.findActiveByCode('  PREMIUM_MONTHLY  ');

      expect(repository.findActiveByCode).toHaveBeenCalledWith(
        'PREMIUM_MONTHLY',
      );
      expect(result.code).toBe('PREMIUM_MONTHLY');
    });

    it('should throw NotFoundException when the plan does not exist', async () => {
      repository.findActiveByCode.mockResolvedValue(null as never);

      await expect(service.findActiveByCode('UNKNOWN_PLAN')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not return an inactive plan when repository finds none', async () => {
      repository.findActiveByCode.mockResolvedValue(null as never);

      await expect(service.findActiveByCode('INACTIVE_PLAN')).rejects.toThrow(
        'Plan not found',
      );
    });
  });
});
