export type AITransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER';
export interface AITransactionEntities {
  type: AITransactionType;
  amount: number;
  description: string | null;
  accountHint: string | null;
  categoryHint: string | null;
  destinationAccountHint: string | null;
}
