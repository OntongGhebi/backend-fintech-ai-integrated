export type AIIntent =
  | 'CREATE_TRANSACTION'
  | 'QUERY_BALANCE'
  | 'QUERY_TRANSACTIONS'
  | 'QUERY_BUDGET'
  | 'GENERAL_CHAT'
  | 'UNKNOWN';

export interface AIIntentClassification {
  intent: AIIntent;
  confidence: number;
}
