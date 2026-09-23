import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';

import { TransactionSource } from 'src/database/enums/transaction-source.enum';
import { TransactionType } from 'src/database/enums/transaction-type.enum';

type TransactionTypeValue = 'INCOME' | 'EXPENSE' | 'TRANSFER';

export interface CreateSystemTransactionParams {
  userId: string;
  accountId: string;
  categoryId?: string | null;
  type: TransactionTypeValue;
  amount: number | string | Prisma.Decimal;
  transactionDate: Date;
  description?: string | null;
  metadata?: Prisma.InputJsonValue | typeof Prisma.DbNull;

  /**
   * Used by recurring transactions to guarantee
   * idempotent system-generated transaction execution.
   */
  recurringTransactionId?: string | null;

  /**
   * Unique execution key for a recurring transaction occurrence.
   */
  recurringExecutionKey?: string | null;
}

@Injectable()
export class TransactionDomainService {
  async createSystemTransaction(
    tx: Prisma.TransactionClient,
    params: CreateSystemTransactionParams,
  ) {
    const account = await tx.account.findFirst({
      where: {
        id: params.accountId,
        userId: params.userId,
        deletedAt: null,
      },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (!account.isActive) {
      throw new BadRequestException('Account is inactive');
    }

    if (account.currency !== 'IDR') {
      throw new BadRequestException('Account currency must be IDR');
    }

    if (params.type === 'TRANSFER' && params.categoryId) {
      throw new BadRequestException(
        'Transfer transaction cannot have a category',
      );
    }

    if (params.categoryId) {
      await this.validateCategory(
        tx,
        params.categoryId,
        params.userId,
        params.type,
      );
    }

    return tx.transaction.create({
      data: {
        userId: params.userId,
        accountId: params.accountId,
        categoryId: params.categoryId ?? null,

        recurringTransactionId: params.recurringTransactionId ?? null,

        recurringExecutionKey: params.recurringExecutionKey ?? null,

        type: params.type as TransactionType,
        amount: params.amount,
        currency: 'IDR',
        description: params.description?.trim() || null,
        transactionDate: params.transactionDate,
        source: TransactionSource.SYSTEM,
        status: 'ACTIVE',
        transferGroupId: null,
        metadata: params.metadata ?? Prisma.DbNull,
      },
      include: {
        account: true,
        category: true,
      },
    });
  }

  private async validateCategory(
    tx: Prisma.TransactionClient,
    categoryId: string,
    userId: string,
    type: TransactionTypeValue,
  ) {
    const category = await tx.category.findFirst({
      where: {
        id: categoryId,
        userId,
        deletedAt: null,
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (!category.isActive) {
      throw new BadRequestException('Category is inactive');
    }

    if (type === 'INCOME' && category.type !== 'INCOME') {
      throw new BadRequestException(
        'Income transaction requires an income category',
      );
    }

    if (type === 'EXPENSE' && category.type !== 'EXPENSE') {
      throw new BadRequestException(
        'Expense transaction requires an expense category',
      );
    }

    if (type === 'TRANSFER') {
      throw new BadRequestException(
        'Transfer transaction cannot have a category',
      );
    }

    return category;
  }
}
