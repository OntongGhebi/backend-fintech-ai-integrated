import {
  TelegramTransactionIntentType,
  TelegramTransactionIntentSource,
  TelegramTransactionType,
  TransactionIntent,
} from './transaction-intent.types';

export type TransactionIntentProcessingSource = 'DETERMINISTIC' | 'AI';

export interface ResolvedTransactionIntent {
  intent: TelegramTransactionIntentType;
  transactionType?: TelegramTransactionType;
  amount?: number;
  description?: string;

  /**
   * Account for a regular INCOME or EXPENSE transaction.
   */
  accountId?: string;

  /**
   * Accounts for a TRANSFER intent.
   */
  sourceAccountId?: string;
  destinationAccountId?: string;
  sourceAccountName?: string;
  destinationAccountName?: string;

  categoryId?: string;
  transactionDate?: Date;
  confidence?: number;
  source: TelegramTransactionIntentSource;
  processingSource?: TransactionIntentProcessingSource;
  originalIntent: TransactionIntent;
}
