/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from 'src/database/prisma/prisma.service';

type BudgetCreateData = Prisma.BudgetCreateInput;
type BudgetUpdateData = Prisma.BudgetUpdateManyMutationInput;
export interface BudgetAllocationInput {
  periodStart: Date;
  amount: string;
}

@Injectable()
export class BudgetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: BudgetCreateData) {
    return this.prisma.budget.create({
      data,
      include: {
        category: true,
        allocations: { orderBy: { periodStart: 'asc' } },
      },
    });
  }

  /**
   * Creates the budget and its first monthly allocation in one transaction.
   * Budget.amount remains a compatibility snapshot; allocations are authoritative.
   */
  async createWithInitialAllocation(
    data: BudgetCreateData,
    periodStart: Date,
    amount: string,
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const budget = await tx.budget.create({
        data,
      });

      await tx.budgetAllocation.create({
        data: {
          budgetId: budget.id,
          periodStart,
          amount,
          source: 'MANUAL',
          previousAmount: null,
          recommendationId: null,
        },
      });

      return tx.budget.findUniqueOrThrow({
        where: { id: budget.id },
        include: {
          category: true,
          allocations: { orderBy: { periodStart: 'asc' } },
        },
      });
    });
  }

  async findById(budgetId: string) {
    return this.prisma.budget.findUnique({
      where: { id: budgetId },
    });
  }

  async findByIdAndUserId(
    budgetId: string,
    userId: string,
    periodStart?: Date,
  ) {
    return this.prisma.budget.findFirst({
      where: {
        id: budgetId,
        userId,
        deletedAt: null,
      },
      include: {
        category: true,
        allocations: {
          ...(periodStart ? { where: { periodStart } } : {}),
          orderBy: { periodStart: 'desc' },
        },
      },
    });
  }

  async findManyByUserId(userId: string, periodStart?: Date) {
    return this.prisma.budget.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      include: {
        category: true,
        allocations: {
          ...(periodStart ? { where: { periodStart } } : {}),
          orderBy: { periodStart: 'desc' },
        },
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findManyByUserIdAndStatus(
    userId: string,
    status: NonNullable<
      NonNullable<
        NonNullable<Parameters<PrismaService['budget']['findMany']>[0]>['where']
      >['status']
    >,
    periodStart?: Date,
  ) {
    return this.prisma.budget.findMany({
      where: {
        userId,
        status,
        deletedAt: null,
      },
      include: {
        category: true,
        allocations: {
          ...(periodStart ? { where: { periodStart } } : {}),
          orderBy: { periodStart: 'desc' },
        },
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findByNameAndUserId(name: string, userId: string) {
    return this.prisma.budget.findFirst({
      where: {
        userId,
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
      },
    });
  }

  async findByNameAndUserIdExceptId(
    name: string,
    userId: string,
    budgetId: string,
  ) {
    return this.prisma.budget.findFirst({
      where: {
        userId,
        id: { not: budgetId },
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
      },
    });
  }

  async update(budgetId: string, userId: string, data: BudgetUpdateData) {
    return this.prisma.budget.updateMany({
      where: { id: budgetId, userId, deletedAt: null },
      data,
    });
  }

  /**
   * Updates budget metadata and all requested monthly allocations atomically.
   * previousAmount always records the value that was replaced, when present.
   */
  async updateWithAllocations(
    budgetId: string,
    userId: string,
    data: BudgetUpdateData,
    allocations: BudgetAllocationInput[],
  ) {
    return this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const updated = await tx.budget.updateMany({
          where: { id: budgetId, userId, deletedAt: null },
          data,
        });

        if (updated.count === 0) {
          return null;
        }

        for (const allocation of allocations) {
          const existing = (await tx.budgetAllocation.findUnique({
            where: {
              budgetId_periodStart: {
                budgetId,
                periodStart: allocation.periodStart,
              },
            },
            select: { amount: true },
          })) as unknown as Prisma.BudgetAllocationGetPayload<{
            select: { amount: true };
          }> | null;

          await tx.budgetAllocation.upsert({
            where: {
              budgetId_periodStart: {
                budgetId,
                periodStart: allocation.periodStart,
              },
            },
            create: {
              budgetId,
              periodStart: allocation.periodStart,
              amount: allocation.amount,
              source: 'MANUAL',
              previousAmount: null,
              recommendationId: null,
            },
            update: {
              amount: allocation.amount,
              source: 'MANUAL',
              previousAmount: existing?.amount ?? null,
              recommendationId: null,
            },
          });
        }

        return tx.budget.findFirst({
          where: { id: budgetId, userId, deletedAt: null },
          include: {
            category: true,
            allocations: { orderBy: { periodStart: 'desc' } },
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async softDelete(budgetId: string, userId: string) {
    return this.prisma.budget.updateMany({
      where: { id: budgetId, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
