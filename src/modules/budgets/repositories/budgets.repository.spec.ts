import { BudgetsRepository } from './budgets.repository';
import { PrismaService } from 'src/database/prisma/prisma.service';

describe('BudgetsRepository monthly allocations', () => {
  let repository: BudgetsRepository;
  let prisma: {
    $transaction: jest.Mock;
    budget: { create: jest.Mock; findUniqueOrThrow: jest.Mock };
  };
  let tx: {
    budget: {
      create: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
    };
    budgetAllocation: {
      create: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };

  const budgetId = '22222222-2222-4222-8222-222222222222';
  const userId = '11111111-1111-4111-8111-111111111111';
  const month = new Date('2026-11-01T00:00:00.000Z');

  beforeEach(() => {
    tx = {
      budget: {
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
      budgetAllocation: {
        create: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      budget: {
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };

    repository = new BudgetsRepository(prisma as unknown as PrismaService);
  });

  it('creates budget and initial allocation in one transaction', async () => {
    const createdBudget = { id: budgetId };
    const result = { ...createdBudget, allocations: [] };

    tx.budget.create.mockResolvedValue(createdBudget);
    tx.budgetAllocation.create.mockResolvedValue({});
    tx.budget.findUniqueOrThrow.mockResolvedValue(result);

    const data = {
      user: { connect: { id: userId } },
      name: 'Food',
      amount: '1000000',
    } as never;

    await expect(
      repository.createWithInitialAllocation(data, month, '1000000'),
    ).resolves.toEqual(result);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.budget.create).toHaveBeenCalledWith({ data });
    expect(tx.budgetAllocation.create).toHaveBeenCalledWith({
      data: {
        budgetId,
        periodStart: month,
        amount: '1000000',
        source: 'MANUAL',
        previousAmount: null,
        recommendationId: null,
      },
    });
    expect(tx.budget.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: budgetId },
      include: {
        category: true,
        allocations: { orderBy: { periodStart: 'asc' } },
      },
    });
  });

  it('updates budget metadata and allocations in a single transaction', async () => {
    tx.budget.updateMany.mockResolvedValue({ count: 1 });
    tx.budgetAllocation.findUnique.mockResolvedValue({
      amount: '1500000',
      source: 'LEGACY_MIGRATION',
    });
    tx.budgetAllocation.upsert.mockResolvedValue({});
    tx.budget.findFirst.mockResolvedValue({ id: budgetId });

    const result = await repository.updateWithAllocations(
      budgetId,
      userId,
      { amount: '2000000' } as never,
      [{ periodStart: month, amount: '2000000' }],
    );

    expect(result).toEqual({ id: budgetId });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.budget.updateMany).toHaveBeenCalledWith({
      where: { id: budgetId, userId, deletedAt: null },
      data: { amount: '2000000' },
    });
    expect(tx.budgetAllocation.upsert).toHaveBeenCalledWith({
      where: {
        budgetId_periodStart: { budgetId, periodStart: month },
      },
      create: {
        budgetId,
        periodStart: month,
        amount: '2000000',
        source: 'MANUAL',
        previousAmount: null,
        recommendationId: null,
      },
      update: {
        amount: '2000000',
        source: 'MANUAL',
        previousAmount: '1500000',
        recommendationId: null,
      },
    });
  });

  it('does not write allocations when the budget is not owned by the user', async () => {
    tx.budget.updateMany.mockResolvedValue({ count: 0 });

    const result = await repository.updateWithAllocations(
      budgetId,
      userId,
      { amount: '2000000' } as never,
      [{ periodStart: month, amount: '2000000' }],
    );

    expect(result).toBeNull();
    expect(tx.budgetAllocation.findUnique).not.toHaveBeenCalled();
    expect(tx.budgetAllocation.upsert).not.toHaveBeenCalled();
  });

  it('propagates a transaction failure so the database can roll back all writes', async () => {
    tx.budget.updateMany.mockResolvedValue({ count: 1 });
    tx.budgetAllocation.findUnique.mockResolvedValue(null);
    tx.budgetAllocation.upsert.mockRejectedValue(
      new Error('allocation write failed'),
    );

    await expect(
      repository.updateWithAllocations(
        budgetId,
        userId,
        { amount: '2000000' } as never,
        [{ periodStart: month, amount: '2000000' }],
      ),
    ).rejects.toThrow('allocation write failed');
  });
});
