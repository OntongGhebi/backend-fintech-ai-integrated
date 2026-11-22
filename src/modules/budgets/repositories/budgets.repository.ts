import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from 'src/database/prisma/prisma.service';

import { runSerializableTransaction } from '../utils/serializable-transaction.util';

type BudgetCreateData = Prisma.BudgetCreateInput;
type BudgetUpdateData = Prisma.BudgetUncheckedUpdateManyInput;

export interface BudgetAllocationInput {
  periodStart: Date;
  amount: string;
}

@Injectable()
export class BudgetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly budgetInclude = {
    category: true,
    scopeCategory: true,
    categoryScopes: {
      include: {
        category: true,
      },
      orderBy: {
        categoryId: 'asc',
      },
    },
    allocations: {
      orderBy: {
        periodStart: 'desc',
      },
    },
  } satisfies Prisma.BudgetInclude;

  async create(data: BudgetCreateData) {
    return this.prisma.budget.create({
      data,
      include: this.budgetInclude,
    });
  }

  async createWithInitialAllocation(
    data: BudgetCreateData,
    periodStart: Date,
    amount: string,
    categoryIds: string[] = [],
  ) {
    return this.prisma.$transaction(async (tx) => {
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

      if (categoryIds.length > 0) {
        await tx.budgetCategoryScope.createMany({
          data: categoryIds.map((categoryId) => ({
            budgetId: budget.id,
            categoryId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.budget.findUniqueOrThrow({
        where: {
          id: budget.id,
        },
        include: this.budgetInclude,
      });
    });
  }

  async findById(budgetId: string) {
    return this.prisma.budget.findUnique({
      where: {
        id: budgetId,
      },
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
        ...this.budgetInclude,
        allocations: {
          ...(periodStart
            ? {
                where: {
                  periodStart,
                },
              }
            : {}),
          orderBy: {
            periodStart: 'desc',
          },
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
        ...this.budgetInclude,
        allocations: {
          ...(periodStart
            ? {
                where: {
                  periodStart,
                },
              }
            : {}),
          orderBy: {
            periodStart: 'desc',
          },
        },
      },
      orderBy: [
        {
          startDate: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
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
        ...this.budgetInclude,
        allocations: {
          ...(periodStart
            ? {
                where: {
                  periodStart,
                },
              }
            : {}),
          orderBy: {
            periodStart: 'desc',
          },
        },
      },
      orderBy: [
        {
          startDate: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  async findByNameAndUserId(name: string, userId: string) {
    return this.prisma.budget.findFirst({
      where: {
        userId,
        name: {
          equals: name,
          mode: 'insensitive',
        },
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
        id: {
          not: budgetId,
        },
        name: {
          equals: name,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
    });
  }

  async update(budgetId: string, userId: string, data: BudgetUpdateData) {
    return this.prisma.budget.updateMany({
      where: {
        id: budgetId,
        userId,
        deletedAt: null,
      },
      data,
    });
  }

  /**
   * Updates budget metadata, allocations, and custom category scopes
   * atomically.
   *
   * categoryIds:
   * - undefined: preserve existing custom category scopes.
   * - []: remove all existing custom category scopes.
   * - non-empty: replace existing scopes with the supplied categories.
   *
   * allocations:
   * - null: do not modify monthly allocations.
   * - array: upsert the supplied monthly allocations.
   *
   * Serializable retries ensure previousAmount is calculated against
   * the latest committed allocation after a concurrent write conflict.
   */
  async updateWithAllocationsAndScopes(
    budgetId: string,
    userId: string,
    data: BudgetUpdateData,
    allocations: BudgetAllocationInput[] | null,
    categoryIds?: string[],
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const updated = await tx.budget.updateMany({
        where: {
          id: budgetId,
          userId,
          deletedAt: null,
        },
        data,
      });

      if (updated.count === 0) {
        return null;
      }

      if (allocations) {
        for (const allocation of allocations) {
          const existing = await tx.budgetAllocation.findUnique({
            where: {
              budgetId_periodStart: {
                budgetId,
                periodStart: allocation.periodStart,
              },
            },
            select: {
              amount: true,
            },
          });

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
      }

      if (categoryIds !== undefined) {
        await tx.budgetCategoryScope.deleteMany({
          where: {
            budgetId,
          },
        });

        if (categoryIds.length > 0) {
          await tx.budgetCategoryScope.createMany({
            data: categoryIds.map((categoryId) => ({
              budgetId,
              categoryId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.budget.findFirst({
        where: {
          id: budgetId,
          userId,
          deletedAt: null,
        },
        include: this.budgetInclude,
      });
    });
  }

  /**
   * Backward-compatible wrapper for allocation-only updates.
   */
  async updateWithAllocations(
    budgetId: string,
    userId: string,
    data: BudgetUpdateData,
    allocations: BudgetAllocationInput[],
  ) {
    return this.updateWithAllocationsAndScopes(
      budgetId,
      userId,
      data,
      allocations,
    );
  }

  async softDelete(budgetId: string, userId: string) {
    return this.prisma.budget.updateMany({
      where: {
        id: budgetId,
        userId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}
