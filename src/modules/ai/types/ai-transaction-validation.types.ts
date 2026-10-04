export interface AITransactionValidationResult<T> {
  valid: boolean;
  value?: T;
  reason?: string;
}

export type AITransactionValidationTarget =
  'INTENT' | 'ENTITIES' | 'RESOLUTION' | 'DRAFT';
