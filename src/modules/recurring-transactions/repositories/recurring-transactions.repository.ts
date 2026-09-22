import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { GetRecurringTransactionsQueryDto } from '../dto/get-recurring-transaction-query.dto';

@Injectable()
export class RecurringTransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Parameters<
      PrismaService['recurringTransaction']['create']
    >[0]['data'],
  ) {
    return this.prisma.recurringTransaction.create({
      data,
      include: {
        account: true,
        category: true,
      },
    });
  }

  async findById(recurringTransactionId: string) {
    return this.prisma.recurringTransaction.findUnique({
      where: {
        id: recurringTransactionId,
      },
      include: {
        account: true,
        category: true,
      },
    });
  }

  async findByIdAndUserId(recurringTransactionId: string, userId: string) {
    return this.prisma.recurringTransaction.findFirst({
      where: {
        id: recurringTransactionId,
        userId,
      },
      include: {
        account: true,
        category: true,
      },
    });
  }

  async findManyByUserId(
    userId: string,
    query: GetRecurringTransactionsQueryDto,
  ) {
    return this.prisma.recurringTransaction.findMany({
      where: {
        userId,
        ...(query.type !== undefined
          ? {
              type: query.type,
            }
          : {}),
        ...(query.frequency !== undefined
          ? {
              frequency: query.frequency,
            }
          : {}),
        ...(query.isActive !== undefined
          ? {
              isActive: query.isActive,
            }
          : {}),
      },
      include: {
        account: true,
        category: true,
      },
      orderBy: [
        {
          nextRunAt: 'asc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  async findManyActiveByUserId(userId: string) {
    return this.prisma.recurringTransaction.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        account: true,
        category: true,
      },
      orderBy: {
        nextRunAt: 'asc',
      },
    });
  }

  async findManyDue(beforeOrAt: Date) {
    return this.prisma.recurringTransaction.findMany({
      where: {
        isActive: true,
        nextRunAt: {
          lte: beforeOrAt,
        },
        OR: [
          {
            endDate: null,
          },
          {
            endDate: {
              gte: beforeOrAt,
            },
          },
        ],
      },
      include: {
        account: true,
        category: true,
      },
      orderBy: {
        nextRunAt: 'asc',
      },
    });
  }

  async update(
    recurringTransactionId: string,
    userId: string,
    data: Parameters<
      PrismaService['recurringTransaction']['updateMany']
    >[0]['data'],
  ) {
    return this.prisma.recurringTransaction.updateMany({
      where: {
        id: recurringTransactionId,
        userId,
      },
      data,
    });
  }

  async setEnabled(
    recurringTransactionId: string,
    userId: string,
    isActive: boolean,
  ) {
    return this.prisma.recurringTransaction.updateMany({
      where: {
        id: recurringTransactionId,
        userId,
      },
      data: {
        isActive,
      },
    });
  }

  async delete(recurringTransactionId: string, userId: string) {
    return this.prisma.recurringTransaction.deleteMany({
      where: {
        id: recurringTransactionId,
        userId,
      },
    });
  }

  async executeDueTransaction(
    recurringTransactionId: string,
    scheduledAt: Date,
    nextRunAt: Date | null,
    isActive: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const recurringTransaction = await tx.recurringTransaction.findUnique({
        where: {
          id: recurringTransactionId,
        },
      });

      if (!recurringTransaction) {
        return null;
      }

      if (!recurringTransaction.isActive) {
        return null;
      }

      const recurringExecutionKey = `${recurringTransaction.id}:${scheduledAt.toISOString()}`;

      const existingTransaction = await tx.transaction.findUnique({
        where: {
          recurringExecutionKey,
        },
      });

      if (existingTransaction) {
        return {
          transaction: existingTransaction,
          recurringTransaction,
          alreadyExecuted: true,
        };
      }

      if (recurringTransaction.nextRunAt.getTime() !== scheduledAt.getTime()) {
        return null;
      }

      const transaction = await tx.transaction.create({
        data: {
          userId: recurringTransaction.userId,
          accountId: recurringTransaction.accountId,
          categoryId: recurringTransaction.categoryId,

          recurringTransactionId: recurringTransaction.id,

          recurringExecutionKey,

          type: recurringTransaction.type,

          amount: recurringTransaction.amount,

          currency: 'IDR',

          description: recurringTransaction.description,

          transactionDate: scheduledAt,

          source: 'SYSTEM',

          status: 'ACTIVE',

          metadata: {
            recurringTransactionId: recurringTransaction.id,

            recurringScheduledAt: scheduledAt.toISOString(),
          },
        },
      });

      const updated = await tx.recurringTransaction.updateMany({
        where: {
          id: recurringTransactionId,
          isActive: true,
          nextRunAt: scheduledAt,
        },
        data: {
          lastRunAt: scheduledAt,
          ...(nextRunAt !== null ? { nextRunAt } : {}),
          isActive,
        },
      });

      if (updated.count === 0) {
        throw new Error(
          'Recurring transaction execution state changed unexpectedly',
        );
      }

      return {
        transaction,
        recurringTransaction: await tx.recurringTransaction.findUnique({
          where: {
            id: recurringTransactionId,
          },
        }),

        alreadyExecuted: false,
      };
    });
  }
}
