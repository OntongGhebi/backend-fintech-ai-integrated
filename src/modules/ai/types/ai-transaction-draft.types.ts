import { AITransactionType } from './ai-transaction.types';

export type AITransactionDraftStatus = 'READY' | 'NEEDS_RESOLUTION';

export type AITransactionDraftUnresolvedField =
  'account' | 'destinationAccount' | 'category';

export interface AITransactionDraft {
  type: AITransactionType;
  amount: number;
  description: string | null;
  accountId: string | null;
  categoryId: string | null;
  destinationAccountId: string | null;
  currency: 'IDR';
  status: AITransactionDraftStatus;
  ready: boolean;
  unresolvedFields: AITransactionDraftUnresolvedField[];
}
