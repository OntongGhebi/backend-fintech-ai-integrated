import { BudgetAlertsRepository } from './budget-alerts.repository';
import { getBudgetMonthRange } from '../../budgets/utils/budget-month.util';

describe('BudgetAlertsRepository', () => {
  const prisma = {
    budgetAlert: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  let repository: BudgetAlertsRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.budgetAlert.findMany.mockResolvedValue([]);
    repository = new BudgetAlertsRepository(prisma as never);
  });

  it('includes the current monthly allocation with each budget alert', async () => {
    await repository.findManyByUserId('user-1', {});

    const month = getBudgetMonthRange(new Date(), 'Asia/Jakarta');
    expect(prisma.budgetAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          budget: { userId: 'user-1', deletedAt: null },
        },
        include: {
          budget: {
            include: {
              allocations: {
                where: { periodStart: month.periodStart },
                take: 1,
              },
            },
          },
        },
      }),
    );
  });
});
