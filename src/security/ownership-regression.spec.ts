import { PrismaService } from '../database/prisma/prisma.service';

import { AccountsRepository } from '../modules/accounts/repositories/accounts.repository';
import { BudgetsRepository } from '../modules/budgets/repositories/budgets.repository';
import { CategoriesRepository } from '../modules/categories/repositories/categories.repository';
import { BillingHistoryService } from '../modules/payments/billing-history.service';
import { PaymentsRepository } from '../modules/payments/repositories/payments.repository';
import { TransactionsRepository } from '../modules/transactions/repositories/transactions.repository';

describe('Ownership and IDOR regression', () => {
  const ownerUserId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';
  const resourceId = '33333333-3333-4333-8333-333333333333';

  const createModelMock = () => ({
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  });

  const createPrismaMock = () => {
    const tx = {
      account: createModelMock(),
      budget: createModelMock(),
      category: createModelMock(),
      payment: createModelMock(),
      subscriptionEvent: createModelMock(),
      transaction: createModelMock(),
    };

    const prisma = {
      ...tx,
      $transaction: jest.fn(async (operation: unknown) => {
        if (typeof operation === 'function') {
          return operation(tx);
        }

        if (Array.isArray(operation)) {
          return Promise.all(operation);
        }

        return operation;
      }),
    };

    return { prisma, tx };
  };

  describe('AccountsRepository', () => {
    it('scopes account lookup to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new AccountsRepository(prisma as never);

      await repository.findByIdAndUserId(resourceId, ownerUserId);

      expect(prisma.account.findFirst).toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: ownerUserId,
          deletedAt: null,
        },
      });

      expect(prisma.account.findFirst).not.toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: otherUserId,
          deletedAt: null,
        },
      });
    });

    it('scopes account updates to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new AccountsRepository(prisma as never);

      await repository.update(resourceId, ownerUserId, {
        name: 'Updated account',
      });

      expect(prisma.account.updateMany).toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: ownerUserId,
          deletedAt: null,
        },
        data: {
          name: 'Updated account',
        },
      });
    });

    it('scopes account archiving to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new AccountsRepository(prisma as never);

      await repository.softDelete(resourceId, ownerUserId);

      expect(prisma.account.updateMany).toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: ownerUserId,
          deletedAt: null,
        },
        data: expect.objectContaining({
          isActive: false,
          deletedAt: expect.any(Date),
        }),
      });
    });

    it('scopes account lists to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new AccountsRepository(prisma as never);

      await repository.findManyByUserId(ownerUserId);

      expect(prisma.account.findMany).toHaveBeenCalledWith({
        where: {
          userId: ownerUserId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    });
  });

  describe('TransactionsRepository', () => {
    it('scopes transaction detail lookup to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new TransactionsRepository(prisma as never);

      await repository.findByIdAndUserId(resourceId, ownerUserId);

      expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: ownerUserId,
          deletedAt: null,
        },
        include: {
          account: true,
          category: true,
        },
      });
    });

    it('scopes transaction lists to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new TransactionsRepository(prisma as never);

      await repository.findManyByUserId(ownerUserId);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: ownerUserId,
            deletedAt: null,
          }),
        }),
      );

      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: ownerUserId,
          deletedAt: null,
        }),
      });
    });

    it('scopes transaction updates to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new TransactionsRepository(prisma as never);

      await repository.update(resourceId, ownerUserId, {
        description: 'Updated transaction',
      });

      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: ownerUserId,
          deletedAt: null,
          status: 'ACTIVE',
        },
        data: {
          description: 'Updated transaction',
        },
      });
    });

    it('scopes transaction voiding to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new TransactionsRepository(prisma as never);

      await repository.voidTransaction(resourceId, ownerUserId);

      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: ownerUserId,
          deletedAt: null,
          status: 'ACTIVE',
        },
        data: {
          status: 'VOIDED',
        },
      });
    });

    it('scopes transfer-group lookup to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new TransactionsRepository(prisma as never);

      await repository.findManyByTransferGroupId(resourceId, ownerUserId);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            transferGroupId: resourceId,
            userId: ownerUserId,
            deletedAt: null,
          },
        }),
      );
    });
  });

  describe('BudgetsRepository', () => {
    it('scopes budget lookup to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new BudgetsRepository(prisma as never);

      await repository.findByIdAndUserId(resourceId, ownerUserId);

      expect(prisma.budget.findFirst).toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: ownerUserId,
          deletedAt: null,
        },
        include: {
          category: true,
        },
      });
    });

    it('scopes budget updates to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new BudgetsRepository(prisma as never);

      await repository.update(resourceId, ownerUserId, {
        amount: 500000,
      });

      expect(prisma.budget.updateMany).toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: ownerUserId,
          deletedAt: null,
        },
        data: {
          amount: 500000,
        },
      });
    });

    it('scopes budget archiving to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new BudgetsRepository(prisma as never);

      await repository.softDelete(resourceId, ownerUserId);

      expect(prisma.budget.updateMany).toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: ownerUserId,
          deletedAt: null,
        },
        data: {
          deletedAt: expect.any(Date),
        },
      });
    });
  });

  describe('CategoriesRepository', () => {
    it('scopes category lookup to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new CategoriesRepository(prisma as never);

      await repository.findByIdAndUserId(resourceId, ownerUserId);

      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: ownerUserId,
          deletedAt: null,
        },
      });
    });

    it('scopes category updates to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new CategoriesRepository(prisma as never);

      await repository.update(resourceId, ownerUserId, {
        name: 'Updated category',
      });

      expect(prisma.category.updateMany).toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: ownerUserId,
          deletedAt: null,
        },
        data: {
          name: 'Updated category',
        },
      });
    });

    it('scopes category archiving to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new CategoriesRepository(prisma as never);

      await repository.softDelete(resourceId, ownerUserId);

      expect(prisma.category.updateMany).toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: ownerUserId,
          deletedAt: null,
        },
        data: expect.objectContaining({
          isActive: false,
          deletedAt: expect.any(Date),
        }),
      });
    });

    it('scopes category lists to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new CategoriesRepository(prisma as never);

      await repository.findManyByUserId(ownerUserId);

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: ownerUserId,
            deletedAt: null,
          },
        }),
      );
    });
  });

  describe('PaymentsRepository', () => {
    it('scopes payment detail lookup to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const repository = new PaymentsRepository(prisma as never);

      await repository.findByIdAndUserId(resourceId, ownerUserId);

      expect(prisma.payment.findFirst).toHaveBeenCalledWith({
        where: {
          id: resourceId,
          userId: ownerUserId,
        },
        include: {
          subscription: {
            select: {
              id: true,
              billingInterval: true,
              plan: {
                select: {
                  code: true,
                  name: true,
                },
              },
            },
          },
        },
      });
    });

    it('scopes payment lists and counts to the authenticated owner', async () => {
      const { prisma, tx } = createPrismaMock();
      const repository = new PaymentsRepository(prisma as never);

      await repository.findManyByUserId(ownerUserId, {
        page: 1,
        limit: 10,
      } as never);

      expect(tx.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: ownerUserId,
          },
        }),
      );

      expect(tx.payment.count).toHaveBeenCalledWith({
        where: {
          userId: ownerUserId,
        },
      });
    });
  });

  describe('BillingHistoryService', () => {
    it('scopes payment history and count to the authenticated owner', async () => {
      const { prisma } = createPrismaMock();
      const service = new BillingHistoryService(prisma as never);

      await service.getPaymentHistory(ownerUserId, {
        page: 1,
        limit: 20,
      });

      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: ownerUserId,
          },
        }),
      );

      expect(prisma.payment.count).toHaveBeenCalledWith({
        where: {
          userId: ownerUserId,
        },
      });
    });

    it('scopes subscription history through the subscription owner', async () => {
      const { prisma } = createPrismaMock();
      const service = new BillingHistoryService(prisma as never);

      await service.getSubscriptionHistory(ownerUserId, {
        page: 1,
        limit: 20,
      });

      expect(prisma.subscriptionEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            subscription: {
              userId: ownerUserId,
            },
          },
        }),
      );

      expect(prisma.subscriptionEvent.count).toHaveBeenCalledWith({
        where: {
          subscription: {
            userId: ownerUserId,
          },
        },
      });
    });
  });
});
