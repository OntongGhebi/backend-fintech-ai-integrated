import { BillingHistoryService } from './billing-history.service';
import { PrismaService } from 'src/database/prisma/prisma.service';

describe('BillingHistoryService', () => {
  let service: BillingHistoryService;

  const prismaMock = {
    payment: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    subscriptionEvent: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation(
      async (operations: Promise<unknown>[]) => Promise.all(operations),
    );

    service = new BillingHistoryService(prismaMock as unknown as PrismaService);
  });

  describe('getPaymentHistory', () => {
    it('returns paginated payment history scoped to the user', async () => {
      const userId = 'user-a';
      const payments = [
        {
          id: 'payment-1',
          amount: '99000',
          currency: 'IDR',
          status: 'PAID',
        },
      ];

      prismaMock.payment.findMany.mockResolvedValue(payments);
      prismaMock.payment.count.mockResolvedValue(21);

      const result = await service.getPaymentHistory(userId, {
        page: 2,
        limit: 10,
      });

      expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          skip: 10,
          take: 10,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );

      expect(prismaMock.payment.count).toHaveBeenCalledWith({
        where: { userId },
      });

      expect(result).toEqual({
        data: payments,
        meta: {
          page: 2,
          limit: 10,
          total: 21,
          totalPages: 3,
          hasNextPage: true,
          hasPreviousPage: true,
        },
      });
    });

    it('returns an empty result when no payments exist', async () => {
      prismaMock.payment.findMany.mockResolvedValue([]);
      prismaMock.payment.count.mockResolvedValue(0);

      const result = await service.getPaymentHistory('user-a', {
        page: 1,
        limit: 20,
      });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.hasPreviousPage).toBe(false);
    });
  });

  describe('getSubscriptionHistory', () => {
    it('scopes subscription events through the owning user', async () => {
      prismaMock.subscriptionEvent.findMany.mockResolvedValue([]);
      prismaMock.subscriptionEvent.count.mockResolvedValue(0);

      await service.getSubscriptionHistory('user-b', {
        page: 1,
        limit: 20,
      });

      expect(prismaMock.subscriptionEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            subscription: {
              userId: 'user-b',
            },
          },
          skip: 0,
          take: 20,
        }),
      );

      expect(prismaMock.subscriptionEvent.count).toHaveBeenCalledWith({
        where: {
          subscription: {
            userId: 'user-b',
          },
        },
      });
    });
  });
});
