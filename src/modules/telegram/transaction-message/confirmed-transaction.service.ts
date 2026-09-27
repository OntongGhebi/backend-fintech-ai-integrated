import { BadRequestException, Injectable } from '@nestjs/common';

import { TransactionType } from 'src/database/enums/transaction-type.enum';

import { TransactionsService } from '../../transactions/transactions.service';
import { PendingTransactionConfirmation } from './transaction-confirmation.types';

@Injectable()
export class ConfirmedTransactionService {
  constructor(private readonly transactionsService: TransactionsService) {}

  async create(confirmation: PendingTransactionConfirmation) {
    if (
      confirmation.status !== 'CONFIRMED' &&
      confirmation.status !== 'PROCESSING'
    ) {
      throw new BadRequestException(
        'Transaction confirmation is not ready for processing',
      );
    }

    const { intent } = confirmation;

    if (intent.intent !== 'CREATE_TRANSACTION') {
      throw new BadRequestException(
        'Confirmation does not contain a transaction intent',
      );
    }

    if (!intent.transactionType) {
      throw new BadRequestException('Transaction type is required');
    }

    if (
      intent.transactionType !== 'INCOME' &&
      intent.transactionType !== 'EXPENSE'
    ) {
      throw new BadRequestException('Unsupported transaction type');
    }

    if (intent.amount === undefined || intent.amount <= 0) {
      throw new BadRequestException(
        'Transaction amount must be greater than zero',
      );
    }

    if (!intent.accountId) {
      throw new BadRequestException('Transaction account is required');
    }

    const type = this.mapTransactionType(intent.transactionType);

    return this.transactionsService.create(confirmation.userId, {
      accountId: intent.accountId,
      categoryId: intent.categoryId,
      type,
      amount: intent.amount,
      currency: 'IDR',
      description: intent.description?.trim() || undefined,
      transactionDate: (intent.transactionDate ?? new Date()).toISOString(),
    });
  }

  private mapTransactionType(type: 'INCOME' | 'EXPENSE'): TransactionType {
    switch (type) {
      case 'INCOME':
        return TransactionType.INCOME;

      case 'EXPENSE':
        return TransactionType.EXPENSE;

      default:
        throw new BadRequestException('Unsupported transaction type');
    }
  }
}
