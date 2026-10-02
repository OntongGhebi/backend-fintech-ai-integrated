import {
  TelegramTransactionIntentType,
  TelegramTransactionIntentSource,
  TelegramTransactionType,
  TransactionIntent,
} from './transaction-intent.types';

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
  originalIntent: TransactionIntent;
}
