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
  accountId?: string;
  categoryId?: string;
  transactionDate?: Date;
  confidence?: number;
  source: TelegramTransactionIntentSource;
  processingSource?: TransactionIntentProcessingSource;
  originalIntent: TransactionIntent;
}
