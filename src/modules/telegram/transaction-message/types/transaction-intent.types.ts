export type TelegramTransactionIntentType =
  'CREATE_TRANSACTION' | 'TRANSFER' | 'QUERY_FINANCIAL_DATA' | 'UNKNOWN';

export type TelegramTransactionType = 'INCOME' | 'EXPENSE';

export type TelegramTransactionIntentSource = 'DETERMINISTIC' | 'AI';

export interface TransactionIntent {
  intent: TelegramTransactionIntentType;
  transactionType?: TelegramTransactionType;
  amount?: number;
  description?: string;

  categoryHint?: string;
  accountHint?: string;

  /**
   * Used only for TRANSFER intents.
   */
  sourceAccountHint?: string;
  destinationAccountHint?: string;

  transactionDate?: Date;
  confidence?: number;
  source: TelegramTransactionIntentSource;
}
