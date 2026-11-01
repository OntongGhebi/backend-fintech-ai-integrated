import { BadRequestException, Injectable } from '@nestjs/common';

import { TransactionType } from 'src/database/enums/transaction-type.enum';
import { TransactionSource } from 'src/database/enums/transaction-source.enum';
import { TransactionsService } from '../../../transactions/transactions.service';
import { CreateTransferDto } from '../../../transactions/dto/create-transfer.dto';
import { PendingTransactionConfirmation } from '../types/transaction-confirmation.types';

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

    if (
      intent.amount === undefined ||
      !Number.isFinite(intent.amount) ||
      intent.amount <= 0
    ) {
      throw new BadRequestException(
        'Transaction amount must be greater than zero',
      );
    }

    if (intent.intent === 'TRANSFER') {
      if (!intent.sourceAccountId || !intent.destinationAccountId) {
        throw new BadRequestException(
          'Source and destination accounts are required for a transfer',
        );
      }

      if (intent.sourceAccountId === intent.destinationAccountId) {
        throw new BadRequestException(
          'Source and destination accounts must be different',
        );
      }

      const dto: CreateTransferDto = {
        sourceAccountId: intent.sourceAccountId,
        destinationAccountId: intent.destinationAccountId,
        amount: intent.amount,
        description: intent.description?.trim() || 'Transfer antar rekening',
        transactionDate: new Date(
          intent.transactionDate ?? new Date(),
        ).toISOString(),
      };

      return this.transactionsService.createTransfer(
        confirmation.userId,
        dto,
        TransactionSource.TELEGRAM,
      );
    }

    if (intent.intent !== 'CREATE_TRANSACTION') {
      throw new BadRequestException(
        'Confirmation does not contain a supported transaction intent',
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

    if (!intent.accountId) {
      throw new BadRequestException('Transaction account is required');
    }

    return this.transactionsService.createTelegramConfirmedTransaction({
      userId: confirmation.userId,
      confirmationId: confirmation.id,
      accountId: intent.accountId,
      categoryId: intent.categoryId,
      type: this.mapTransactionType(intent.transactionType),
      amount: intent.amount,
      description: intent.description?.trim() || null,
      transactionDate: new Date(intent.transactionDate ?? new Date()),
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
