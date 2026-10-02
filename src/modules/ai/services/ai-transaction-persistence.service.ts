import { Injectable, BadRequestException } from '@nestjs/common';
import { TransactionSource } from 'src/database/enums/transaction-source.enum';
import { TransactionType } from 'src/database/enums/transaction-type.enum';
import { TransactionsService } from 'src/modules/transactions/transactions.service';
import { AITransactionConfirmation } from '../types/ai-transaction-confirmation.types';
import { AITransactionType } from '../types/ai-transaction.types';

export interface AITransactionPersistenceResult {
  type: AITransactionType;
  transaction?: unknown;
  transferGroupId?: string;
  transactions?: unknown[];
}

@Injectable()
export class AITransactionPersistenceService {
  constructor(private readonly transactionsService: TransactionsService) {}

  async create(
    userId: string,
    confirmation: AITransactionConfirmation,
    transactionDate: Date = new Date(),
  ): Promise<AITransactionPersistenceResult> {
    if (confirmation.status !== 'CONFIRMED') {
      throw new BadRequestException(
        'Transaction confirmation must be confirmed before persistence',
      );
    }

    const draft = confirmation.draft;

    if (!draft.ready || draft.status !== 'READY') {
      throw new BadRequestException(
        'Transaction draft is not ready for persistence',
      );
    }

    if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
      throw new BadRequestException(
        'Transaction amount must be greater than zero',
      );
    }

    if (!(transactionDate instanceof Date)) {
      throw new BadRequestException('Transaction date is invalid');
    }

    if (Number.isNaN(transactionDate.getTime())) {
      throw new BadRequestException('Transaction date is invalid');
    }

    if (draft.type === 'TRANSFER') {
      return this.createTransfer(userId, confirmation, transactionDate);
    }

    return this.createIncomeOrExpense(userId, confirmation, transactionDate);
  }

  private async createIncomeOrExpense(
    userId: string,
    confirmation: AITransactionConfirmation,
    transactionDate: Date,
  ): Promise<AITransactionPersistenceResult> {
    const draft = confirmation.draft;

    if (!draft.accountId) {
      throw new BadRequestException(
        'Account is required for transaction persistence',
      );
    }

    const type = this.mapTransactionType(draft.type);

    if (type !== TransactionType.INCOME && type !== TransactionType.EXPENSE) {
      throw new BadRequestException(
        'Invalid transaction type for standard transaction',
      );
    }

    const transaction = await this.transactionsService.create(
      userId,
      {
        accountId: draft.accountId,
        categoryId: draft.categoryId ?? undefined,
        type,
        amount: draft.amount,
        description: draft.description ?? undefined,
        transactionDate: transactionDate.toISOString(),
      },
      TransactionSource.AI,
    );

    return {
      type: draft.type,
      transaction,
    };
  }

  private async createTransfer(
    userId: string,
    confirmation: AITransactionConfirmation,
    transactionDate: Date,
  ): Promise<AITransactionPersistenceResult> {
    const draft = confirmation.draft;

    if (!draft.accountId) {
      throw new BadRequestException(
        'Source account is required for transfer persistence',
      );
    }

    if (!draft.destinationAccountId) {
      throw new BadRequestException(
        'Destination account is required for transfer persistence',
      );
    }

    if (draft.accountId === draft.destinationAccountId) {
      throw new BadRequestException(
        'Source and destination accounts must be different',
      );
    }

    const result = await this.transactionsService.createTransfer(
      userId,
      {
        sourceAccountId: draft.accountId,
        destinationAccountId: draft.destinationAccountId,
        amount: draft.amount,
        description: draft.description ?? undefined,
        transactionDate: transactionDate.toISOString(),
      },
      TransactionSource.AI,
    );

    return {
      type: 'TRANSFER',
      transferGroupId: result.transferGroupId,
      transactions: result.transactions,
    };
  }

  private mapTransactionType(type: AITransactionType): TransactionType {
    switch (type) {
      case 'INCOME':
        return TransactionType.INCOME;
      case 'EXPENSE':
        return TransactionType.EXPENSE;
      case 'TRANSFER':
        return TransactionType.TRANSFER;
      default:
        throw new BadRequestException('Unsupported AI transaction type');
    }
  }
}
