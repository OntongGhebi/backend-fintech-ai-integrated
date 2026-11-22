/* eslint-disable @typescript-eslint/no-base-to-string */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';

import { calculateAccountBalance } from '../../accounts/account-balance.util';
import { GetTransactionsQueryDto } from '../dto/get-transaction-query.dto';

type TransactionUpdateData = Parameters<
  PrismaService['transaction']['updateMany']
>[0]['data'];

interface TransferPairRow {
  id: string;
  type: string;
  status: string;
  metadata: Prisma.JsonValue | null;
}

function getTransferDirection(
  metadata: Prisma.JsonValue | null,
): string | null {
  if (
    metadata === null ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata)
  ) {
    return null;
  }

  const direction = metadata.direction;

  return typeof direction === 'string' ? direction : null;
}

function isValidTransferPair(rows: TransferPairRow[]): boolean {
  if (rows.length !== 2) {
    return false;
  }

  if (rows.some((row) => row.type !== 'TRANSFER' || row.status !== 'ACTIVE')) {
    return false;
  }

  const directions = rows.map((row) => getTransferDirection(row.metadata));

  return (
    directions.includes('OUT') &&
    directions.includes('IN') &&
    directions[0] !== directions[1]
  );
}

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

        if (
          !confirmation ||
          confirmation.userId !== params.transactionData.userId
        ) {
          throw new Error('TELEGRAM_CONFIRMATION_NOT_FOUND');
        }

        if (confirmation.status === 'COMPLETED') {
          if (
            confirmation.transaction &&
            confirmation.transaction.userId === params.transactionData.userId
          ) {
            return confirmation.transaction;
          }

          if (confirmation.transaction) {
            throw new Error(
              'TELEGRAM_CONFIRMATION_TRANSACTION_OWNERSHIP_MISMATCH',
            );
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
            userId: params.transactionData.userId,
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

      if (existing && existing.userId === params.transactionData.userId) {
        return existing;
      }

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
      include: {
        children: {
          where: {
            isActive: true,
            deletedAt: null,
          },
          select: {
            id: true,
          },
        },
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

  /**
   * Updates a normal transaction or both legs of a transfer atomically.
   *
   * Transfer account/category changes are intentionally rejected because
   * changing only one leg would break the transfer relationship.
   */
  async update(
    transactionId: string,
    userId: string,
    data: TransactionUpdateData,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.transaction.findFirst({
        where: {
          id: transactionId,
          userId,
          deletedAt: null,
        },
        select: {
          id: true,
          type: true,
          transferGroupId: true,
        },
      });

      if (!current) {
        return { count: 0 };
      }

      if (current.type !== 'TRANSFER') {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM transactions
          WHERE id = ${transactionId}::uuid
            AND "userId" = ${userId}::uuid
            AND "deletedAt" IS NULL
          FOR UPDATE
        `;

        return tx.transaction.updateMany({
          where: {
            id: transactionId,
            userId,
            deletedAt: null,
            status: 'ACTIVE',
            type: {
              not: 'TRANSFER',
            },
          },
          data,
        });
      }

      if (data.accountId !== undefined || data.categoryId !== undefined) {
        throw new BadRequestException(
          'Transfer account and category cannot be changed through transaction update',
        );
      }

      if (!current.transferGroupId) {
        throw new BadRequestException(
          'Transfer transaction is missing its transfer group',
        );
      }

      // Lock both legs in a deterministic order to avoid opposite-order
      // locking when two requests target different legs of the same transfer.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM transactions
        WHERE "transferGroupId" = ${current.transferGroupId}::uuid
          AND "userId" = ${userId}::uuid
          AND "deletedAt" IS NULL
        ORDER BY id
        FOR UPDATE
      `;

      const pair = await tx.transaction.findMany({
        where: {
          transferGroupId: current.transferGroupId,
          userId,
          deletedAt: null,
        },
        select: {
          id: true,
          type: true,
          status: true,
          metadata: true,
        },
      });

      if (!isValidTransferPair(pair)) {
        throw new BadRequestException(
          'Transfer pair is incomplete or inconsistent',
        );
      }

      const updated = await tx.transaction.updateMany({
        where: {
          id: {
            in: pair.map((row) => row.id),
          },
          userId,
          transferGroupId: current.transferGroupId,
          type: 'TRANSFER',
          status: 'ACTIVE',
          deletedAt: null,
        },
        data,
      });

      if (updated.count !== 2) {
        throw new Error('TRANSFER_PAIR_UPDATE_CONFLICT');
      }

      return updated;
    });
  }

  /**
   * Voids a normal transaction or both legs of a transfer atomically.
   */
  async voidTransaction(transactionId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.transaction.findFirst({
        where: {
          id: transactionId,
          userId,
          deletedAt: null,
        },
        select: {
          id: true,
          type: true,
          transferGroupId: true,
        },
      });

      if (!current) {
        return { count: 0 };
      }

      if (current.type !== 'TRANSFER') {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM transactions
          WHERE id = ${transactionId}::uuid
            AND "userId" = ${userId}::uuid
            AND "deletedAt" IS NULL
          FOR UPDATE
        `;

        return tx.transaction.updateMany({
          where: {
            id: transactionId,
            userId,
            deletedAt: null,
            status: 'ACTIVE',
            type: {
              not: 'TRANSFER',
            },
          },
          data: {
            status: 'VOIDED',
          },
        });
      }

      if (!current.transferGroupId) {
        throw new BadRequestException(
          'Transfer transaction is missing its transfer group',
        );
      }

      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM transactions
        WHERE "transferGroupId" = ${current.transferGroupId}::uuid
          AND "userId" = ${userId}::uuid
          AND "deletedAt" IS NULL
        ORDER BY id
        FOR UPDATE
      `;

      const pair = await tx.transaction.findMany({
        where: {
          transferGroupId: current.transferGroupId,
          userId,
          deletedAt: null,
        },
        select: {
          id: true,
          type: true,
          status: true,
          metadata: true,
        },
      });

      if (!isValidTransferPair(pair)) {
        throw new BadRequestException(
          'Transfer pair is incomplete or inconsistent',
        );
      }

      const updated = await tx.transaction.updateMany({
        where: {
          id: {
            in: pair.map((row) => row.id),
          },
          userId,
          transferGroupId: current.transferGroupId,
          type: 'TRANSFER',
          status: 'ACTIVE',
          deletedAt: null,
        },
        data: {
          status: 'VOIDED',
        },
      });

      if (updated.count !== 2) {
        throw new Error('TRANSFER_PAIR_VOID_CONFLICT');
      }

      return updated;
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
    const userId = sourceData.userId;
    const sourceAccountId = sourceData.accountId;
    const destinationAccountId = destinationData.accountId;

    if (
      typeof userId !== 'string' ||
      typeof sourceAccountId !== 'string' ||
      typeof destinationAccountId !== 'string'
    ) {
      throw new BadRequestException('Invalid transfer account information');
    }

    if (destinationData.userId !== userId) {
      throw new BadRequestException(
        'Transfer accounts must belong to the same user',
      );
    }

    if (sourceAccountId === destinationAccountId) {
      throw new BadRequestException(
        'Source and destination accounts must be different',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM accounts
        WHERE id = ${sourceAccountId}::uuid
          AND "userId" = ${userId}::uuid
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;

      const [sourceAccount, destinationAccount] = await Promise.all([
        tx.account.findFirst({
          where: {
            id: sourceAccountId,
            userId,
            deletedAt: null,
          },
          select: {
            openingBalance: true,
          },
        }),
        tx.account.findFirst({
          where: {
            id: destinationAccountId,
            userId,
            deletedAt: null,
          },
          select: {
            id: true,
          },
        }),
      ]);

      if (!sourceAccount) {
        throw new BadRequestException('Source account is not available');
      }

      if (!destinationAccount) {
        throw new BadRequestException('Destination account is not available');
      }

      if (typeof sourceData.telegramConfirmationId === 'string') {
        const telegramConfirmationId = sourceData.telegramConfirmationId;

        const existingSource = await tx.transaction.findUnique({
          where: {
            telegramConfirmationId,
          },
          include: {
            account: true,
            category: true,
          },
        });

        if (existingSource) {
          if (
            existingSource.userId !== userId ||
            existingSource.accountId !== sourceAccountId
          ) {
            throw new BadRequestException('Transfer is not available');
          }

          const existingDestination = await tx.transaction.findFirst({
            where: {
              userId,
              accountId: destinationAccountId,
              transferGroupId: existingSource.transferGroupId,
              id: {
                not: existingSource.id,
              },
              deletedAt: null,
            },
            include: {
              account: true,
              category: true,
            },
          });

          if (!existingDestination) {
            throw new Error('TELEGRAM_TRANSFER_INCOMPLETE');
          }

          return {
            sourceTransaction: existingSource,
            destinationTransaction: existingDestination,
          };
        }
      }

      const sourceTransactions = await tx.transaction.findMany({
        where: {
          accountId: sourceAccountId,
          userId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          type: true,
          amount: true,
          metadata: true,
        },
      });

      const currentBalance = calculateAccountBalance(
        sourceAccount.openingBalance,
        sourceTransactions,
      );

      const transferAmount = new Prisma.Decimal(String(sourceData.amount));

      if (currentBalance.lte(0)) {
        throw new BadRequestException(
          'Source account has no available balance',
        );
      }

      if (transferAmount.gt(currentBalance)) {
        throw new BadRequestException(
          `Insufficient source account balance. Available balance: ${currentBalance.toFixed(4)}`,
        );
      }

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
