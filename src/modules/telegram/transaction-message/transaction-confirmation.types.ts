import { ResolvedTransactionIntent } from './resolved-transaction-intent.types';

export type TransactionConfirmationStatus =
  'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export interface PendingTransactionConfirmation {
  id: string;
  userId: string;
  telegramAccountId: string;
  telegramUserId: string;
  chatId: string;
  sourceMessageId: string;
  intent: ResolvedTransactionIntent;
  status: TransactionConfirmationStatus;
  createdAt: Date;
  expiresAt: Date;
}

export type TransactionConfirmationAction = 'CONFIRM' | 'CANCEL' | 'UNKNOWN';
