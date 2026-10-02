import { AITransactionDraft } from './ai-transaction-draft.types';

export type AITransactionConfirmationStatus =
  'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export type AITransactionConfirmationAction = 'CONFIRM' | 'CANCEL';

export interface AITransactionConfirmation {
  id: string;
  draft: AITransactionDraft;
  status: AITransactionConfirmationStatus;
  createdAt: Date;
  expiresAt: Date;
}

export interface AITransactionConfirmationResult {
  confirmation: AITransactionConfirmation;
  message: string;
}

export interface AITransactionConfirmationActionResult {
  confirmation: AITransactionConfirmation;
  action: AITransactionConfirmationAction;
  message: string;
}
