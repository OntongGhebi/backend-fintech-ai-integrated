import { ResolvedTransactionIntent } from './resolved-transaction-intent.types';

export type TransactionIntentResolutionStatus =
  'RESOLVED' | 'NEEDS_ACCOUNT' | 'NEEDS_CATEGORY' | 'NOT_FOUND' | 'INVALID';

export interface TransactionIntentResolutionResult {
  status: TransactionIntentResolutionStatus;
  intent?: ResolvedTransactionIntent;
  message?: string;
}
