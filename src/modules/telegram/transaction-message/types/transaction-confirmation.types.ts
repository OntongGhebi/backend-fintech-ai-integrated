import { ResolvedTransactionIntent } from './resolved-transaction-intent.types';

export type TransactionConfirmationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'COMPLETED';

export interface CreateTransactionConfirmationInput {
  userId: string;
  chatId: string;
  sourceMessageId: string;
  telegramAccountId: string;
  telegramUserId: bigint;
  intent: ResolvedTransactionIntent;
}

export interface PendingTransactionConfirmation {
  id: string;
  userId: string;
  chatId: string;
  sourceMessageId: string;
  telegramAccountId: string;
  telegramUserId: bigint;
  intent: ResolvedTransactionIntent;
  status: TransactionConfirmationStatus;
  createdAt: Date;
  expiresAt: Date;
  transactionId?: string;
}
