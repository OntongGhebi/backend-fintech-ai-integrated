import { BadRequestException, Injectable } from '@nestjs/common';

import { TransactionType } from 'src/database/enums/transaction-type.enum';
import { TransactionsService } from 'src/modules/transactions/transactions.service';
import { PendingTransactionConfirmation } from './transaction-confirmation.types';

@Injectable()
export class ConfirmedTransactionService {
  constructor(private readonly transactionsService: TransactionsService) {}

  async create(confirmation: PendingTransactionConfirmation) {
    if (confirmation.status !== 'CONFIRMED') {
      throw new BadRequestException(
        'Transaction confirmation must be confirmed before creating a transaction',
      );
    }

    const { intent } = confirmation;

    if (intent.intent !== 'CREATE_TRANSACTION') {
      throw new BadRequestException('Unsupported transaction intent');
    }

    if (!intent.transactionType) {
      throw new BadRequestException('Transaction type is required');
    }

    if (intent.amount === undefined || intent.amount <= 0) {
      throw new BadRequestException('Transaction amoun is invalid');
    }

    if (!intent.accountId) {
      throw new BadRequestException('Transaction account is required');
    }

    const transactionType = this.mapTransactionType(intent.transactionType);

    return this.transactionsService.create(confirmation.userId, {
      accountId: intent.accountId,
      categoryId: intent.categoryId,
      type: transactionType,
      amount: intent.amount,
      currency: 'IDR',
      description: intent.description,
      transactionDate:
        intent.transactionDate?.toISOString() ?? new Date().toISOString(),
    });
  }

  private mapTransactionType(
    transactionType: 'INCOME' | 'EXPENSE',
  ): TransactionType {
    switch (transactionType) {
      case 'INCOME':
        return TransactionType.INCOME;

      case 'EXPENSE':
        return TransactionType.EXPENSE;

      default:
        throw new BadRequestException('Unsupported transaction type');
    }
  }
}
