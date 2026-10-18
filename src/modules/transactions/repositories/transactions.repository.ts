import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';

import { GetTransactionsQueryDto } from '../dto/get-transaction-query.dto';

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Parameters<PrismaService['transaction']['create']>[0]['data'],
  ) {
    return this.prisma.transaction.create({
      data,
      include: {
        account: true,
        category: true,
      },
    });
  }

  async createTelegramConfirmedTransaction(params: {
    confirmationId: string;
    transactionData: Prisma.TransactionUncheckedCreateInput;
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const confirmation =
          await tx.telegramTransactionConfirmation.findUnique({
            where: { id: params.confirmationId },
            include: {
              transaction: {
                include: {
                  account: true,
                  category: true,
                },
              },
            },
          });

        if (!confirmation) {
          throw new Error('TELEGRAM_CONFIRMATION_NOT_FOUND');
        }

        // A completed confirmation must never create another transaction.
        if (confirmation.status === 'COMPLETED') {
          if (confirmation.transaction) {
            return confirmation.transaction;
          }

          throw new Error('TELEGRAM_COMPLETED_WITHOUT_TRANSACTION');
        }

        if (
          confirmation.status !== 'CONFIRMED' &&
          confirmation.status !== 'PROCESSING'
        ) {
          throw new Error('TELEGRAM_CONFIRMATION_NOT_PROCESSABLE');
        }

        const transaction = await tx.transaction.create({
          data: {
            ...params.transactionData,
            telegramConfirmationId: params.confirmationId,
          },
          include: {
            account: true,
            category: true,
          },
        });

        const updated = await tx.telegramTransactionConfirmation.updateMany({
          where: {
            id: params.confirmationId,
            status: {
              in: ['CONFIRMED', 'PROCESSING'],
            },
          },
          data: {
            status: 'COMPLETED',
          },
        });

        if (updated.count !== 1) {
          throw new Error('TELEGRAM_CONFIRMATION_STATE_CONFLICT');
        }

        return transaction;
      });
    } catch (error: unknown) {
      // Concurrent retries can race on the unique confirmation FK.
      const isUniqueViolation =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002';

      if (!isUniqueViolation) {
        throw error;
      }

      const existing = await this.prisma.transaction.findUnique({
        where: {
          telegramConfirmationId: params.confirmationId,
        },
        include: {
          account: true,
          category: true,
        },
      });

      if (existing) {
        return existing;
      }

      // The unique violation may have come from another unique field.
      throw error;
    }
  }

  async findByIdAndUserId(transactionId: string, userId: string) {
    return this.prisma.transaction.findFirst({
      where: {
        id: transactionId,
        userId,
        deletedAt: null,
      },
      include: {
        account: true,
        category: true,
      },
    });
  }

  async findCategoryByIdAndUserId(categoryId: string, userId: string) {
    return this.prisma.category.findFirst({
      where: {
        id: categoryId,
        userId,
        deletedAt: null,
      },
    });
  }

  async findManyByUserId(userId: string, query: GetTransactionsQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where = {
      userId,
      deletedAt: null,
      ...(query.type && { type: query.type }),
      ...(query.accountId && { accountId: query.accountId }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.status && { status: query.status }),
      ...(query.startDate || query.endDate
        ? {
            transactionDate: {
              ...(query.startDate && {
                gte: new Date(query.startDate),
              }),
              ...(query.endDate && {
                lte: new Date(query.endDate),
              }),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          account: true,
          category: true,
        },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(
    transactionId: string,
    userId: string,
    data: Parameters<PrismaService['transaction']['updateMany']>[0]['data'],
  ) {
    return this.prisma.transaction.updateMany({
      where: {
        id: transactionId,
        userId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      data,
    });
  }

  async voidTransaction(transactionId: string, userId: string) {
    return this.prisma.transaction.updateMany({
      where: {
        id: transactionId,
        userId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      data: {
        status: 'VOIDED',
      },
    });
  }

  async findManyByTransferGroupId(transferGroupId: string, userId: string) {
    return this.prisma.transaction.findMany({
      where: {
        transferGroupId,
        userId,
        deletedAt: null,
      },
      include: {
        account: true,
        category: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async createTransfer(
    sourceData: Parameters<PrismaService['transaction']['create']>[0]['data'],
    destinationData: Parameters<
      PrismaService['transaction']['create']
    >[0]['data'],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const sourceTransaction = await tx.transaction.create({
        data: sourceData,
        include: {
          account: true,
          category: true,
        },
      });

      const destinationTransaction = await tx.transaction.create({
        data: destinationData,
        include: {
          account: true,
          category: true,
        },
      });

      return {
        sourceTransaction,
        destinationTransaction,
      };
    });
  }
}
