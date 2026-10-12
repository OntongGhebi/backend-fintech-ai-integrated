import { NotFoundException } from '@nestjs/common';

import { PaymentsRepository } from './repositories/payments.repository';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let repository: jest.Mocked<PaymentsRepository>;

  const now = new Date('2026-10-12T00:00:00.000Z');

  const payment = {
    id: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    subscriptionId: '33333333-3333-4333-8333-333333333333',
    amount: { toString: () => '99000.0000' },
    currency: 'IDR',
    status: 'PAID',
    provider: 'manual',
    providerPaymentId: 'provider-payment-001',
    paidAt: now,
    failedAt: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    subscription: {
      id: '33333333-3333-4333-8333-333333333333',
      billingInterval: 'MONTHLY',
      plan: {
        code: 'PREMIUM_MONTHLY',
        name: 'Premium Monthly',
      },
    },
  };

  beforeEach(() => {
    repository = {
      findManyByUserId: jest.fn(),
      findByIdAndUserId: jest.fn(),
    } as unknown as jest.Mocked<PaymentsRepository>;

    service = new PaymentsService(repository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findManyByUserId', () => {
    it('should return a paginated payment list', async () => {
      repository.findManyByUserId.mockResolvedValue({
        payments: [payment],
        totalItems: 21,
      } as never);

      const result = await service.findManyByUserId(payment.userId, {
        page: 2,
        limit: 10,
      });

      expect(repository.findManyByUserId).toHaveBeenCalledWith(payment.userId, {
        page: 2,
        limit: 10,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].amount).toBe('99000.0000');
      expect(result.data[0].subscription.planCode).toBe('PREMIUM_MONTHLY');
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.totalItems).toBe(21);
      expect(result.totalPages).toBe(3);
    });

    it('should return zero total pages when no payment exists', async () => {
      repository.findManyByUserId.mockResolvedValue({
        payments: [],
        totalItems: 0,
      } as never);

      const result = await service.findManyByUserId(payment.userId, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toEqual([]);
      expect(result.totalItems).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('findById', () => {
    it('should return payment details', async () => {
      repository.findByIdAndUserId.mockResolvedValue(payment as never);

      const result = await service.findById(payment.id, payment.userId);

      expect(repository.findByIdAndUserId).toHaveBeenCalledWith(
        payment.id,
        payment.userId,
      );
      expect(result.id).toBe(payment.id);
      expect(result.status).toBe('PAID');
      expect(result.amount).toBe('99000.0000');
      expect(result.providerPaymentId).toBe('provider-payment-001');
      expect(result.subscription.planName).toBe('Premium Monthly');

      // Metadata internal tidak boleh ikut diekspos.
      expect(result).not.toHaveProperty('metadata');
    });

    it('should throw NotFoundException if payment is not found or not owned', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null as never);

      await expect(
        service.findById(payment.id, payment.userId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
